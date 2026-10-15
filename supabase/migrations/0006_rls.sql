create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.admin_users
    where user_id = auth.uid() and is_active and deleted_at is null
  );
$$;

alter table public.users               enable row level security;
alter table public.wallets             enable row level security;
alter table public.wallet_transactions enable row level security;
alter table public.packages            enable row level security;
alter table public.user_packages       enable row level security;
alter table public.earnings            enable row level security;
alter table public.withdrawals         enable row level security;
alter table public.notifications       enable row level security;
alter table public.audit_logs          enable row level security;
alter table public.admin_users         enable row level security;
alter table public.settings            enable row level security;

-- Members read their own rows ------------------------------------------
create policy "Read own profile" on public.users
  for select to authenticated using (id = auth.uid() and deleted_at is null);
create policy "Update own profile" on public.users
  for update to authenticated using (id = auth.uid() and deleted_at is null) with check (id = auth.uid());

create policy "Read own wallets" on public.wallets
  for select to authenticated using (user_id = auth.uid() and deleted_at is null);
create policy "Read own transactions" on public.wallet_transactions
  for select to authenticated using (user_id = auth.uid());
create policy "Read own packages" on public.user_packages
  for select to authenticated using (user_id = auth.uid() and deleted_at is null);
create policy "Read own earnings" on public.earnings
  for select to authenticated using (user_id = auth.uid() and deleted_at is null);
create policy "Read own withdrawals" on public.withdrawals
  for select to authenticated using (user_id = auth.uid() and deleted_at is null);

create policy "Read own notifications" on public.notifications
  for select to authenticated using (user_id = auth.uid() and deleted_at is null);
create policy "Update own notifications" on public.notifications
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Catalog and public settings ------------------------------------------
create policy "Read active packages" on public.packages
  for select to authenticated using (status = 'active' and deleted_at is null);
create policy "Read public settings" on public.settings
  for select to anon, authenticated using (is_public and deleted_at is null);

-- Admins can read everything (writes go through the service role) -------
do $$
declare t text;
begin
  foreach t in array array[
    'users', 'wallets', 'wallet_transactions', 'packages', 'user_packages', 'earnings',
    'withdrawals', 'notifications', 'audit_logs', 'admin_users', 'settings'
  ] loop
    execute format(
      'create policy "Admins read all" on public.%I for select to authenticated using (public.is_admin())', t);
  end loop;
end $$;

-- Privileges: members can only change a few harmless columns -------------
revoke all on all tables in schema public from anon;
revoke insert, update, delete on all tables in schema public from authenticated;

grant select on public.settings, public.packages to anon;
grant update (username, display_name, avatar_url, phone) on public.users to authenticated;
grant update (read_at, deleted_at) on public.notifications to authenticated;
