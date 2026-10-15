-- ============================================================================
-- Super admin dashboard: user management, overview, analytics, audit search, settings.
-- Everything here is called by the service role after the API has checked the admin's role.
-- ============================================================================

-- Suspend or reactivate a member -------------------------------------------------
create function public.admin_set_user_status(
  p_admin_id uuid, p_user_id uuid, p_status public.account_status, p_reason text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a public.admin_users; u public.users; v_old public.account_status;
begin
  select * into a from public.admin_users
   where id = p_admin_id and is_active and deleted_at is null and role in ('super_admin', 'admin');
  if not found then raise exception 'NOT_AUTHORIZED'; end if;

  if p_status not in ('active', 'suspended') then raise exception 'VALIDATION_ERROR'; end if;
  if p_user_id = a.user_id then raise exception 'CANNOT_MODIFY_SELF'; end if;

  select * into u from public.users where id = p_user_id and deleted_at is null for update;
  if not found then raise exception 'USER_NOT_FOUND'; end if;
  if u.status = 'closed' then raise exception 'VALIDATION_ERROR'; end if;

  -- Only a super admin may change another admin.
  if a.role <> 'super_admin' and exists (
       select 1 from public.admin_users where user_id = p_user_id and is_active and deleted_at is null) then
    raise exception 'NOT_AUTHORIZED';
  end if;

  if p_status = 'suspended' and length(btrim(coalesce(p_reason, ''))) < 5 then raise exception 'REASON_REQUIRED'; end if;
  if u.status = p_status then return jsonb_build_object('id', u.id, 'status', u.status, 'changed', false); end if;

  v_old := u.status;
  update public.users set status = p_status where id = u.id returning * into u;

  perform public.write_audit('admin', null, a.id,
    case when p_status = 'suspended' then 'user.suspended' else 'user.reactivated' end,
    'users', u.id, jsonb_build_object('status', v_old),
    jsonb_build_object('status', u.status, 'reason', nullif(btrim(coalesce(p_reason, '')), '')));

  perform public.push_notification(u.id, 'security',
    case when p_status = 'suspended' then 'Account suspended' else 'Account reactivated' end,
    case when p_status = 'suspended' then 'Your account has been suspended. Contact support if you think this is a mistake.'
         else 'Your account is active again.' end,
    '{}'::jsonb);

  return jsonb_build_object('id', u.id, 'status', u.status, 'changed', true);
end;
$$;

-- User search. Pass an email, a name, or a full user id. ----------------------------
create function public.admin_search_users(
  p_search text default null, p_status text default null, p_limit integer default 20, p_offset integer default 0
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_term text := nullif(btrim(coalesce(p_search, '')), ''); v_pat text; v_total integer; v_rows jsonb;
begin
  v_pat := case when v_term is null then null
           else '%' || replace(replace(replace(v_term, '\', '\\'), '%', '\%'), '_', '\_') || '%' end;

  select count(*) into v_total from public.users u
   where u.deleted_at is null
     and (p_status is null or u.status::text = p_status)
     and (v_pat is null or u.email::text ilike v_pat or u.full_name ilike v_pat or u.id::text = v_term);

  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc, x.id), '[]'::jsonb) into v_rows from (
    select u.id, u.email::text as email, u.full_name, u.status, u.created_at,
           (select w.currency from public.wallets w where w.user_id = u.id and w.deleted_at is null order by w.created_at limit 1) as currency,
           (select w.balance  from public.wallets w where w.user_id = u.id and w.deleted_at is null order by w.created_at limit 1) as balance,
           (select count(*) from public.user_packages up where up.user_id = u.id and up.status = 'active' and up.deleted_at is null) as active_packages,
           exists (select 1 from public.admin_users a where a.user_id = u.id and a.is_active and a.deleted_at is null) as is_admin
      from public.users u
     where u.deleted_at is null
       and (p_status is null or u.status::text = p_status)
       and (v_pat is null or u.email::text ilike v_pat or u.full_name ilike v_pat or u.id::text = v_term)
     order by u.created_at desc, u.id
     limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0)
  ) x;

  return jsonb_build_object('total', v_total, 'rows', v_rows);
end;
$$;

create function public.admin_user_detail(p_user_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare u record;
begin
  select id, email::text as email, full_name, phone, status, date_of_birth, guardian_consent_at, created_at,
         bank_name, right(account_number, 4) as account_last4
    into u from public.users where id = p_user_id and deleted_at is null;
  if not found then raise exception 'USER_NOT_FOUND'; end if;

  return jsonb_build_object(
    'user', to_jsonb(u),
    'is_admin', exists (select 1 from public.admin_users where user_id = p_user_id and is_active and deleted_at is null),
    'wallets', (select coalesce(jsonb_agg(jsonb_build_object('id', w.id, 'currency', w.currency, 'balance', w.balance) order by w.created_at), '[]'::jsonb)
                  from public.wallets w where w.user_id = p_user_id and w.deleted_at is null),
    'totals', (select jsonb_build_object(
                 'deposits',  coalesce(sum(amount) filter (where type = 'deposit'), 0),
                 'withdrawals', coalesce(sum(amount) filter (where type = 'withdrawal'), 0),
                 'profit',    coalesce(sum(amount) filter (where type = 'earning'), 0),
                 'purchases', coalesce(sum(amount) filter (where type = 'package_purchase'), 0))
                 from public.wallet_transactions where user_id = p_user_id),
    'active_packages', (select count(*) from public.user_packages where user_id = p_user_id and status = 'active' and deleted_at is null));
end;
$$;

create function public.admin_user_transactions(
  p_user_id uuid, p_type public.txn_type default null, p_limit integer default 20,
  p_before timestamptz default null, p_before_id uuid default null
) returns setof public.wallet_transactions
language sql stable security definer set search_path = public as $$
  select * from public.wallet_transactions
   where user_id = p_user_id and (p_type is null or type = p_type)
     and (p_before is null or (created_at, id) < (p_before, p_before_id))
   order by created_at desc, id desc
   limit least(greatest(p_limit, 1), 101);
$$;

-- Overview numbers for one currency ----------------------------------------------------
create function public.admin_overview(p_currency text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_cur text; v_users jsonb; v_pk jsonb; v_wd jsonb; v_flows jsonb; v_bal numeric;
begin
  v_cur := upper(coalesce(nullif(btrim(p_currency), ''), public.get_setting('default_currency') #>> '{}', 'USD'));

  select jsonb_build_object('total', count(*), 'active', count(*) filter (where status = 'active'),
           'suspended', count(*) filter (where status = 'suspended'),
           'new_7d', count(*) filter (where created_at > now() - interval '7 days'))
    into v_users from public.users where deleted_at is null;

  select coalesce(sum(balance), 0) into v_bal from public.wallets where currency = v_cur and deleted_at is null;

  select jsonb_build_object('active', count(*), 'invested', coalesce(sum(up.amount), 0)) into v_pk
    from public.user_packages up join public.packages p on p.id = up.package_id
   where up.status = 'active' and up.deleted_at is null and p.currency = v_cur;

  select jsonb_build_object(
           'pending_count',  count(*) filter (where wd.status = 'pending'),
           'pending_amount', coalesce(sum(wd.amount) filter (where wd.status = 'pending'), 0),
           'approved_count',  count(*) filter (where wd.status = 'approved'),
           'approved_amount', coalesce(sum(wd.amount) filter (where wd.status = 'approved'), 0))
    into v_wd from public.withdrawals wd join public.wallets w on w.id = wd.wallet_id
   where wd.deleted_at is null and w.currency = v_cur;

  select jsonb_build_object(
           'deposits',    coalesce(sum(t.amount) filter (where t.type = 'deposit'), 0),
           'withdrawals', coalesce(sum(t.amount) filter (where t.type = 'withdrawal'), 0),
           'profit',      coalesce(sum(t.amount) filter (where t.type = 'earning'), 0),
           'purchases',   coalesce(sum(t.amount) filter (where t.type = 'package_purchase'), 0))
    into v_flows from public.wallet_transactions t join public.wallets w on w.id = t.wallet_id
   where w.currency = v_cur and t.created_at > now() - interval '30 days';

  return jsonb_build_object(
    'currency', v_cur,
    'currencies', (select coalesce(jsonb_agg(distinct currency), '[]'::jsonb) from public.wallets where deleted_at is null),
    'users', v_users, 'wallet_balance', v_bal, 'packages', v_pk, 'withdrawals', v_wd, 'flows_30d', v_flows);
end;
$$;

-- Daily money flow for the analytics page ---------------------------------------------------
create function public.admin_financials(p_days integer default 30, p_currency text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_cur text; v_days integer := least(greatest(coalesce(p_days, 30), 1), 365);
begin
  v_cur := upper(coalesce(nullif(btrim(p_currency), ''), public.get_setting('default_currency') #>> '{}', 'USD'));

  return jsonb_build_object('currency', v_cur, 'days', v_days, 'series', (
    select coalesce(jsonb_agg(jsonb_build_object(
             'day', d::date, 'deposits', coalesce(x.deposits, 0), 'withdrawals', coalesce(x.withdrawals, 0),
             'purchases', coalesce(x.purchases, 0), 'profit', coalesce(x.profit, 0), 'refunds', coalesce(x.refunds, 0)
           ) order by d), '[]'::jsonb)
      from generate_series((current_date - (v_days - 1))::timestamp, current_date::timestamp, interval '1 day') d
      left join (
        select date_trunc('day', t.created_at)::date as day,
               sum(t.amount) filter (where t.type = 'deposit') as deposits,
               sum(t.amount) filter (where t.type = 'withdrawal') as withdrawals,
               sum(t.amount) filter (where t.type = 'package_purchase') as purchases,
               sum(t.amount) filter (where t.type = 'earning') as profit,
               sum(t.amount) filter (where t.type = 'refund') as refunds
          from public.wallet_transactions t join public.wallets w on w.id = t.wallet_id
         where w.currency = v_cur and t.created_at >= current_date - (v_days - 1)
         group by 1
      ) x on x.day = d::date));
end;
$$;

-- Audit log search (newest first, keyset paging) -----------------------------------------------
create function public.admin_audit_logs(
  p_action text default null, p_limit integer default 30,
  p_before timestamptz default null, p_before_id uuid default null
) returns setof public.audit_logs
language sql stable security definer set search_path = public as $$
  select * from public.audit_logs
   where (p_action is null or starts_with(action, p_action))
     and (p_before is null or (created_at, id) < (p_before, p_before_id))
   order by created_at desc, id desc
   limit least(greatest(p_limit, 1), 101);
$$;

-- Settings: adds maintenance_mode (on or off) to the list from 0014 --------------------------------
create or replace function public.admin_update_setting(p_admin_id uuid, p_key text, p_value jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_num numeric; v_old jsonb; s public.settings;
begin
  if not exists (select 1 from public.admin_users
                  where id = p_admin_id and is_active and deleted_at is null and role in ('super_admin', 'admin')) then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if p_key not in ('min_withdrawal_amount', 'withdrawal_cooldown_days', 'withdrawal_fee_percent', 'maintenance_mode') then
    raise exception 'SETTING_NOT_EDITABLE';
  end if;

  if p_key = 'maintenance_mode' then
    if jsonb_typeof(p_value) <> 'boolean' then raise exception 'VALIDATION_ERROR'; end if;
  else
    if jsonb_typeof(p_value) <> 'number' then raise exception 'VALIDATION_ERROR'; end if;
    v_num := (p_value #>> '{}')::numeric;
    if (p_key = 'min_withdrawal_amount' and (v_num < 0 or v_num > 1000000))
       or (p_key = 'withdrawal_cooldown_days' and (v_num < 0 or v_num > 90 or v_num <> trunc(v_num)))
       or (p_key = 'withdrawal_fee_percent' and (v_num < 0 or v_num > 50)) then
      raise exception 'VALIDATION_ERROR';
    end if;
  end if;

  select value into v_old from public.settings where key = p_key and deleted_at is null for update;
  update public.settings set value = p_value, updated_by = p_admin_id
   where key = p_key and deleted_at is null returning * into s;
  if not found then
    insert into public.settings (key, value, is_public, updated_by) values (p_key, p_value, true, p_admin_id) returning * into s;
  end if;

  perform public.write_audit('admin', null, p_admin_id, 'setting.updated', 'settings', s.id,
    jsonb_build_object('key', p_key, 'value', v_old), jsonb_build_object('key', p_key, 'value', p_value));
  return jsonb_build_object('key', p_key, 'value', p_value);
end;
$$;

revoke all on function
  public.admin_set_user_status, public.admin_search_users, public.admin_user_detail, public.admin_user_transactions,
  public.admin_overview, public.admin_financials, public.admin_audit_logs
  from public, anon, authenticated;
grant execute on function
  public.admin_set_user_status, public.admin_search_users, public.admin_user_detail, public.admin_user_transactions,
  public.admin_overview, public.admin_financials, public.admin_audit_logs
  to service_role;
