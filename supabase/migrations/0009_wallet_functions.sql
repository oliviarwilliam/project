-- ============================================================================
-- Wallet system. Every function below runs as ONE database transaction, so a
-- ledger row, balance change, business row, audit log and notification either
-- all happen or none do. Errors are raised as short codes (INSUFFICIENT_FUNDS
-- and so on) that the service layer maps to HTTP responses.
-- ============================================================================

-- Internal helpers ------------------------------------------------------------
create function public.get_setting(p_key text) returns jsonb
language sql stable security definer set search_path = public as $$
  select value from public.settings where key = p_key and deleted_at is null;
$$;

create function public.write_audit(
  p_actor_type text, p_actor_user_id uuid, p_actor_admin_id uuid, p_action text,
  p_entity_table text, p_entity_id uuid, p_old jsonb, p_new jsonb
) returns void
language sql security definer set search_path = public as $$
  insert into public.audit_logs
    (actor_type, actor_user_id, actor_admin_id, action, entity_table, entity_id, old_data, new_data)
  values
    (p_actor_type, p_actor_user_id, p_actor_admin_id, p_action, p_entity_table, p_entity_id, p_old, p_new);
$$;

create function public.push_notification(
  p_user_id uuid, p_type public.notification_type, p_title text, p_body text,
  p_data jsonb default '{}'::jsonb
) returns void
language sql security definer set search_path = public as $$
  insert into public.notifications (user_id, type, title, body, data)
  values (p_user_id, p_type, p_title, p_body, p_data);
$$;

create function public.assert_can_transact(p_user_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare u public.users;
begin
  if coalesce(public.get_setting('maintenance_mode') = 'true'::jsonb, false) then
    raise exception 'MAINTENANCE_MODE';
  end if;
  select * into u from public.users where id = p_user_id and deleted_at is null;
  if not found or u.status <> 'active' then raise exception 'ACCOUNT_RESTRICTED'; end if;
end;
$$;

-- Nobody can change a balance except post_wallet_transaction ---------------
create function public.guard_wallet_balance() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' and new.balance <> 0 then
    raise exception 'BALANCE_LOCKED';
  end if;
  if tg_op = 'UPDATE' and new.balance is distinct from old.balance
     and coalesce(current_setting('app.ledger_write', true), '') <> '1' then
    raise exception 'BALANCE_LOCKED';
  end if;
  return new;
end;
$$;

create trigger guard_wallet_balance
  before insert or update on public.wallets
  for each row execute function public.guard_wallet_balance();

-- Core posting function (replaces the version from 0005) --------------------
create or replace function public.post_wallet_transaction(
  p_wallet_id       uuid,
  p_type            public.txn_type,
  p_direction       public.txn_direction,
  p_amount          numeric,
  p_reference_type  text default null,
  p_reference_id    uuid default null,
  p_idempotency_key text default null,
  p_description     text default null,
  p_metadata        jsonb default '{}'::jsonb
) returns public.wallet_transactions
language plpgsql security definer set search_path = public as $$
declare
  w public.wallets;
  t public.wallet_transactions;
  new_balance numeric(14,2);
begin
  if p_amount is null or p_amount <= 0 then raise exception 'INVALID_AMOUNT'; end if;

  if p_idempotency_key is not null then
    select * into t from public.wallet_transactions where idempotency_key = p_idempotency_key;
    if found then return t; end if;
  end if;

  select * into w from public.wallets where id = p_wallet_id and deleted_at is null for update;
  if not found then raise exception 'WALLET_NOT_FOUND'; end if;

  new_balance := case when p_direction = 'credit' then w.balance + p_amount else w.balance - p_amount end;
  if new_balance < 0 then raise exception 'INSUFFICIENT_FUNDS'; end if;

  perform set_config('app.ledger_write', '1', true);
  update public.wallets set balance = new_balance where id = w.id;
  perform set_config('app.ledger_write', '', true);

  insert into public.wallet_transactions
    (wallet_id, user_id, type, direction, amount, balance_after,
     reference_type, reference_id, idempotency_key, description, metadata)
  values
    (w.id, w.user_id, p_type, p_direction, p_amount, new_balance,
     p_reference_type, p_reference_id, p_idempotency_key, p_description, p_metadata)
  returning * into t;

  return t;
end;
$$;

-- 1. Deposit (called by the payment webhook) --------------------------------
create function public.wallet_deposit(
  p_user_id uuid, p_currency text, p_amount numeric, p_idempotency_key text,
  p_description text default 'Deposit', p_metadata jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare w public.wallets; t public.wallet_transactions;
begin
  if coalesce(p_idempotency_key, '') = '' then raise exception 'IDEMPOTENCY_KEY_REQUIRED'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'INVALID_AMOUNT'; end if;

  select * into w from public.wallets
   where user_id = p_user_id and currency = upper(p_currency) and deleted_at is null for update;
  if not found then raise exception 'WALLET_NOT_FOUND'; end if;

  select * into t from public.wallet_transactions where idempotency_key = p_idempotency_key;
  if found then return jsonb_build_object('transaction', to_jsonb(t), 'replayed', true); end if;

  t := public.post_wallet_transaction(w.id, 'deposit', 'credit', p_amount,
         null, null, p_idempotency_key, p_description, p_metadata);

  perform public.write_audit('system', null, null, 'wallet.deposit', 'wallet_transactions', t.id, null,
    jsonb_build_object('user_id', p_user_id, 'amount', p_amount, 'balance_after', t.balance_after));
  perform public.push_notification(p_user_id, 'wallet', 'Deposit received',
    format('%s %s was added to your wallet.', p_amount, upper(p_currency)),
    jsonb_build_object('transaction_id', t.id));

  return jsonb_build_object('transaction', to_jsonb(t), 'replayed', false);
end;
$$;

-- 2. Package purchase ----------------------------------------------------------
create function public.wallet_purchase_package(
  p_user_id uuid, p_package_id uuid, p_idempotency_key text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  pkg public.packages; w public.wallets; t public.wallet_transactions; up public.user_packages;
  v_id uuid := gen_random_uuid(); v_held integer;
begin
  if coalesce(p_idempotency_key, '') = '' then raise exception 'IDEMPOTENCY_KEY_REQUIRED'; end if;
  perform public.assert_can_transact(p_user_id);

  select * into pkg from public.packages
   where id = p_package_id and status = 'active' and deleted_at is null;
  if not found then raise exception 'PACKAGE_UNAVAILABLE'; end if;

  select * into w from public.wallets
   where user_id = p_user_id and currency = pkg.currency and deleted_at is null for update;
  if not found then raise exception 'WALLET_NOT_FOUND'; end if;

  select * into t from public.wallet_transactions where idempotency_key = p_idempotency_key;
  if found then
    select * into up from public.user_packages where purchase_txn_id = t.id;
    return jsonb_build_object('user_package', to_jsonb(up), 'transaction', to_jsonb(t), 'replayed', true);
  end if;

  if pkg.max_per_user is not null then
    select count(*) into v_held from public.user_packages
     where user_id = p_user_id and package_id = pkg.id and status = 'active' and deleted_at is null;
    if v_held >= pkg.max_per_user then raise exception 'PACKAGE_LIMIT_REACHED'; end if;
  end if;

  t := public.post_wallet_transaction(w.id, 'package_purchase', 'debit', pkg.price,
         'user_package', v_id, p_idempotency_key, 'Purchased ' || pkg.name,
         jsonb_build_object('package_id', pkg.id));

  insert into public.user_packages
    (id, user_id, package_id, purchase_txn_id, amount, return_rate, payout_interval_days,
     starts_at, ends_at, next_payout_at)
  values
    (v_id, p_user_id, pkg.id, t.id, pkg.price, pkg.return_rate, pkg.payout_interval_days,
     now(), now() + make_interval(days => pkg.duration_days),
     now() + make_interval(days => pkg.payout_interval_days))
  returning * into up;

  perform public.write_audit('user', p_user_id, null, 'wallet.package_purchase', 'user_packages', up.id, null,
    jsonb_build_object('package_id', pkg.id, 'amount', pkg.price, 'balance_after', t.balance_after));
  perform public.push_notification(p_user_id, 'package', 'Package purchased',
    format('You bought %s for %s %s.', pkg.name, pkg.price, pkg.currency),
    jsonb_build_object('user_package_id', up.id));

  return jsonb_build_object('user_package', to_jsonb(up), 'transaction', to_jsonb(t), 'replayed', false);
end;
$$;

-- 3. Withdrawal request (funds are held immediately) --------------------------
create function public.wallet_request_withdrawal(
  p_user_id uuid, p_currency text, p_amount numeric, p_method text,
  p_destination jsonb, p_idempotency_key text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  w public.wallets; t public.wallet_transactions; wd public.withdrawals; u record;
  v_id uuid := gen_random_uuid(); v_fee numeric(14,2); v_min numeric; v_consent_age integer;
begin
  if coalesce(p_idempotency_key, '') = '' then raise exception 'IDEMPOTENCY_KEY_REQUIRED'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'INVALID_AMOUNT'; end if;
  perform public.assert_can_transact(p_user_id);

  select date_of_birth, guardian_consent_at into u from public.users where id = p_user_id;
  v_consent_age := coalesce((public.get_setting('guardian_consent_under_age') #>> '{}')::integer, 18);
  if u.date_of_birth is null then raise exception 'PROFILE_INCOMPLETE'; end if;
  if u.date_of_birth > (current_date - make_interval(years => v_consent_age))::date
     and u.guardian_consent_at is null then
    raise exception 'GUARDIAN_CONSENT_REQUIRED';
  end if;

  v_min := coalesce((public.get_setting('min_withdrawal_amount') #>> '{}')::numeric, 0);
  if p_amount < v_min then raise exception 'BELOW_MIN_WITHDRAWAL'; end if;
  v_fee := round(p_amount * coalesce((public.get_setting('withdrawal_fee_percent') #>> '{}')::numeric, 0) / 100, 2);

  select * into w from public.wallets
   where user_id = p_user_id and currency = upper(p_currency) and deleted_at is null for update;
  if not found then raise exception 'WALLET_NOT_FOUND'; end if;

  select * into t from public.wallet_transactions where idempotency_key = p_idempotency_key;
  if found then
    select * into wd from public.withdrawals where hold_txn_id = t.id;
    return jsonb_build_object('withdrawal', to_jsonb(wd), 'transaction', to_jsonb(t), 'replayed', true);
  end if;

  t := public.post_wallet_transaction(w.id, 'withdrawal', 'debit', p_amount,
         'withdrawal', v_id, p_idempotency_key, 'Withdrawal request',
         jsonb_build_object('method', p_method));

  insert into public.withdrawals (id, user_id, wallet_id, amount, fee, method, destination, hold_txn_id)
  values (v_id, p_user_id, w.id, p_amount, v_fee, p_method, p_destination, t.id)
  returning * into wd;

  perform public.write_audit('user', p_user_id, null, 'wallet.withdrawal_requested', 'withdrawals', wd.id, null,
    jsonb_build_object('amount', p_amount, 'fee', v_fee, 'method', p_method, 'balance_after', t.balance_after));
  perform public.push_notification(p_user_id, 'withdrawal', 'Withdrawal requested',
    format('Your request for %s %s is waiting for review.', p_amount, upper(p_currency)),
    jsonb_build_object('withdrawal_id', wd.id));

  return jsonb_build_object('withdrawal', to_jsonb(wd), 'transaction', to_jsonb(t), 'replayed', false);
end;
$$;

-- 4. Profit credit (one period per call) ---------------------------------------
create function public.wallet_credit_profit(p_user_package_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  up public.user_packages; w public.wallets; e public.earnings; t public.wallet_transactions;
  v_currency char(3); v_amount numeric(14,2); v_start timestamptz; v_end timestamptz;
  v_next timestamptz; v_done boolean;
begin
  select * into up from public.user_packages where id = p_user_package_id and deleted_at is null for update;
  if not found or up.status <> 'active' then raise exception 'PACKAGE_NOT_ACTIVE'; end if;
  if up.next_payout_at is null or up.next_payout_at > now() then raise exception 'PAYOUT_NOT_DUE'; end if;

  select currency into v_currency from public.packages where id = up.package_id;
  select * into w from public.wallets
   where user_id = up.user_id and currency = v_currency and deleted_at is null for update;
  if not found then raise exception 'WALLET_NOT_FOUND'; end if;

  v_amount := round(up.amount * up.return_rate, 2);
  if v_amount <= 0 then raise exception 'INVALID_AMOUNT'; end if;
  v_end   := up.next_payout_at;
  v_start := v_end - make_interval(days => up.payout_interval_days);

  insert into public.earnings (user_id, user_package_id, amount, period_start, period_end)
  values (up.user_id, up.id, v_amount, v_start, v_end)
  on conflict (user_package_id, period_start) do nothing
  returning * into e;
  if e.id is null then raise exception 'EARNING_EXISTS'; end if;

  t := public.post_wallet_transaction(w.id, 'earning', 'credit', v_amount,
         'earning', e.id, 'earning:' || e.id::text, 'Profit credit',
         jsonb_build_object('user_package_id', up.id));

  update public.earnings set status = 'credited', credited_txn_id = t.id, credited_at = now()
   where id = e.id returning * into e;

  v_next := v_end + make_interval(days => up.payout_interval_days);
  v_done := v_next > up.ends_at;
  update public.user_packages
     set next_payout_at = case when v_done then null else v_next end,
         status = case when v_done then 'completed'::public.user_package_status else status end
   where id = up.id;

  perform public.write_audit('system', null, null, 'wallet.profit_credit', 'earnings', e.id, null,
    jsonb_build_object('user_package_id', up.id, 'amount', v_amount, 'balance_after', t.balance_after));
  perform public.push_notification(up.user_id, 'earning', 'Profit credited',
    format('%s %s was added to your wallet.', v_amount, v_currency),
    jsonb_build_object('earning_id', e.id));

  return jsonb_build_object('earning', to_jsonb(e), 'transaction', to_jsonb(t));
end;
$$;

-- Batch runner for the scheduled job. One bad package never blocks the rest. ---
create function public.wallet_credit_due_profits(p_limit integer default 100) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r record; v_ok integer := 0; v_failed integer := 0;
begin
  for r in
    select id from public.user_packages
     where status = 'active' and deleted_at is null and next_payout_at <= now()
     order by next_payout_at
     limit least(greatest(p_limit, 1), 500)
     for update skip locked
  loop
    begin
      perform public.wallet_credit_profit(r.id);
      v_ok := v_ok + 1;
    exception when others then
      v_failed := v_failed + 1;
      raise warning 'Profit credit failed for %: %', r.id, sqlerrm;
    end;
  end loop;
  return jsonb_build_object('credited', v_ok, 'failed', v_failed);
end;
$$;

-- 5. Admin adjustment ------------------------------------------------------------
create function public.wallet_admin_adjust(
  p_admin_id uuid, p_wallet_id uuid, p_direction public.txn_direction,
  p_amount numeric, p_reason text, p_idempotency_key text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a public.admin_users; w public.wallets; t public.wallet_transactions; v_before numeric;
begin
  if coalesce(p_idempotency_key, '') = '' then raise exception 'IDEMPOTENCY_KEY_REQUIRED'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'INVALID_AMOUNT'; end if;
  if length(btrim(coalesce(p_reason, ''))) < 5 then raise exception 'REASON_REQUIRED'; end if;

  select * into a from public.admin_users where id = p_admin_id and is_active and deleted_at is null;
  if not found or a.role not in ('super_admin', 'admin', 'finance') then raise exception 'NOT_AUTHORIZED'; end if;

  select * into w from public.wallets where id = p_wallet_id and deleted_at is null for update;
  if not found then raise exception 'WALLET_NOT_FOUND'; end if;

  select * into t from public.wallet_transactions where idempotency_key = p_idempotency_key;
  if found then return jsonb_build_object('transaction', to_jsonb(t), 'replayed', true); end if;

  v_before := w.balance;
  t := public.post_wallet_transaction(w.id, 'adjustment', p_direction, p_amount,
         'admin', a.id, p_idempotency_key, btrim(p_reason), jsonb_build_object('admin_id', a.id));

  perform public.write_audit('admin', null, a.id, 'wallet.admin_adjustment', 'wallet_transactions', t.id,
    jsonb_build_object('balance', v_before),
    jsonb_build_object('balance', t.balance_after, 'direction', p_direction, 'amount', p_amount, 'reason', btrim(p_reason)));
  perform public.push_notification(w.user_id, 'wallet', 'Wallet adjusted',
    'Your wallet balance was adjusted by our team.', jsonb_build_object('transaction_id', t.id));

  return jsonb_build_object('transaction', to_jsonb(t), 'replayed', false);
end;
$$;

-- Integrity check: stored balance must equal the sum of the ledger ---------------
create function public.wallet_reconcile(p_wallet_id uuid)
returns table (wallet_id uuid, balance numeric, ledger_balance numeric, is_balanced boolean)
language sql stable security definer set search_path = public as $$
  select w.id, w.balance,
         coalesce(sum(case when t.direction = 'credit' then t.amount else -t.amount end), 0),
         w.balance = coalesce(sum(case when t.direction = 'credit' then t.amount else -t.amount end), 0)
    from public.wallets w
    left join public.wallet_transactions t on t.wallet_id = w.id
   where w.id = p_wallet_id
   group by w.id, w.balance;
$$;

-- Read helpers. Security invoker, so row level security limits them to the caller.
create function public.wallet_history(
  p_wallet_id uuid, p_type public.txn_type default null, p_limit integer default 20,
  p_before_created timestamptz default null, p_before_id uuid default null
) returns setof public.wallet_transactions
language sql stable as $$
  select * from public.wallet_transactions
   where wallet_id = p_wallet_id
     and (p_type is null or type = p_type)
     and (p_before_created is null or (created_at, id) < (p_before_created, p_before_id))
   order by created_at desc, id desc
   limit least(greatest(p_limit, 1), 101);
$$;

create function public.wallet_summary(p_wallet_id uuid) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'total_credits', coalesce(sum(s.total) filter (where s.direction = 'credit'), 0),
    'total_debits',  coalesce(sum(s.total) filter (where s.direction = 'debit'), 0),
    'by_type',       coalesce(jsonb_object_agg(s.type::text || ':' || s.direction::text, s.total), '{}'::jsonb)
  )
  from (
    select type, direction, sum(amount) as total
      from public.wallet_transactions where wallet_id = p_wallet_id group by type, direction
  ) s;
$$;

-- Privileges -----------------------------------------------------------------------
revoke all on function
  public.get_setting, public.write_audit, public.push_notification, public.assert_can_transact,
  public.wallet_deposit, public.wallet_purchase_package, public.wallet_request_withdrawal,
  public.wallet_credit_profit, public.wallet_credit_due_profits, public.wallet_admin_adjust,
  public.wallet_reconcile, public.wallet_history, public.wallet_summary
  from public, anon, authenticated;

grant execute on function
  public.wallet_deposit, public.wallet_purchase_package, public.wallet_request_withdrawal,
  public.wallet_credit_profit, public.wallet_credit_due_profits, public.wallet_admin_adjust,
  public.wallet_reconcile, public.wallet_history, public.wallet_summary
  to service_role;

grant execute on function public.wallet_history, public.wallet_summary to authenticated;
