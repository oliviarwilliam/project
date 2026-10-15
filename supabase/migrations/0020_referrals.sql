-- One reward per referred account. Rewards are credited after the first successful deposit.
alter table public.users
  add column referral_code text not null default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
create unique index users_referral_code_key on public.users (referral_code);

create table public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references public.users(id) on delete restrict,
  referred_user_id uuid not null unique references public.users(id) on delete restrict,
  referral_code text not null,
  status text not null default 'pending' check (status in ('pending', 'qualified')),
  reward_amount numeric(14,2) not null default 0 check (reward_amount >= 0),
  reward_txn_id uuid unique references public.wallet_transactions(id) on delete restrict,
  qualified_at timestamptz,
  created_at timestamptz not null default now(),
  constraint referrals_not_self check (referrer_id <> referred_user_id),
  constraint referrals_reward_consistent check (
    (status = 'pending' and qualified_at is null and reward_txn_id is null)
    or (status = 'qualified' and qualified_at is not null
        and ((reward_amount = 0 and reward_txn_id is null) or (reward_amount > 0 and reward_txn_id is not null)))
  )
);
create index referrals_referrer_idx on public.referrals(referrer_id, status, created_at desc);
alter table public.referrals enable row level security;
revoke all on public.referrals from anon, authenticated;
grant select, insert, update, delete on public.referrals to service_role;

insert into public.settings(key, value, description, is_public)
values ('referral_reward_amount', '1000', 'Reward in NGN for each referral who funds their wallet', true)
on conflict (key) where deleted_at is null do nothing;

create function public.award_funded_referral(p_referred_user_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r public.referrals; w public.wallets; v_reward numeric(14,2); t public.wallet_transactions;
begin
  select * into r from public.referrals where referred_user_id = p_referred_user_id and status = 'pending' for update;
  if not found then return; end if;

  v_reward := coalesce((public.get_setting('referral_reward_amount') #>> '{}')::numeric, 1000);
  select * into w from public.wallets where user_id = r.referrer_id and currency = 'NGN' and deleted_at is null for update;
  if not found then raise exception 'WALLET_NOT_FOUND'; end if;

  if v_reward > 0 then
    t := public.post_wallet_transaction(w.id, 'adjustment', 'credit', v_reward,
         'referral', r.id, 'referral:' || r.id::text, 'Referral reward',
         jsonb_build_object('source', 'referral', 'referred_user_id', p_referred_user_id, 'reward_amount', v_reward));
  end if;
  update public.referrals set status = 'qualified', reward_amount = v_reward, qualified_at = now(),
       reward_txn_id = case when v_reward > 0 then t.id else null end
   where id = r.id returning * into r;
  perform public.push_notification(r.referrer_id, 'wallet', 'Referral reward credited',
    format('%s NGN was added after your referral funded their wallet.', v_reward),
    jsonb_build_object('referral_id', r.id, 'referred_user_id', p_referred_user_id));
  perform public.write_audit('system', null, null, 'referral.reward_credited', 'referrals', r.id, null,
    jsonb_build_object('referrer_id', r.referrer_id, 'referred_user_id', p_referred_user_id, 'amount', v_reward));
end;
$$;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_name text := left(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), 80);
  v_code text := upper(btrim(coalesce(new.raw_user_meta_data ->> 'referral_code', '')));
  v_referrer uuid;
begin
  insert into public.users (id, email, full_name)
  values (new.id, new.email, case when char_length(v_name) >= 2 then v_name end);
  insert into public.wallets (user_id) values (new.id);

  if v_code <> '' then
    select id into v_referrer from public.users where referral_code = v_code and id <> new.id and status = 'active' and deleted_at is null;
    if found then
      insert into public.referrals(referrer_id, referred_user_id, referral_code)
      values (v_referrer, new.id, v_code) on conflict (referred_user_id) do nothing;
    end if;
  end if;
  return new;
end;
$$;

create function public.qualify_referral_after_funding() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.award_funded_referral(new.user_id);
  return new;
end;
$$;
create trigger on_referral_first_funding
  after insert on public.wallet_transactions
  for each row when (new.type = 'deposit' and new.direction = 'credit')
  execute function public.qualify_referral_after_funding();

revoke all on function public.award_funded_referral(uuid), public.qualify_referral_after_funding()
  from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;

create or replace function public.withdrawal_eligibility(p_user_id uuid, p_currency text default 'NGN') returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  w public.wallets; u record; v_cur text := upper(p_currency);
  v_min numeric; v_fee numeric; v_cooldown integer; v_consent_age integer;
  v_earned numeric(14,2); v_reserved numeric(14,2); v_available numeric(14,2);
  v_last timestamptz; v_next timestamptz; v_blocked text;
  v_qualified_referrals integer; v_referrals_required integer := 10;
begin
  select * into w from public.wallets where user_id = p_user_id and currency = v_cur and deleted_at is null;
  if not found then raise exception 'WALLET_NOT_FOUND'; end if;
  v_min := coalesce((public.get_setting('min_withdrawal_amount') #>> '{}')::numeric, 0);
  v_fee := coalesce((public.get_setting('withdrawal_fee_percent') #>> '{}')::numeric, 0);
  v_cooldown := coalesce((public.get_setting('withdrawal_cooldown_days') #>> '{}')::integer, 7);
  v_consent_age := coalesce((public.get_setting('guardian_consent_under_age') #>> '{}')::integer, 18);
  select count(*) into v_qualified_referrals from public.referrals where referrer_id = p_user_id and status = 'qualified';
  select coalesce(sum(amount), 0) into v_earned from public.wallet_transactions where wallet_id = w.id and type = 'earning';
  select coalesce(sum(amount), 0), max(created_at) into v_reserved, v_last
    from public.withdrawals where wallet_id = w.id and deleted_at is null and status in ('pending', 'approved', 'processing', 'paid');
  v_available := greatest(0, least(w.balance, v_earned - v_reserved));
  v_next := case when v_last is null or v_cooldown <= 0 then null else v_last + make_interval(days => v_cooldown) end;
  select status, date_of_birth, guardian_consent_at into u from public.users where id = p_user_id and deleted_at is null;
  v_blocked := case
    when not found or u.status <> 'active' then 'ACCOUNT_RESTRICTED'
    when coalesce(public.get_setting('maintenance_mode') = 'true'::jsonb, false) then 'MAINTENANCE_MODE'
    when u.date_of_birth is null then 'PROFILE_INCOMPLETE'
    when u.date_of_birth > (current_date - make_interval(years => v_consent_age))::date and u.guardian_consent_at is null then 'GUARDIAN_CONSENT_REQUIRED'
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

create or replace function public.admin_update_setting(p_admin_id uuid, p_key text, p_value jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_num numeric; v_old jsonb; s public.settings;
begin
  if not exists (select 1 from public.admin_users where id = p_admin_id and is_active and deleted_at is null and role in ('super_admin', 'admin')) then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if p_key not in ('min_withdrawal_amount', 'withdrawal_cooldown_days', 'withdrawal_fee_percent', 'referral_reward_amount') then
    raise exception 'SETTING_NOT_EDITABLE';
  end if;
  if jsonb_typeof(p_value) <> 'number' then raise exception 'VALIDATION_ERROR'; end if;
  v_num := (p_value #>> '{}')::numeric;
  if (p_key = 'min_withdrawal_amount' and (v_num < 0 or v_num > 1000000))
     or (p_key = 'withdrawal_cooldown_days' and (v_num < 0 or v_num > 90 or v_num <> trunc(v_num)))
     or (p_key = 'withdrawal_fee_percent' and (v_num < 0 or v_num > 50))
     or (p_key = 'referral_reward_amount' and (v_num < 0 or v_num > 1000000)) then
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
