-- ============================================================================
-- Paystack transfers: pay approved withdrawals straight to the member's bank.
-- Paystack cannot be called from inside a database transaction, so the work is split:
--   transfer_begin      DB: record the attempt and mark the withdrawal "processing"
--   (Paystack calls)    app: create recipient, start the transfer
--   transfer_mark_sent  DB: remember Paystack's transfer code
--   transfer_complete   DB: paid, or failed with a retry plan (from webhook or verify)
-- Every attempt has its own unique reference, so a retry can never pay twice.
-- ============================================================================

insert into public.settings (key, value, description, is_public) values
  ('transfer_max_attempts', '3', 'Automatic transfer attempts per withdrawal before an admin must step in', false)
on conflict (key) where deleted_at is null do nothing;

-- Saved Paystack recipients (one per bank account) ---------------------------------------
create table public.transfer_recipients (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.users (id) on delete restrict,
  bank_code      text not null,
  bank_name      text,
  account_number text not null,
  account_name   text not null,
  currency       char(3) not null,
  recipient_code text not null unique,
  created_at     timestamptz not null default now(),
  constraint transfer_recipients_account_key unique (user_id, bank_code, account_number, currency)
);

-- One row per transfer attempt ------------------------------------------------------------
create table public.withdrawal_transfers (
  id             uuid primary key default gen_random_uuid(),
  withdrawal_id  uuid not null references public.withdrawals (id) on delete restrict,
  attempt        integer not null,
  reference      text not null,
  recipient_code text,
  transfer_code  text,
  amount         numeric(14,2) not null,
  currency       char(3) not null,
  status         text not null default 'queued',
  paystack_status text,
  failure_reason text,
  retryable      boolean not null default false,
  retry_after    timestamptz,
  trigger        text not null,
  initiated_by   uuid references public.admin_users (id) on delete set null,
  sent_at        timestamptz,
  completed_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint withdrawal_transfers_reference_key unique (reference),
  constraint withdrawal_transfers_attempt_key unique (withdrawal_id, attempt),
  constraint withdrawal_transfers_status_valid check (status in ('queued', 'pending', 'success', 'failed', 'reversed')),
  constraint withdrawal_transfers_trigger_valid check (trigger in ('approval', 'manual', 'retry')),
  constraint withdrawal_transfers_amount_positive check (amount > 0)
);
-- At most one live attempt per withdrawal.
create unique index withdrawal_transfers_active_key on public.withdrawal_transfers (withdrawal_id) where status in ('queued', 'pending');
create index withdrawal_transfers_status_idx on public.withdrawal_transfers (status, created_at);
create index withdrawal_transfers_retry_idx on public.withdrawal_transfers (retry_after) where status in ('failed', 'reversed') and retryable;

create trigger set_updated_at before update on public.withdrawal_transfers
  for each row execute function public.set_updated_at();

alter table public.transfer_recipients enable row level security;
alter table public.withdrawal_transfers enable row level security;
create policy "Admins read all" on public.transfer_recipients for select to authenticated using (public.is_admin());
create policy "Admins read all" on public.withdrawal_transfers for select to authenticated using (public.is_admin());
revoke all on public.transfer_recipients, public.withdrawal_transfers from anon;
revoke insert, update, delete on public.transfer_recipients, public.withdrawal_transfers from authenticated;

-- Helper: tell every reviewing admin ---------------------------------------------------------
create function public.notify_admins(p_title text, p_body text, p_data jsonb default '{}'::jsonb) returns void
language sql security definer set search_path = public as $$
  insert into public.notifications (user_id, type, title, body, data)
  select a.user_id, 'withdrawal', p_title, p_body, p_data
    from public.admin_users a
    join public.users au on au.id = a.user_id and au.deleted_at is null
   where a.is_active and a.deleted_at is null and a.role in ('super_admin', 'admin', 'finance');
$$;

-- 1. Start an attempt. Safe to call again: a live attempt is returned as it is. ---------------
create function public.transfer_begin(
  p_withdrawal_id uuid, p_admin_id uuid default null, p_trigger text default 'approval'
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare wd public.withdrawals; w public.wallets; t public.withdrawal_transfers; v_attempts integer; v_max integer;
begin
  if p_admin_id is not null then perform public.assert_finance_admin(p_admin_id); end if;

  select * into wd from public.withdrawals where id = p_withdrawal_id and deleted_at is null for update;
  if not found then raise exception 'WITHDRAWAL_NOT_FOUND'; end if;

  select * into t from public.withdrawal_transfers where withdrawal_id = wd.id and status in ('queued', 'pending');
  if found then return jsonb_build_object('transfer', to_jsonb(t), 'existing', true); end if;

  if wd.status <> 'approved' then raise exception 'WITHDRAWAL_NOT_APPROVED'; end if;

  select count(*) into v_attempts from public.withdrawal_transfers where withdrawal_id = wd.id;
  v_max := coalesce((public.get_setting('transfer_max_attempts') #>> '{}')::integer, 3);
  -- Automatic retries stop at the limit. An admin can always try again.
  if p_admin_id is null and v_attempts >= v_max then raise exception 'TRANSFER_ATTEMPTS_EXHAUSTED'; end if;

  select * into w from public.wallets where id = wd.wallet_id;

  insert into public.withdrawal_transfers (withdrawal_id, attempt, reference, amount, currency, trigger, initiated_by)
  values (wd.id, v_attempts + 1, 'tvw-' || replace(wd.id::text, '-', '') || '-' || (v_attempts + 1),
          wd.net_amount, w.currency, p_trigger, p_admin_id)
  returning * into t;

  update public.withdrawals set status = 'processing' where id = wd.id;

  perform public.write_audit(case when p_admin_id is null then 'system' else 'admin' end, null, p_admin_id,
    'withdrawal.transfer_started', 'withdrawals', wd.id, jsonb_build_object('status', 'approved'),
    jsonb_build_object('status', 'processing', 'attempt', t.attempt, 'reference', t.reference, 'amount', t.amount));

  return jsonb_build_object('transfer', to_jsonb(t), 'existing', false);
end;
$$;

-- 3. Paystack accepted the transfer ---------------------------------------------------------------
create function public.transfer_mark_sent(
  p_transfer_id uuid, p_recipient_code text, p_transfer_code text, p_paystack_status text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t public.withdrawal_transfers;
begin
  update public.withdrawal_transfers
     set status = 'pending', recipient_code = coalesce(p_recipient_code, recipient_code),
         transfer_code = coalesce(p_transfer_code, transfer_code), paystack_status = p_paystack_status,
         sent_at = coalesce(sent_at, now())
   where id = p_transfer_id and status in ('queued', 'pending')
   returning * into t;
  if not found then raise exception 'TRANSFER_NOT_FOUND'; end if;
  return to_jsonb(t);
end;
$$;

-- 4 and 5. The final answer: update the status and notify. Safe to repeat. -------------------------
create function public.transfer_complete(
  p_reference text, p_outcome text, p_transfer_code text default null,
  p_reason text default null, p_retryable boolean default true
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  t public.withdrawal_transfers; wd public.withdrawals; v_max integer; v_final boolean;
  v_reason text := left(coalesce(nullif(btrim(p_reason), ''), 'Transfer failed'), 300);
begin
  if p_outcome not in ('success', 'failed', 'reversed') then raise exception 'VALIDATION_ERROR'; end if;

  select * into t from public.withdrawal_transfers where reference = p_reference for update;
  if not found then raise exception 'TRANSFER_NOT_FOUND'; end if;
  select * into wd from public.withdrawals where id = t.withdrawal_id for update;

  if p_outcome = 'success' then
    if t.status = 'success' then return jsonb_build_object('status', 'success', 'replayed', true); end if;

    update public.withdrawal_transfers
       set status = 'success', transfer_code = coalesce(p_transfer_code, transfer_code),
           failure_reason = null, retryable = false, retry_after = null, completed_at = now()
     where id = t.id returning * into t;

    if wd.status in ('processing', 'approved') then
      update public.withdrawals
         set status = 'paid', processed_at = now(), external_reference = coalesce(t.transfer_code, t.reference)
       where id = wd.id returning * into wd;

      perform public.write_audit('system', null, null, 'withdrawal.transfer_succeeded', 'withdrawals', wd.id,
        jsonb_build_object('status', 'processing'),
        jsonb_build_object('status', 'paid', 'reference', t.reference, 'transfer_code', t.transfer_code, 'amount', t.amount));
      perform public.push_notification(wd.user_id, 'withdrawal', 'Withdrawal paid',
        format('%s %s was sent to your bank account.', t.amount, trim(t.currency)),
        jsonb_build_object('withdrawal_id', wd.id));
    else
      -- The money left but the request is no longer waiting (for example it was refunded). A person must look.
      perform public.write_audit('system', null, null, 'withdrawal.transfer_anomaly', 'withdrawals', wd.id, null,
        jsonb_build_object('withdrawal_status', wd.status, 'reference', t.reference, 'amount', t.amount));
      perform public.notify_admins('Transfer needs attention',
        format('A transfer of %s %s succeeded for a withdrawal that is already %s.', t.amount, trim(t.currency), wd.status),
        jsonb_build_object('withdrawal_id', wd.id));
    end if;
    return jsonb_build_object('status', 'success', 'replayed', false);
  end if;

  -- failed or reversed
  if t.status in ('failed', 'reversed') then return jsonb_build_object('status', t.status, 'replayed', true); end if;
  if t.status = 'success' and p_outcome = 'failed' then return jsonb_build_object('status', 'success', 'ignored', true); end if;

  v_max := coalesce((public.get_setting('transfer_max_attempts') #>> '{}')::integer, 3);
  v_final := (not p_retryable) or t.attempt >= v_max;

  update public.withdrawal_transfers
     set status = p_outcome, failure_reason = v_reason, retryable = not v_final,
         retry_after = case when v_final then null else now() + interval '10 minutes' * (3 ^ (t.attempt - 1)) end,
         completed_at = now()
   where id = t.id returning * into t;

  -- Back to "approved": the money is still held, and the next attempt, an admin, or a refund can follow.
  if wd.status in ('processing', 'paid') then
    update public.withdrawals set status = 'approved', processed_at = null, external_reference = null
     where id = wd.id returning * into wd;
  end if;

  perform public.write_audit('system', null, null, 'withdrawal.transfer_' || p_outcome, 'withdrawals', wd.id, null,
    jsonb_build_object('attempt', t.attempt, 'reason', v_reason, 'final', v_final, 'retry_after', t.retry_after));

  if v_final then
    perform public.notify_admins('Transfer failed',
      format('A %s %s withdrawal could not be sent after %s attempt(s): %s', t.amount, trim(t.currency), t.attempt, v_reason),
      jsonb_build_object('withdrawal_id', wd.id));
    perform public.push_notification(wd.user_id, 'withdrawal', 'Withdrawal delayed',
      'We could not send your withdrawal yet. Our team is looking into it and your money is safe.',
      jsonb_build_object('withdrawal_id', wd.id));
  end if;

  return jsonb_build_object('status', p_outcome, 'final', v_final, 'retry_after', t.retry_after);
end;
$$;

-- Work for the scheduled job: stuck, unconfirmed and retry-ready transfers ---------------------------
create function public.transfer_work_queue(p_limit integer default 25) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_max integer := coalesce((public.get_setting('transfer_max_attempts') #>> '{}')::integer, 3);
begin
  return coalesce((
    select jsonb_agg(to_jsonb(x)) from (
      select * from (
        -- Saved but never sent (the app stopped between steps).
        select 'resume'::text as kind, t.withdrawal_id, t.id as transfer_id, t.created_at as since
          from public.withdrawal_transfers t
         where t.status = 'queued' and t.created_at < now() - interval '2 minutes'
        union all
        -- Sent, but the webhook never arrived.
        select 'verify', t.withdrawal_id, t.id, t.sent_at
          from public.withdrawal_transfers t
         where t.status = 'pending' and t.sent_at < now() - interval '15 minutes'
        union all
        -- Failed earlier, now due for another try.
        select 'retry', wd.id, null::uuid, lt.retry_after
          from public.withdrawals wd
          join lateral (select * from public.withdrawal_transfers t where t.withdrawal_id = wd.id order by t.attempt desc limit 1) lt on true
         where wd.status = 'approved' and wd.deleted_at is null
           and lt.status in ('failed', 'reversed') and lt.retryable and lt.retry_after <= now() and lt.attempt < v_max
      ) u order by since limit least(greatest(p_limit, 1), 100)
    ) x), '[]'::jsonb);
end;
$$;

-- Manual "mark paid" must not race a live transfer (replaces the function from 0014) --------------------
create or replace function public.withdrawal_mark_paid(p_admin_id uuid, p_withdrawal_id uuid, p_reference text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare wd public.withdrawals;
begin
  perform public.assert_finance_admin(p_admin_id);

  select * into wd from public.withdrawals where id = p_withdrawal_id and deleted_at is null for update;
  if not found then raise exception 'WITHDRAWAL_NOT_FOUND'; end if;
  if wd.status not in ('approved', 'processing') then raise exception 'WITHDRAWAL_NOT_APPROVED'; end if;
  if exists (select 1 from public.withdrawal_transfers where withdrawal_id = wd.id and status in ('queued', 'pending')) then
    raise exception 'TRANSFER_IN_PROGRESS';
  end if;

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

revoke all on function
  public.notify_admins, public.transfer_begin, public.transfer_mark_sent, public.transfer_complete, public.transfer_work_queue
  from public, anon, authenticated;
grant execute on function
  public.transfer_begin, public.transfer_mark_sent, public.transfer_complete, public.transfer_work_queue
  to service_role;
