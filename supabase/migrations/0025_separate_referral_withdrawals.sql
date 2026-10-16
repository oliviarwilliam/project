-- Separate referral rewards from the member wallet. Profit withdrawals remain
-- subject to the normal withdrawal schedule; referral rewards unlock at 10 funded referrals.

alter table public.withdrawals
  add column funding_source text not null default 'profit',
  add column idempotency_key text;
alter table public.withdrawals
  add constraint withdrawals_funding_source_check check (funding_source in ('profit', 'referral'));
create unique index withdrawals_idempotency_key_key
  on public.withdrawals (idempotency_key) where idempotency_key is not null;

-- Existing rewards were already paid into the main wallet. Keep them classified as
-- legacy wallet credits; new rewards accrue separately and are never double-counted.
alter table public.referrals add column reward_source text not null default 'separate';
update public.referrals set reward_source = 'legacy_wallet' where reward_txn_id is not null;
alter table public.referrals add constraint referrals_reward_source_check
  check (reward_source in ('legacy_wallet', 'separate'));
alter table public.referrals drop constraint referrals_reward_consistent;
alter table public.referrals add constraint referrals_reward_consistent check (
  (status = 'pending' and qualified_at is null and reward_txn_id is null and reward_amount = 0)
  or (status = 'qualified' and qualified_at is not null and (
    (reward_source = 'legacy_wallet' and reward_amount >= 0 and
      ((reward_amount = 0 and reward_txn_id is null) or (reward_amount > 0 and reward_txn_id is not null)))
    or (reward_source = 'separate' and reward_amount >= 0 and reward_txn_id is null)
  ))
);

create or replace function public.award_funded_referral(p_referred_user_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r public.referrals; v_reward numeric(14,2);
begin
  select * into r from public.referrals where referred_user_id = p_referred_user_id and status = 'pending' for update;
  if not found then return; end if;
  v_reward := coalesce((public.get_setting('referral_reward_amount') #>> '{}')::numeric, 1000);
  update public.referrals set status = 'qualified', reward_amount = v_reward, qualified_at = now(),
       reward_source = 'separate', reward_txn_id = null
   where id = r.id returning * into r;
  perform public.push_notification(r.referrer_id, 'wallet', 'Referral reward earned',
    format('%s NGN was added to your referral rewards. Withdraw referral rewards after 10 funded referrals.', v_reward),
    jsonb_build_object('referral_id', r.id, 'referred_user_id', p_referred_user_id));
  perform public.write_audit('system', null, null, 'referral.reward_earned', 'referrals', r.id, null,
    jsonb_build_object('referrer_id', r.referrer_id, 'referred_user_id', p_referred_user_id, 'amount', v_reward));
end;
$$;

create or replace function public.withdrawal_eligibility(p_user_id uuid, p_currency text default 'NGN') returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  w public.wallets; u record; v_cur text := upper(p_currency);
  v_min numeric; v_fee numeric; v_cooldown integer; v_referral_reward numeric;
  v_earned numeric(14,2); v_reserved numeric(14,2); v_available numeric(14,2);
  v_last timestamptz; v_next timestamptz; v_referral_last timestamptz; v_referral_next timestamptz; v_blocked text;
  v_qualified_referrals integer; v_referrals_required integer := 10;
  v_referral_total numeric(14,2); v_referral_reserved numeric(14,2); v_referral_available numeric(14,2);
begin
  select * into w from public.wallets where user_id = p_user_id and currency = v_cur and deleted_at is null;
  if not found then raise exception 'WALLET_NOT_FOUND'; end if;
  v_min := coalesce((public.get_setting('min_withdrawal_amount') #>> '{}')::numeric, 5000);
  v_fee := coalesce((public.get_setting('withdrawal_fee_percent') #>> '{}')::numeric, 0);
  v_cooldown := coalesce((public.get_setting('withdrawal_cooldown_days') #>> '{}')::integer, 7);
  v_referral_reward := coalesce((public.get_setting('referral_reward_amount') #>> '{}')::numeric, 1000);
  select count(*) into v_qualified_referrals from public.referrals
    where referrer_id = p_user_id and status = 'qualified';
  select coalesce(sum(amount), 0) into v_earned from public.wallet_transactions
    where wallet_id = w.id and type = 'earning';
  select coalesce(sum(amount) filter (where funding_source = 'profit'), 0),
         max(created_at) filter (where funding_source = 'profit') into v_reserved, v_last
    from public.withdrawals where wallet_id = w.id and deleted_at is null
      and status in ('pending', 'approved', 'processing', 'paid');
  v_available := greatest(0, least(w.balance, v_earned - v_reserved));
  v_next := case when v_last is null or v_cooldown <= 0 then null else v_last + make_interval(days => v_cooldown) end;
  select coalesce(sum(reward_amount), 0) into v_referral_total from public.referrals
    where referrer_id = p_user_id and status = 'qualified' and reward_source = 'separate';
  select coalesce(sum(amount), 0), max(created_at) into v_referral_reserved, v_referral_last from public.withdrawals
    where user_id = p_user_id and deleted_at is null and funding_source = 'referral'
      and status in ('pending', 'approved', 'processing', 'paid');
  v_referral_available := greatest(0, v_referral_total - v_referral_reserved);
  v_referral_next := case when v_referral_last is null or v_cooldown <= 0 then null
    else v_referral_last + make_interval(days => v_cooldown) end;
  select status, date_of_birth into u from public.users where id = p_user_id and deleted_at is null;
  v_blocked := case
    when not found or u.status <> 'active' then 'ACCOUNT_RESTRICTED'
    when coalesce(public.get_setting('maintenance_mode') = 'true'::jsonb, false) then 'MAINTENANCE_MODE'
    when u.date_of_birth is null then 'PROFILE_INCOMPLETE'
    when v_next is not null and v_next > now() then 'WITHDRAWAL_COOLDOWN'
    when v_available <= 0 or v_available < v_min then 'NO_PROFIT_AVAILABLE'
    else null end;
  return jsonb_build_object(
    'currency', v_cur, 'wallet_balance', w.balance, 'total_profit_earned', v_earned,
    'profit_reserved', v_reserved, 'available_profit', v_available, 'min_amount', v_min,
    'fee_percent', v_fee, 'cooldown_days', v_cooldown, 'last_request_at', v_last,
    'next_eligible_at', case when v_next > now() then v_next else null end,
    'next_referral_eligible_at', case when v_referral_next > now() then v_referral_next else null end,
    'qualified_referrals', v_qualified_referrals, 'required_referrals', v_referrals_required,
    'referral_reward_amount', v_referral_reward, 'referral_rewards_balance', v_referral_available,
    'available_referral_rewards', case when v_qualified_referrals >= v_referrals_required then v_referral_available else 0 end,
    'locked_referral_rewards', case when v_qualified_referrals < v_referrals_required then v_referral_available else 0 end,
    'can_request', v_blocked is null, 'blocked_by', v_blocked);
end;
$$;

create or replace function public.wallet_request_withdrawal_v2(
  p_user_id uuid, p_currency text, p_amount numeric, p_method text,
  p_destination jsonb, p_idempotency_key text, p_funding_source text default 'profit'
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  w public.wallets; t public.wallet_transactions; wd public.withdrawals; e jsonb;
  v_id uuid := gen_random_uuid(); v_cur text := upper(p_currency); v_fee numeric(14,2);
  v_blocked text; v_available numeric; v_qualified integer; v_required integer;
begin
  t := null;
  if coalesce(p_idempotency_key, '') = '' then raise exception 'IDEMPOTENCY_KEY_REQUIRED'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'INVALID_AMOUNT'; end if;
  if p_funding_source is null or p_funding_source not in ('profit', 'referral') then raise exception 'VALIDATION_ERROR'; end if;
  perform public.assert_can_transact(p_user_id);
  select * into w from public.wallets where user_id = p_user_id and currency = v_cur and deleted_at is null for update;
  if not found then raise exception 'WALLET_NOT_FOUND'; end if;

  select * into wd from public.withdrawals where idempotency_key = p_idempotency_key;
  if found then
    if wd.hold_txn_id is not null then select * into t from public.wallet_transactions where id = wd.hold_txn_id; end if;
    return jsonb_build_object('withdrawal', to_jsonb(wd), 'transaction', case when t.id is null then null else to_jsonb(t) end, 'replayed', true);
  end if;
  -- Preserve idempotency for requests created before this migration.
  select * into t from public.wallet_transactions where idempotency_key = p_idempotency_key;
  if found then
    select * into wd from public.withdrawals where hold_txn_id = t.id;
    if found then return jsonb_build_object('withdrawal', to_jsonb(wd), 'transaction', to_jsonb(t), 'replayed', true); end if;
  end if;

  e := public.withdrawal_eligibility(p_user_id, v_cur);
  v_blocked := e ->> 'blocked_by';
  if v_blocked is not null and v_blocked <> 'NO_PROFIT_AVAILABLE'
     and not (p_funding_source = 'referral' and v_blocked = 'WITHDRAWAL_COOLDOWN') then
    raise exception '%', v_blocked;
  end if;
  if p_amount < (e ->> 'min_amount')::numeric then raise exception 'BELOW_MIN_WITHDRAWAL'; end if;
  v_fee := round(p_amount * (e ->> 'fee_percent')::numeric / 100, 2);

  if p_funding_source = 'profit' then
    v_available := (e ->> 'available_profit')::numeric;
    if p_amount > v_available then raise exception 'EXCEEDS_PROFIT_BALANCE'; end if;
    t := public.post_wallet_transaction(w.id, 'withdrawal', 'debit', p_amount,
      'withdrawal', v_id, p_idempotency_key, 'Profit withdrawal', jsonb_build_object('funding_source', 'profit'));
  else
    v_qualified := (e ->> 'qualified_referrals')::integer;
    v_required := (e ->> 'required_referrals')::integer;
    if v_qualified < v_required then raise exception 'REFERRALS_REQUIRED'; end if;
    if (e ->> 'next_referral_eligible_at') is not null
       and (e ->> 'next_referral_eligible_at')::timestamptz > now() then raise exception 'WITHDRAWAL_COOLDOWN'; end if;
    v_available := (e ->> 'available_referral_rewards')::numeric;
    if p_amount > v_available then raise exception 'REFERRAL_REWARD_INSUFFICIENT'; end if;
    t := null;
  end if;

  insert into public.withdrawals (id, user_id, wallet_id, amount, fee, method, destination,
    hold_txn_id, funding_source, idempotency_key)
  values (v_id, p_user_id, w.id, p_amount, v_fee, p_method, p_destination,
    t.id, p_funding_source, p_idempotency_key) returning * into wd;

  perform public.write_audit('user', p_user_id, null, 'wallet.withdrawal_requested', 'withdrawals', wd.id, null,
    jsonb_build_object('amount', p_amount, 'fee', v_fee, 'method', p_method,
      'funding_source', p_funding_source, 'available_before', v_available));
  perform public.push_notification(p_user_id, 'withdrawal', 'Withdrawal submitted',
    format('Your %s withdrawal for %s %s is waiting for review.', p_funding_source, p_amount, v_cur),
    jsonb_build_object('withdrawal_id', wd.id, 'funding_source', p_funding_source));
  insert into public.notifications (user_id, type, title, body, data)
  select a.user_id, 'withdrawal', 'Withdrawal awaiting review',
    format('%s requested a %s withdrawal of %s %s.', u.email, p_funding_source, p_amount, v_cur),
    jsonb_build_object('withdrawal_id', wd.id, 'user_id', p_user_id, 'funding_source', p_funding_source)
  from public.admin_users a join public.users u on u.id = a.user_id and u.deleted_at is null
  where a.is_active and a.deleted_at is null and a.role in ('super_admin', 'admin', 'finance');

  return jsonb_build_object('withdrawal', to_jsonb(wd), 'transaction', case when t.id is null then null else to_jsonb(t) end, 'replayed', false);
end;
$$;

-- Existing service callers of the original RPC continue to request profit withdrawals.
create or replace function public.wallet_request_withdrawal(
  p_user_id uuid, p_currency text, p_amount numeric, p_method text,
  p_destination jsonb, p_idempotency_key text
) returns jsonb language sql security definer set search_path = public as $$
  select public.wallet_request_withdrawal_v2(p_user_id, p_currency, p_amount, p_method,
    p_destination, p_idempotency_key, 'profit');
$$;

create or replace function public.withdrawal_review(
  p_admin_id uuid, p_withdrawal_id uuid, p_decision text, p_reason text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare wd public.withdrawals; t public.wallet_transactions; v_old text;
begin
  t := null;
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
    if wd.funding_source = 'profit' then
      t := public.post_wallet_transaction(wd.wallet_id, 'refund', 'credit', wd.amount,
        'withdrawal', wd.id, 'withdrawal-refund:' || wd.id::text, 'Withdrawal rejected',
        jsonb_build_object('withdrawal_id', wd.id));
    end if;
    update public.withdrawals set status = 'rejected', rejection_reason = btrim(p_reason),
      reviewed_by = p_admin_id, reviewed_at = now(), refund_txn_id = case when wd.funding_source = 'profit' then t.id else null end
      where id = wd.id returning * into wd;
  end if;
  perform public.write_audit('admin', null, p_admin_id,
    case when p_decision = 'approve' then 'withdrawal.approved' else 'withdrawal.rejected' end,
    'withdrawals', wd.id, jsonb_build_object('status', v_old),
    jsonb_build_object('status', wd.status, 'amount', wd.amount, 'funding_source', wd.funding_source, 'reason', wd.rejection_reason));
  perform public.push_notification(wd.user_id, 'withdrawal',
    case when p_decision = 'approve' then 'Withdrawal approved' else 'Withdrawal rejected' end,
    case when p_decision = 'approve' then format('Your withdrawal of %s was approved. Payment is on its way.', wd.amount)
      when wd.funding_source = 'profit' then format('Your withdrawal of %s was rejected and the amount is back in your wallet. Reason: %s', wd.amount, wd.rejection_reason)
      else format('Your referral reward withdrawal of %s was rejected. The amount is available again. Reason: %s', wd.amount, wd.rejection_reason) end,
    jsonb_build_object('withdrawal_id', wd.id, 'funding_source', wd.funding_source));
  return to_jsonb(wd);
end;
$$;

revoke all on function public.wallet_request_withdrawal_v2(uuid, text, numeric, text, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.wallet_request_withdrawal_v2(uuid, text, numeric, text, jsonb, text, text) to service_role;
