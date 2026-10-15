-- Clean up the starter "profiles" table if an earlier migration created it.
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user() cascade;
drop table if exists public.profiles cascade;

create extension if not exists citext;

create type public.account_status     as enum ('active', 'suspended', 'closed');
create type public.txn_type           as enum ('deposit', 'withdrawal', 'package_purchase', 'earning', 'refund', 'adjustment');
create type public.txn_direction      as enum ('credit', 'debit');
create type public.package_status     as enum ('draft', 'active', 'archived');
create type public.user_package_status as enum ('active', 'completed', 'cancelled');
create type public.earning_status     as enum ('pending', 'credited', 'cancelled');
create type public.withdrawal_status  as enum ('pending', 'approved', 'rejected', 'processing', 'paid', 'failed', 'cancelled');
create type public.notification_type  as enum ('system', 'wallet', 'earning', 'withdrawal', 'package', 'security');
create type public.admin_role         as enum ('super_admin', 'admin', 'finance', 'support');

create function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
