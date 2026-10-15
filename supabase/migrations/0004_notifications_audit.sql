-- notifications ----------------------------------------------------------
create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users (id) on delete cascade,
  type       public.notification_type not null default 'system',
  title      text not null,
  body       text,
  data       jsonb not null default '{}'::jsonb,
  read_at    timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint notifications_title_not_blank check (length(btrim(title)) > 0)
);
create index notifications_user_idx   on public.notifications (user_id, created_at desc) where deleted_at is null;
create index notifications_unread_idx on public.notifications (user_id) where deleted_at is null and read_at is null;

-- audit_logs: append-only ------------------------------------------------
create table public.audit_logs (
  id             uuid primary key default gen_random_uuid(),
  actor_type     text not null default 'system',
  actor_user_id  uuid references public.users (id) on delete restrict,
  actor_admin_id uuid references public.admin_users (id) on delete restrict,
  action         text not null,
  entity_table   text not null,
  entity_id      uuid,
  old_data       jsonb,
  new_data       jsonb,
  ip_address     inet,
  user_agent     text,
  created_at     timestamptz not null default now(),
  constraint audit_actor_type_valid check (actor_type in ('user', 'admin', 'system')),
  constraint audit_actor_matches check (
    (actor_type = 'user'  and actor_admin_id is null)
    or (actor_type = 'admin' and actor_user_id is null)
    or actor_type = 'system'
  )
);
create index audit_entity_idx  on public.audit_logs (entity_table, entity_id, created_at desc);
create index audit_user_idx    on public.audit_logs (actor_user_id, created_at desc) where actor_user_id is not null;
create index audit_admin_idx   on public.audit_logs (actor_admin_id, created_at desc) where actor_admin_id is not null;
create index audit_created_idx on public.audit_logs (created_at desc);
