-- Make the funded referral requirement an administrator controlled platform rule.
insert into public.settings (key, value, description, is_public)
values ('required_funded_referrals', '10', 'Funded referrals required before referral rewards can be withdrawn', true)
on conflict (key) where deleted_at is null do nothing;

create or replace function public.admin_update_setting(p_admin_id uuid, p_key text, p_value jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_num numeric; v_old jsonb; s public.settings;
begin
  if not exists (
    select 1 from public.admin_users
     where id = p_admin_id and is_active and deleted_at is null and role in ('super_admin', 'admin')
  ) then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if p_key not in ('min_withdrawal_amount', 'withdrawal_cooldown_days', 'withdrawal_fee_percent', 'referral_reward_amount', 'required_funded_referrals') then
    raise exception 'SETTING_NOT_EDITABLE';
  end if;
  if jsonb_typeof(p_value) <> 'number' then raise exception 'VALIDATION_ERROR'; end if;
  v_num := (p_value #>> '{}')::numeric;
  if (p_key = 'min_withdrawal_amount' and (v_num < 0 or v_num > 1000000))
     or (p_key = 'withdrawal_cooldown_days' and (v_num < 0 or v_num > 90 or v_num <> trunc(v_num)))
     or (p_key = 'withdrawal_fee_percent' and (v_num < 0 or v_num > 50))
     or (p_key = 'referral_reward_amount' and (v_num < 0 or v_num > 1000000))
     or (p_key = 'required_funded_referrals' and (v_num < 0 or v_num > 1000 or v_num <> trunc(v_num))) then
    raise exception 'VALIDATION_ERROR';
  end if;
  select value into v_old from public.settings where key = p_key and deleted_at is null for update;
  update public.settings set value = p_value, updated_by = p_admin_id where key = p_key and deleted_at is null returning * into s;
  if not found then
    insert into public.settings (key, value, is_public, updated_by) values (p_key, p_value, true, p_admin_id) returning * into s;
  end if;
  perform public.write_audit('admin', null, p_admin_id, 'setting.updated', 'settings', s.id,
    jsonb_build_object('key', p_key, 'value', v_old), jsonb_build_object('key', p_key, 'value', p_value));
  return jsonb_build_object('key', p_key, 'value', p_value);
end;
$$;

create or replace function public.withdrawal_eligibility(p_user_id uuid, p_currency text default 'NGN') returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  w public.wallets; u record; v_cur text := upper(p_currency);
  v_min numeric; v_fee numeric; v_cooldown integer; v_referral_reward numeric;
  v_earned numeric(14,2); v_reserved numeric(14,2); v_available numeric(14,2);
  v_last timestamptz; v_next timestamptz; v_referral_last timestamptz; v_referral_next timestamptz; v_blocked text;
  v_qualified_referrals integer; v_referrals_required integer;
  v_referral_total numeric(14,2); v_referral_reserved numeric(14,2); v_referral_available numeric(14,2);
begin
  select * into w from public.wallets where user_id = p_user_id and currency = v_cur and deleted_at is null;
  if not found then raise exception 'WALLET_NOT_FOUND'; end if;
  v_min := coalesce((public.get_setting('min_withdrawal_amount') #>> '{}')::numeric, 5000);
  v_fee := coalesce((public.get_setting('withdrawal_fee_percent') #>> '{}')::numeric, 0);
  v_cooldown := coalesce((public.get_setting('withdrawal_cooldown_days') #>> '{}')::integer, 7);
  v_referral_reward := coalesce((public.get_setting('referral_reward_amount') #>> '{}')::numeric, 1000);
  v_referrals_required := coalesce((public.get_setting('required_funded_referrals') #>> '{}')::integer, 10);
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
    format('%s NGN was added to your referral rewards. The funded referral requirement applies to withdrawals.', v_reward),
    jsonb_build_object('referral_id', r.id, 'referred_user_id', p_referred_user_id));
  perform public.write_audit('system', null, null, 'referral.reward_earned', 'referrals', r.id, null,
    jsonb_build_object('referrer_id', r.referrer_id, 'referred_user_id', p_referred_user_id, 'amount', v_reward));
end;
$$;
