-- Hardens wallet_purchase_package (first added in 0009). Same signature, same grants.
-- One transaction does all of this: validate, lock, deduct, create the package,
-- write the ledger row, write the audit log, notify the member.

insert into public.settings (key, value, description, is_public) values
  ('purchase_duplicate_window_seconds', '30',
   'Block buying the same package again within this many seconds. 0 turns the check off.', false)
on conflict (key) where deleted_at is null do nothing;

-- Returns the original result when a key was already used. Null when it is new.
create function public.purchase_replay(p_key text, p_package_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare t public.wallet_transactions; up public.user_packages;
begin
  select * into t from public.wallet_transactions where idempotency_key = p_key;
  if not found then return null; end if;

  select * into up from public.user_packages where purchase_txn_id = t.id;
  -- The same key may not be reused for a different package or a different kind of action.
  if not found or up.package_id <> p_package_id then raise exception 'IDEMPOTENCY_KEY_REUSED'; end if;

  return jsonb_build_object('user_package', to_jsonb(up), 'transaction', to_jsonb(t), 'replayed', true);
end;
$$;
revoke all on function public.purchase_replay from public, anon, authenticated;

create or replace function public.wallet_purchase_package(
  p_user_id uuid, p_package_id uuid, p_idempotency_key text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  pkg public.packages; w public.wallets; t public.wallet_transactions; up public.user_packages;
  v_id uuid := gen_random_uuid(); v_held integer; v_window integer; v_replay jsonb;
begin
  if coalesce(p_idempotency_key, '') = '' then raise exception 'IDEMPOTENCY_KEY_REQUIRED'; end if;

  -- A retry of a finished purchase returns the same result, even if the package changed since.
  v_replay := public.purchase_replay(p_idempotency_key, p_package_id);
  if v_replay is not null then return v_replay; end if;

  perform public.assert_can_transact(p_user_id);

  -- FOR SHARE: an admin editing or disabling the package waits until this purchase commits.
  select * into pkg from public.packages
   where id = p_package_id and status = 'active' and deleted_at is null for share;
  if not found then raise exception 'PACKAGE_UNAVAILABLE'; end if;

  -- Locking the wallet makes every purchase by this member run one at a time.
  select * into w from public.wallets
   where user_id = p_user_id and currency = pkg.currency and deleted_at is null for update;
  if not found then raise exception 'WALLET_NOT_FOUND'; end if;

  -- Check again now that we hold the lock: a parallel request with the same key may have just finished.
  v_replay := public.purchase_replay(p_idempotency_key, p_package_id);
  if v_replay is not null then return v_replay; end if;

  -- Duplicate guard for double clicks and two open tabs, which send different keys.
  v_window := coalesce((public.get_setting('purchase_duplicate_window_seconds') #>> '{}')::integer, 30);
  if v_window > 0 and exists (
    select 1 from public.user_packages
     where user_id = p_user_id and package_id = pkg.id and deleted_at is null
       and created_at > now() - make_interval(secs => v_window)
  ) then
    raise exception 'DUPLICATE_PURCHASE';
  end if;

  if pkg.max_per_user is not null then
    select count(*) into v_held from public.user_packages
     where user_id = p_user_id and package_id = pkg.id and status = 'active' and deleted_at is null;
    if v_held >= pkg.max_per_user then raise exception 'PACKAGE_LIMIT_REACHED'; end if;
  end if;

  if w.balance < pkg.price then raise exception 'INSUFFICIENT_FUNDS'; end if;

  -- Deduct and write the ledger row.
  t := public.post_wallet_transaction(w.id, 'package_purchase', 'debit', pkg.price,
         'user_package', v_id, p_idempotency_key, 'Purchased ' || pkg.name,
         jsonb_build_object('package_id', pkg.id, 'package_name', pkg.name));

  -- Create the active package with the terms as they are right now.
  insert into public.user_packages
    (id, user_id, package_id, purchase_txn_id, amount, return_rate, payout_interval_days,
     starts_at, ends_at, next_payout_at, status)
  values
    (v_id, p_user_id, pkg.id, t.id, pkg.price, pkg.return_rate, pkg.payout_interval_days,
     now(), now() + make_interval(days => pkg.duration_days),
     now() + make_interval(days => pkg.payout_interval_days), 'active')
  returning * into up;

  perform public.write_audit('user', p_user_id, null, 'wallet.package_purchase', 'user_packages', up.id, null,
    jsonb_build_object('package_id', pkg.id, 'package_name', pkg.name, 'amount', pkg.price,
                       'transaction_id', t.id, 'balance_before', w.balance, 'balance_after', t.balance_after));
  perform public.push_notification(p_user_id, 'package', 'Package purchased',
    format('You bought %s for %s %s.', pkg.name, pkg.price, pkg.currency),
    jsonb_build_object('user_package_id', up.id));

  return jsonb_build_object('user_package', to_jsonb(up), 'transaction', to_jsonb(t), 'replayed', false);
end;
$$;
