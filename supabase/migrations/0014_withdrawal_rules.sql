-- ============================================================================
-- Withdrawals: profit only, once per cooldown, admin approval, configurable minimum.
-- Replaces wallet_request_withdrawal from 0009 (same signature, same grants).
-- ============================================================================

insert into public.settings (key, value, description, is_public) values
  ('withdrawal_cooldown_days', '7', 'A member can request one withdrawal every this many days. 0 turns the limit off.', true)
on conflict (key) where deleted_at is null do nothing;

-- Only finance staff and admins may review withdrawals ---------------------------
create function public.assert_finance_admin(p_admin_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.admin_users
     where id = p_admin_id and is_active and deleted_at is null and role in ('super_admin', 'admin', 'finance')
  ) then
    raise exception 'NOT_AUTHORIZED';
  end if;
end;
$$;

-- What can this member withdraw right now, and if not, why not? -----------------------
-- Profit balance = profit credited so far, minus profit already requested (not rejected),
-- and never more than the wallet holds (profit may have been spent on packages).
create function public.withdrawal_eligibility(p_user_id uuid, p_currency text default 'USD') returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  w public.wallets; u record; v_cur text := upper(p_currency);
  v_min numeric; v_fee numeric; v_cooldown integer; v_consent_age integer;
  v_earned numeric(14,2); v_reserved numeric(14,2); v_available numeric(14,2);
  v_last timestamptz; v_next timestamptz; v_blocked text;
begin
  select * into w from public.wallets where user_id = p_user_id and currency = v_cur and deleted_at is null;
  if not found then raise exception 'WALLET_NOT_FOUND'; end if;

  v_min          := coalesce((public.get_setting('min_withdrawal_amount') #>> '{}')::numeric, 0);
  v_fee          := coalesce((public.get_setting('withdrawal_fee_percent') #>> '{}')::numeric, 0);
  v_cooldown     := coalesce((public.get_setting('withdrawal_cooldown_days') #>> '{}')::integer, 7);
  v_consent_age  := coalesce((public.get_setting('guardian_consent_under_age') #>> '{}')::integer, 18);

  select coalesce(sum(amount), 0) into v_earned
    from public.wallet_transactions where wallet_id = w.id and type = 'earning';

  select coalesce(sum(amount), 0), max(created_at) into v_reserved, v_last
    from public.withdrawals
   where wallet_id = w.id and deleted_at is null and status in ('pending', 'approved', 'processing', 'paid');

  v_available := greatest(0, least(w.balance, v_earned - v_reserved));
  v_next := case when v_last is null or v_cooldown <= 0 then null else v_last + make_interval(days => v_cooldown) end;

  select status, date_of_birth, guardian_consent_at into u
    from public.users where id = p_user_id and deleted_at is null;

  v_blocked := case
    when not found or u.status <> 'active' then 'ACCOUNT_RESTRICTED'
    when coalesce(public.get_setting('maintenance_mode') = 'true'::jsonb, false) then 'MAINTENANCE_MODE'
    when u.date_of_birth is null then 'PROFILE_INCOMPLETE'
    when u.date_of_birth > (current_date - make_interval(years => v_consent_age))::date
         and u.guardian_consent_at is null then 'GUARDIAN_CONSENT_REQUIRED'
    when v_next is not null and v_next > now() then 'WITHDRAWAL_COOLDOWN'
    when v_available <= 0 or v_available < v_min then 'NO_PROFIT_AVAILABLE'
    else null end;

  return jsonb_build_object(
    'currency', v_cur,
    'wallet_balance', w.balance,
    'total_profit_earned', v_earned,
    'profit_reserved', v_reserved,
    'available_profit', v_available,
    'min_amount', v_min,
    'fee_percent', v_fee,
    'cooldown_days', v_cooldown,
    'last_request_at', v_last,
    'next_eligible_at', case when v_next > now() then v_next else null end,
    'can_request', v_blocked is null,
    'blocked_by', v_blocked);
end;
$$;

-- 1 to 4: request, validate rules, create a pending request, notify admins ---------------
create or replace function public.wallet_request_withdrawal(
  p_user_id uuid, p_currency text, p_amount numeric, p_method text,
  p_destination jsonb, p_idempotency_key text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  w public.wallets; t public.wallet_transactions; wd public.withdrawals; e jsonb; v_blocked text;
  v_id uuid := gen_random_uuid(); v_cur text := upper(p_currency); v_fee numeric(14,2); v_email text;
begin
  if coalesce(p_idempotency_key, '') = '' then raise exception 'IDEMPOTENCY_KEY_REQUIRED'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'INVALID_AMOUNT'; end if;

  -- Locking the wallet makes a member's requests run one at a time, so the 7 day rule
  -- and the profit limit cannot be beaten by two requests sent together.
  select * into w from public.wallets
   where user_id = p_user_id and currency = v_cur and deleted_at is null for update;
  if not found then raise exception 'WALLET_NOT_FOUND'; end if;

  select * into t from public.wallet_transactions where idempotency_key = p_idempotency_key;
  if found then
    select * into wd from public.withdrawals where hold_txn_id = t.id;
    return jsonb_build_object('withdrawal', to_jsonb(wd), 'transaction', to_jsonb(t), 'replayed', true);
  end if;

  -- 2. Validate the rules.
  e := public.withdrawal_eligibility(p_user_id, v_cur);
  v_blocked := e ->> 'blocked_by';
  if v_blocked is not null and v_blocked <> 'NO_PROFIT_AVAILABLE' then raise exception '%', v_blocked; end if;
  if p_amount < (e ->> 'min_amount')::numeric then raise exception 'BELOW_MIN_WITHDRAWAL'; end if;
  if p_amount > (e ->> 'available_profit')::numeric then raise exception 'EXCEEDS_PROFIT_BALANCE'; end if;

  v_fee := round(p_amount * (e ->> 'fee_percent')::numeric / 100, 2);

  -- 3. Hold the money and create the pending request. Nothing is paid out until an admin approves.
  t := public.post_wallet_transaction(w.id, 'withdrawal', 'debit', p_amount,
         'withdrawal', v_id, p_idempotency_key, 'Withdrawal request',
         jsonb_build_object('method', p_method));

  insert into public.withdrawals (id, user_id, wallet_id, amount, fee, method, destination, hold_txn_id)
  values (v_id, p_user_id, w.id, p_amount, v_fee, p_method, p_destination, t.id)
  returning * into wd;

  perform public.write_audit('user', p_user_id, null, 'wallet.withdrawal_requested', 'withdrawals', wd.id, null,
    jsonb_build_object('amount', p_amount, 'fee', v_fee, 'method', p_method,
                       'available_profit_before', e -> 'available_profit', 'balance_after', t.balance_after));

  perform public.push_notification(p_user_id, 'withdrawal', 'Withdrawal requested',
    format('Your request for %s %s is waiting for review.', p_amount, v_cur),
    jsonb_build_object('withdrawal_id', wd.id));

  -- 4. Tell every active admin who can review it.
  select email into v_email from public.users where id = p_user_id;
  insert into public.notifications (user_id, type, title, body, data)
  select a.user_id, 'withdrawal', 'Withdrawal awaiting review',
         format('%s requested %s %s.', v_email, p_amount, v_cur),
         jsonb_build_object('withdrawal_id', wd.id, 'user_id', p_user_id)
    from public.admin_users a
    join public.users au on au.id = a.user_id and au.deleted_at is null
   where a.is_active and a.deleted_at is null and a.role in ('super_admin', 'admin', 'finance');

  return jsonb_build_object('withdrawal', to_jsonb(wd), 'transaction', to_jsonb(t), 'replayed', false);
end;
$$;

-- Admin decision. Reject returns the held money to the member's wallet. ---------------------
create function public.withdrawal_review(
  p_admin_id uuid, p_withdrawal_id uuid, p_decision text, p_reason text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare wd public.withdrawals; t public.wallet_transactions; v_old text;
begin
  perform public.assert_finance_admin(p_admin_id);
  if p_decision not in ('approve', 'reject') then raise exception 'VALIDATION_ERROR'; end if;

  select * into wd from public.withdrawals where id = p_withdrawal_id and deleted_at is null for update;
  if not found then raise exception 'WITHDRAWAL_NOT_FOUND'; end if;
  v_old := wd.status::text;

  if p_decision = 'approve' then
    if wd.status <> 'pending' then raise exception 'WITHDRAWAL_NOT_PENDING'; end if;
    update public.withdrawals set status = 'approved', reviewed_by = p_admin_id, reviewed_at = now()
     where id = wd.id returning * into wd;
  else
    if wd.status not in ('pending', 'approved') then raise exception 'WITHDRAWAL_NOT_PENDING'; end if;
    if length(btrim(coalesce(p_reason, ''))) < 5 then raise exception 'REASON_REQUIRED'; end if;

    t := public.post_wallet_transaction(wd.wallet_id, 'refund', 'credit', wd.amount,
           'withdrawal', wd.id, 'withdrawal-refund:' || wd.id::text, 'Withdrawal rejected',
           jsonb_build_object('withdrawal_id', wd.id));
    update public.withdrawals
       set status = 'rejected', rejection_reason = btrim(p_reason), reviewed_by = p_admin_id,
           reviewed_at = now(), refund_txn_id = t.id
     where id = wd.id returning * into wd;
  end if;

  perform public.write_audit('admin', null, p_admin_id,
    case when p_decision = 'approve' then 'withdrawal.approved' else 'withdrawal.rejected' end,
    'withdrawals', wd.id, jsonb_build_object('status', v_old),
    jsonb_build_object('status', wd.status, 'amount', wd.amount, 'reason', wd.rejection_reason));

  perform public.push_notification(wd.user_id, 'withdrawal',
    case when p_decision = 'approve' then 'Withdrawal approved' else 'Withdrawal rejected' end,
    case when p_decision = 'approve' then format('Your withdrawal of %s was approved. Payment is on its way.', wd.amount)
         else format('Your withdrawal of %s was rejected and the money is back in your wallet. Reason: %s', wd.amount, wd.rejection_reason) end,
    jsonb_build_object('withdrawal_id', wd.id));

  return to_jsonb(wd);
end;
$$;

-- After the money has been sent ----------------------------------------------------------------
create function public.withdrawal_mark_paid(p_admin_id uuid, p_withdrawal_id uuid, p_reference text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare wd public.withdrawals;
begin
  perform public.assert_finance_admin(p_admin_id);

  select * into wd from public.withdrawals where id = p_withdrawal_id and deleted_at is null for update;
  if not found then raise exception 'WITHDRAWAL_NOT_FOUND'; end if;
  if wd.status not in ('approved', 'processing') then raise exception 'WITHDRAWAL_NOT_APPROVED'; end if;

  update public.withdrawals
     set status = 'paid', processed_at = now(), external_reference = nullif(btrim(coalesce(p_reference, '')), '')
   where id = wd.id returning * into wd;

  perform public.write_audit('admin', null, p_admin_id, 'withdrawal.paid', 'withdrawals', wd.id,
    jsonb_build_object('status', 'approved'), jsonb_build_object('status', 'paid', 'reference', wd.external_reference));
  perform public.push_notification(wd.user_id, 'withdrawal', 'Withdrawal paid',
    format('%s was sent to your bank account.', wd.net_amount), jsonb_build_object('withdrawal_id', wd.id));

  return to_jsonb(wd);
end;
$$;

-- Configurable rules, limited to a fixed list and range checked ---------------------------------
create function public.admin_update_setting(p_admin_id uuid, p_key text, p_value jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_num numeric; v_old jsonb; s public.settings;
begin
  if not exists (select 1 from public.admin_users
                  where id = p_admin_id and is_active and deleted_at is null and role in ('super_admin', 'admin')) then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if p_key not in ('min_withdrawal_amount', 'withdrawal_cooldown_days', 'withdrawal_fee_percent') then
    raise exception 'SETTING_NOT_EDITABLE';
  end if;
  if jsonb_typeof(p_value) <> 'number' then raise exception 'VALIDATION_ERROR'; end if;

  v_num := (p_value #>> '{}')::numeric;
  if (p_key = 'min_withdrawal_amount' and (v_num < 0 or v_num > 1000000))
     or (p_key = 'withdrawal_cooldown_days' and (v_num < 0 or v_num > 90 or v_num <> trunc(v_num)))
     or (p_key = 'withdrawal_fee_percent' and (v_num < 0 or v_num > 50)) then
    raise exception 'VALIDATION_ERROR';
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
  public.assert_finance_admin, public.withdrawal_eligibility, public.withdrawal_review,
  public.withdrawal_mark_paid, public.admin_update_setting
  from public, anon, authenticated;
grant execute on function
  public.withdrawal_eligibility, public.withdrawal_review,
  public.withdrawal_mark_paid, public.admin_update_setting
  to service_role;
