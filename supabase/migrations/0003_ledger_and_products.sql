-- wallet_transactions: append-only ledger --------------------------------
create table public.wallet_transactions (
  id              uuid primary key default gen_random_uuid(),
  wallet_id       uuid not null,
  user_id         uuid not null,
  type            public.txn_type not null,
  direction       public.txn_direction not null,
  amount          numeric(14,2) not null,
  balance_after   numeric(14,2) not null,
  reference_type  text,
  reference_id    uuid,
  idempotency_key text,
  description     text,
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  constraint wallet_txn_wallet_fk foreign key (wallet_id, user_id)
    references public.wallets (id, user_id) on delete restrict,
  constraint wallet_txn_amount_positive check (amount > 0),
  constraint wallet_txn_balance_nonneg check (balance_after >= 0),
  constraint wallet_txn_idempotency_key unique (idempotency_key),
  constraint wallet_txn_type_direction check (
    (type in ('deposit', 'earning', 'refund') and direction = 'credit')
    or (type in ('withdrawal', 'package_purchase') and direction = 'debit')
    or type = 'adjustment'
  ),
  constraint wallet_txn_reference_pair check ((reference_type is null) = (reference_id is null))
);
create index wallet_txn_wallet_idx    on public.wallet_transactions (wallet_id, created_at desc);
create index wallet_txn_user_idx      on public.wallet_transactions (user_id, created_at desc);
create index wallet_txn_reference_idx on public.wallet_transactions (reference_type, reference_id);

-- user_packages ----------------------------------------------------------
create table public.user_packages (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references public.users (id) on delete restrict,
  package_id           uuid not null references public.packages (id) on delete restrict,
  purchase_txn_id      uuid not null unique references public.wallet_transactions (id) on delete restrict,
  amount               numeric(14,2) not null,
  return_rate          numeric(6,4) not null,
  payout_interval_days integer not null,
  starts_at            timestamptz not null default now(),
  ends_at              timestamptz not null,
  next_payout_at       timestamptz,
  status               public.user_package_status not null default 'active',
  cancelled_at         timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  deleted_at           timestamptz,
  constraint user_packages_amount_positive check (amount > 0),
  constraint user_packages_rate_range check (return_rate >= 0 and return_rate <= 1),
  constraint user_packages_interval_positive check (payout_interval_days > 0),
  constraint user_packages_dates_valid check (ends_at > starts_at),
  constraint user_packages_cancel_consistent check ((status = 'cancelled') = (cancelled_at is not null)),
  constraint user_packages_id_user_key unique (id, user_id)
);
create index user_packages_user_idx   on public.user_packages (user_id, created_at desc) where deleted_at is null;
create index user_packages_package_idx on public.user_packages (package_id);
-- The payout job scans this index for due packages.
create index user_packages_due_idx    on public.user_packages (next_payout_at) where status = 'active' and deleted_at is null;

-- earnings ---------------------------------------------------------------
create table public.earnings (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null,
  user_package_id uuid not null,
  amount          numeric(14,2) not null,
  period_start    timestamptz not null,
  period_end      timestamptz not null,
  status          public.earning_status not null default 'pending',
  credited_txn_id uuid unique references public.wallet_transactions (id) on delete restrict,
  credited_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  constraint earnings_package_fk foreign key (user_package_id, user_id)
    references public.user_packages (id, user_id) on delete restrict,
  constraint earnings_amount_positive check (amount > 0),
  constraint earnings_period_valid check (period_end > period_start),
  constraint earnings_credit_consistent check (
    status <> 'credited' or (credited_txn_id is not null and credited_at is not null)
  ),
  -- One payout per package per period. Stops double payments if a job runs twice.
  constraint earnings_period_key unique (user_package_id, period_start)
);
create index earnings_user_idx   on public.earnings (user_id, created_at desc) where deleted_at is null;
create index earnings_status_idx on public.earnings (status) where deleted_at is null and status = 'pending';

-- withdrawals ------------------------------------------------------------
create table public.withdrawals (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null,
  wallet_id          uuid not null,
  amount             numeric(14,2) not null,
  fee                numeric(14,2) not null default 0,
  net_amount         numeric(14,2) generated always as (amount - fee) stored,
  method             text not null,
  destination        jsonb not null default '{}'::jsonb,
  status             public.withdrawal_status not null default 'pending',
  hold_txn_id        uuid unique references public.wallet_transactions (id) on delete restrict,
  refund_txn_id      uuid unique references public.wallet_transactions (id) on delete restrict,
  reviewed_by        uuid references public.admin_users (id) on delete set null,
  reviewed_at        timestamptz,
  rejection_reason   text,
  external_reference text,
  processed_at       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz,
  constraint withdrawals_wallet_fk foreign key (wallet_id, user_id)
    references public.wallets (id, user_id) on delete restrict,
  constraint withdrawals_amount_positive check (amount > 0),
  constraint withdrawals_fee_valid check (fee >= 0 and fee < amount),
  constraint withdrawals_rejection_needs_reason check (status <> 'rejected' or rejection_reason is not null),
  constraint withdrawals_review_needs_time check (status not in ('approved', 'rejected') or reviewed_at is not null),
  constraint withdrawals_paid_needs_time check (status <> 'paid' or processed_at is not null)
);
create index withdrawals_user_idx  on public.withdrawals (user_id, created_at desc) where deleted_at is null;
create index withdrawals_wallet_idx on public.withdrawals (wallet_id);
-- Admin review queue.
create index withdrawals_queue_idx on public.withdrawals (status, created_at) where deleted_at is null and status in ('pending', 'approved', 'processing');
create index withdrawals_reviewer_idx on public.withdrawals (reviewed_by);
