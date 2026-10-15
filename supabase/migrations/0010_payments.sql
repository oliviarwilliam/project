-- Paystack funding attempts. One row per checkout, kept forever (never deleted).
create table public.payments (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null,
  wallet_id               uuid not null,
  provider                text not null default 'paystack',
  reference               text not null,
  amount                  numeric(14,2) not null,
  currency                char(3) not null,
  status                  text not null default 'pending',
  authorization_url       text,
  access_code             text,
  provider_transaction_id text,
  channel                 text,
  gateway_response        text,
  failure_reason          text,
  paid_at                 timestamptz,
  wallet_txn_id           uuid unique references public.wallet_transactions (id) on delete restrict,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint payments_wallet_fk foreign key (wallet_id, user_id)
    references public.wallets (id, user_id) on delete restrict,
  constraint payments_reference_key unique (reference),
  constraint payments_amount_positive check (amount > 0),
  constraint payments_status_valid check (status in ('pending', 'success', 'failed', 'abandoned')),
  constraint payments_success_complete check (status <> 'success' or (wallet_txn_id is not null and paid_at is not null))
);
create index payments_user_idx    on public.payments (user_id, created_at desc);
create index payments_wallet_idx  on public.payments (wallet_id);
create index payments_pending_idx on public.payments (created_at) where status = 'pending';

create trigger set_updated_at before update on public.payments
  for each row execute function public.set_updated_at();

alter table public.payments enable row level security;
create policy "Read own payments" on public.payments
  for select to authenticated using (user_id = auth.uid());
create policy "Admins read all" on public.payments
  for select to authenticated using (public.is_admin());
revoke all on public.payments from anon;
revoke insert, update, delete on public.payments from authenticated;

-- Confirms a payment and credits the wallet in ONE transaction. Safe to call many
-- times for the same reference (verify page and webhook can race).
create function public.payment_complete(
  p_reference text, p_amount numeric, p_currency text, p_provider_id text,
  p_channel text, p_paid_at timestamptz, p_gateway_response text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.payments; d jsonb; v_replayed boolean;
begin
  select * into p from public.payments where reference = p_reference for update;
  if not found then raise exception 'PAYMENT_NOT_FOUND'; end if;

  if p.status = 'success' then
    return jsonb_build_object('payment', to_jsonb(p), 'credited', false);
  end if;

  -- Never credit an amount or currency different from what the member started with.
  if p_amount <> p.amount or upper(p_currency) <> p.currency then
    update public.payments
       set status = 'failed', failure_reason = 'AMOUNT_MISMATCH',
           provider_transaction_id = p_provider_id, gateway_response = p_gateway_response
     where id = p.id returning * into p;
    perform public.write_audit('system', null, null, 'payment.amount_mismatch', 'payments', p.id, null,
      jsonb_build_object('expected', p.amount, 'paid', p_amount, 'currency', p_currency));
    return jsonb_build_object('payment', to_jsonb(p), 'credited', false, 'reason', 'AMOUNT_MISMATCH');
  end if;

  d := public.wallet_deposit(
         p.user_id, p.currency, p.amount, 'deposit:paystack:' || p.reference, 'Paystack deposit',
         jsonb_build_object('provider', 'paystack', 'reference', p.reference, 'channel', p_channel));
  v_replayed := coalesce((d ->> 'replayed')::boolean, false);

  update public.payments
     set status = 'success', failure_reason = null, provider_transaction_id = p_provider_id,
         channel = p_channel, gateway_response = p_gateway_response,
         paid_at = coalesce(p_paid_at, now()), wallet_txn_id = (d -> 'transaction' ->> 'id')::uuid
   where id = p.id returning * into p;

  perform public.write_audit('system', null, null, 'payment.completed', 'payments', p.id, null,
    jsonb_build_object('reference', p.reference, 'amount', p.amount, 'currency', p.currency, 'channel', p_channel));

  return jsonb_build_object('payment', to_jsonb(p), 'credited', not v_replayed);
end;
$$;

revoke all on function public.payment_complete from public, anon, authenticated;
grant execute on function public.payment_complete to service_role;
