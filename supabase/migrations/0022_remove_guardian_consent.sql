-- Guardian consent is no longer part of account or withdrawal eligibility.

create or replace function public.audit_user_sensitive_changes() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_bank boolean;
begin
  if current_setting('app.account_anonymization', true) = 'on' then return new; end if;

  v_bank := (new.bank_name, new.account_number, new.account_name) is distinct from (old.bank_name, old.account_number, old.account_name);
  if v_bank or new.date_of_birth is distinct from old.date_of_birth then
    perform public.write_audit(
      case when auth.uid() is not null then 'user' else 'system' end, auth.uid(), null,
      case when v_bank then 'user.bank_details_changed' else 'user.sensitive_changed' end,
      'users', new.id,
      jsonb_build_object('bank_name', old.bank_name, 'account_last4', right(old.account_number, 4),
                         'date_of_birth', old.date_of_birth),
      jsonb_build_object('bank_name', new.bank_name, 'account_last4', right(new.account_number, 4),
                         'date_of_birth', new.date_of_birth));
  end if;

  if v_bank and old.account_number is not null then
    perform public.push_notification(new.id, 'security', 'Bank details changed',
      'The bank details used for withdrawals were changed. If this was not you, change your password now and contact support.', '{}'::jsonb);
  end if;
  return new;
end;
$$;

create or replace function public.admin_delete_user(p_admin_id uuid, p_user_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_admin public.admin_users; v_user public.users; v_deleted_at timestamptz := now();
begin
  select * into v_admin from public.admin_users
   where id = p_admin_id and is_active and deleted_at is null and role in ('super_admin', 'admin');
  if not found then raise exception 'NOT_AUTHORIZED'; end if;
  if v_admin.user_id = p_user_id then raise exception 'CANNOT_MODIFY_SELF'; end if;
  if exists (select 1 from public.admin_users where user_id = p_user_id and is_active and deleted_at is null) then
    raise exception 'USER_IS_ADMIN';
  end if;

  select * into v_user from public.users where id = p_user_id and deleted_at is null for update;
  if not found then raise exception 'USER_NOT_FOUND'; end if;

  perform set_config('app.account_anonymization', 'on', true);
  update public.users set
    email = 'deleted+' || p_user_id::text || '@redacted.invalid',
    full_name = 'Deleted member',
    username = null,
    avatar_url = null,
    phone = null,
    country_code = null,
    date_of_birth = null,
    bank_name = null,
    account_number = null,
    account_name = null,
    referral_code = upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
    status = 'closed',
    deleted_at = v_deleted_at,
    updated_at = v_deleted_at
   where id = p_user_id;

  perform public.write_audit('admin', null, p_admin_id, 'user.deleted', 'users', p_user_id,
    jsonb_build_object('status', v_user.status),
    jsonb_build_object('status', 'closed', 'deleted_at', v_deleted_at));

  return jsonb_build_object('id', p_user_id, 'deleted', true);
end;
$$;

create or replace function public.admin_user_detail(p_user_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare u record;
begin
  select id, email::text as email, full_name, phone, status, date_of_birth, created_at,
         bank_name, right(account_number, 4) as account_last4
    into u from public.users where id = p_user_id and deleted_at is null;
  if not found then raise exception 'USER_NOT_FOUND'; end if;

  return jsonb_build_object(
    'user', to_jsonb(u),
    'is_admin', exists (select 1 from public.admin_users where user_id = p_user_id and is_active and deleted_at is null),
    'wallets', (select coalesce(jsonb_agg(jsonb_build_object('id', w.id, 'currency', w.currency, 'balance', w.balance) order by w.created_at), '[]'::jsonb)
                  from public.wallets w where w.user_id = p_user_id and w.deleted_at is null),
    'totals', (select jsonb_build_object(
                 'deposits', coalesce(sum(amount) filter (where type = 'deposit'), 0),
                 'withdrawals', coalesce(sum(amount) filter (where type = 'withdrawal'), 0),
                 'profit', coalesce(sum(amount) filter (where type = 'earning'), 0),
                 'purchases', coalesce(sum(amount) filter (where type = 'package_purchase'), 0))
                 from public.wallet_transactions where user_id = p_user_id),
    'active_packages', (select count(*) from public.user_packages where user_id = p_user_id and status = 'active' and deleted_at is null));
end;
$$;

create or replace function public.withdrawal_eligibility(p_user_id uuid, p_currency text default 'NGN') returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  w public.wallets; u record; v_cur text := upper(p_currency);
  v_min numeric; v_fee numeric; v_cooldown integer;
  v_earned numeric(14,2); v_reserved numeric(14,2); v_available numeric(14,2);
  v_last timestamptz; v_next timestamptz; v_blocked text;
  v_qualified_referrals integer; v_referrals_required integer := 10;
begin
  select * into w from public.wallets where user_id = p_user_id and currency = v_cur and deleted_at is null;
  if not found then raise exception 'WALLET_NOT_FOUND'; end if;
  v_min := coalesce((public.get_setting('min_withdrawal_amount') #>> '{}')::numeric, 0);
  v_fee := coalesce((public.get_setting('withdrawal_fee_percent') #>> '{}')::numeric, 0);
  v_cooldown := coalesce((public.get_setting('withdrawal_cooldown_days') #>> '{}')::integer, 7);
  select count(*) into v_qualified_referrals from public.referrals where referrer_id = p_user_id and status = 'qualified';
  select coalesce(sum(amount), 0) into v_earned from public.wallet_transactions where wallet_id = w.id and type = 'earning';
  select coalesce(sum(amount), 0), max(created_at) into v_reserved, v_last
    from public.withdrawals where wallet_id = w.id and deleted_at is null and status in ('pending', 'approved', 'processing', 'paid');
  v_available := greatest(0, least(w.balance, v_earned - v_reserved));
  v_next := case when v_last is null or v_cooldown <= 0 then null else v_last + make_interval(days => v_cooldown) end;
  select status, date_of_birth into u from public.users where id = p_user_id and deleted_at is null;
  v_blocked := case
    when not found or u.status <> 'active' then 'ACCOUNT_RESTRICTED'
    when coalesce(public.get_setting('maintenance_mode') = 'true'::jsonb, false) then 'MAINTENANCE_MODE'
    when u.date_of_birth is null then 'PROFILE_INCOMPLETE'
    when v_qualified_referrals < v_referrals_required then 'REFERRALS_REQUIRED'
    when v_next is not null and v_next > now() then 'WITHDRAWAL_COOLDOWN'
    when v_available <= 0 or v_available < v_min then 'NO_PROFIT_AVAILABLE'
    else null end;
  return jsonb_build_object(
    'currency', v_cur, 'wallet_balance', w.balance, 'total_profit_earned', v_earned,
    'profit_reserved', v_reserved, 'available_profit', v_available, 'min_amount', v_min,
    'fee_percent', v_fee, 'cooldown_days', v_cooldown, 'last_request_at', v_last,
    'next_eligible_at', case when v_next > now() then v_next else null end,
    'qualified_referrals', v_qualified_referrals, 'required_referrals', v_referrals_required,
    'can_request', v_blocked is null, 'blocked_by', v_blocked);
end;
$$;

update public.settings set deleted_at = now(), updated_at = now()
 where key = 'guardian_consent_under_age' and deleted_at is null;

alter table public.users drop constraint if exists users_consent_needs_guardian;
alter table public.users drop column if exists guardian_email;
alter table public.users drop column if exists guardian_consent_at;
