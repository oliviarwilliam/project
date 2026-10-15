-- admin_users -----------------------------------------------------------
create table public.admin_users (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  role          public.admin_role not null default 'support',
  is_active     boolean not null default true,
  last_login_at timestamptz,
  created_by    uuid references public.admin_users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create unique index admin_users_user_key on public.admin_users (user_id) where deleted_at is null;
create index admin_users_role_idx on public.admin_users (role) where deleted_at is null;

-- users (profile row for each auth.users row) ---------------------------
create table public.users (
  id                  uuid primary key references auth.users (id) on delete cascade,
  email               citext not null,
  username            citext,
  display_name        text,
  avatar_url          text,
  phone               text,
  country_code        char(2),
  date_of_birth       date,
  guardian_email      citext,
  guardian_consent_at timestamptz,
  status              public.account_status not null default 'active',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz,
  constraint users_username_format check (username is null or username::text ~ '^[a-z0-9_]{3,24}$'),
  constraint users_dob_range check (date_of_birth is null or (date_of_birth > date '1900-01-01' and date_of_birth <= current_date)),
  constraint users_country_upper check (country_code is null or country_code = upper(country_code)),
  constraint users_consent_needs_guardian check (guardian_consent_at is null or guardian_email is not null)
);
create unique index users_email_key    on public.users (email)    where deleted_at is null;
create unique index users_username_key on public.users (username) where deleted_at is null and username is not null;
create index users_status_idx  on public.users (status) where deleted_at is null;
create index users_created_idx on public.users (created_at desc);

-- settings ---------------------------------------------------------------
create table public.settings (
  id          uuid primary key default gen_random_uuid(),
  key         text not null,
  value       jsonb not null,
  description text,
  is_public   boolean not null default false,
  updated_by  uuid references public.admin_users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  constraint settings_key_format check (key ~ '^[a-z0-9_.]+$')
);
create unique index settings_key_key on public.settings (key) where deleted_at is null;

-- wallets ----------------------------------------------------------------
create table public.wallets (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users (id) on delete restrict,
  currency   char(3) not null default 'USD',
  balance    numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint wallets_balance_nonneg check (balance >= 0),
  constraint wallets_currency_upper check (currency = upper(currency)),
  -- Lets child tables prove that a wallet belongs to the same user.
  constraint wallets_id_user_key unique (id, user_id)
);
create unique index wallets_user_currency_key on public.wallets (user_id, currency) where deleted_at is null;

-- packages ---------------------------------------------------------------
create table public.packages (
  id                   uuid primary key default gen_random_uuid(),
  slug                 text not null,
  name                 text not null,
  description          text,
  price                numeric(14,2) not null,
  currency             char(3) not null default 'USD',
  return_rate          numeric(6,4) not null default 0,
  payout_interval_days integer not null default 7,
  duration_days        integer not null,
  max_per_user         integer,
  status               public.package_status not null default 'draft',
  sort_order           integer not null default 0,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  deleted_at           timestamptz,
  constraint packages_slug_format check (slug ~ '^[a-z0-9-]+$'),
  constraint packages_price_positive check (price > 0),
  constraint packages_rate_range check (return_rate >= 0 and return_rate <= 1),
  constraint packages_interval_positive check (payout_interval_days > 0),
  constraint packages_duration_valid check (duration_days >= payout_interval_days),
  constraint packages_max_positive check (max_per_user is null or max_per_user > 0)
);
create unique index packages_slug_key on public.packages (slug) where deleted_at is null;
create index packages_status_idx on public.packages (status, sort_order) where deleted_at is null;
