-- updated_at triggers ----------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'admin_users', 'users', 'settings', 'wallets', 'packages',
    'user_packages', 'earnings', 'withdrawals', 'notifications'
  ] loop
    execute format(
      'create trigger set_updated_at before update on public.%I
       for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- Ledger and audit rows can never be edited or removed -------------------
create function public.prevent_mutation() returns trigger
language plpgsql as $$
begin
  raise exception '% is append only. Add a correcting entry instead.', tg_table_name;
end;
$$;

create trigger wallet_transactions_immutable
  before update or delete on public.wallet_transactions
  for each row execute function public.prevent_mutation();

create trigger audit_logs_immutable
  before update or delete on public.audit_logs
  for each row execute function public.prevent_mutation();

-- The only way to move money ---------------------------------------------
create function public.post_wallet_transaction(
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
  if p_idempotency_key is not null then
    select * into t from public.wallet_transactions where idempotency_key = p_idempotency_key;
    if found then return t; end if;
  end if;

  select * into w from public.wallets
   where id = p_wallet_id and deleted_at is null
   for update;
  if not found then raise exception 'Wallet not found'; end if;

  new_balance := case when p_direction = 'credit' then w.balance + p_amount else w.balance - p_amount end;
  if new_balance < 0 then raise exception 'Insufficient funds'; end if;

  update public.wallets set balance = new_balance where id = w.id;

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

revoke all on function public.post_wallet_transaction from public, anon, authenticated;
grant execute on function public.post_wallet_transaction to service_role;

-- Create the profile row and a default wallet on signup ------------------
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, email, display_name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'display_name');

  insert into public.wallets (user_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
