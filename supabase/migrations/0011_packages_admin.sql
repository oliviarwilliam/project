-- Package names must be unique among live packages, ignoring case.
create unique index packages_name_key on public.packages (lower(name)) where deleted_at is null;

-- Live packages with subscriber counts, for the admin list (service role only) ----
create view public.package_stats as
select p.*,
       coalesce(s.active_subscribers, 0)::integer       as active_subscribers,
       coalesce(s.total_invested, 0)::numeric(14,2)     as total_invested
  from public.packages p
  left join (
    select package_id, count(*) as active_subscribers, sum(amount) as total_invested
      from public.user_packages
     where status = 'active' and deleted_at is null
     group by package_id
  ) s on s.package_id = p.id
 where p.deleted_at is null;

revoke all on public.package_stats from public, anon, authenticated;
grant select on public.package_stats to service_role;

-- Only super admins and admins may manage packages ---------------------------------
create function public.assert_package_admin(p_admin_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare a public.admin_users;
begin
  select * into a from public.admin_users where id = p_admin_id and is_active and deleted_at is null;
  if not found or a.role not in ('super_admin', 'admin') then raise exception 'NOT_AUTHORIZED'; end if;
end;
$$;

-- Create ---------------------------------------------------------------------------
-- "Daily profit" is a percent of the amount, paid every day (payout interval = 1).
create function public.admin_create_package(
  p_admin_id uuid, p_name text, p_price numeric, p_daily_profit_percent numeric,
  p_duration_days integer, p_status public.package_status default 'draft',
  p_description text default null, p_currency text default 'USD',
  p_max_per_user integer default null, p_sort_order integer default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare pkg public.packages; v_name text; v_slug text;
begin
  perform public.assert_package_admin(p_admin_id);

  v_name := btrim(p_name);
  v_slug := trim(both '-' from regexp_replace(lower(v_name), '[^a-z0-9]+', '-', 'g'));
  if v_slug = '' then raise exception 'VALIDATION_ERROR'; end if;
  if exists (select 1 from public.packages
              where deleted_at is null and (slug = v_slug or lower(name) = lower(v_name))) then
    raise exception 'PACKAGE_NAME_TAKEN';
  end if;

  insert into public.packages
    (slug, name, description, price, currency, return_rate, payout_interval_days,
     duration_days, max_per_user, status, sort_order)
  values
    (v_slug, v_name, nullif(btrim(p_description), ''), p_price, upper(p_currency),
     round(p_daily_profit_percent / 100, 4), 1, p_duration_days, p_max_per_user, p_status,
     coalesce(p_sort_order, (select coalesce(max(sort_order), 0) + 10 from public.packages where deleted_at is null)))
  returning * into pkg;

  perform public.write_audit('admin', null, p_admin_id, 'package.created', 'packages', pkg.id, null, to_jsonb(pkg));
  return to_jsonb(pkg);
end;
$$;

-- Edit (partial). Only keys present in p_changes are touched. Slug and currency never change.
-- Members who already bought keep the price, rate and dates they bought at.
create function public.admin_update_package(p_admin_id uuid, p_package_id uuid, p_changes jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare old public.packages; pkg public.packages; v_name text; v_duration integer;
begin
  perform public.assert_package_admin(p_admin_id);

  select * into old from public.packages where id = p_package_id and deleted_at is null for update;
  if not found then raise exception 'PACKAGE_NOT_FOUND'; end if;

  v_name := case when p_changes ? 'name' then btrim(p_changes ->> 'name') else old.name end;
  if exists (select 1 from public.packages
              where deleted_at is null and id <> old.id and lower(name) = lower(v_name)) then
    raise exception 'PACKAGE_NAME_TAKEN';
  end if;

  v_duration := case when p_changes ? 'duration_days' then (p_changes ->> 'duration_days')::integer else old.duration_days end;
  if v_duration < old.payout_interval_days then raise exception 'INVALID_DURATION'; end if;

  update public.packages set
    name         = v_name,
    description  = case when p_changes ? 'description' then nullif(btrim(p_changes ->> 'description'), '') else description end,
    price        = case when p_changes ? 'price' then (p_changes ->> 'price')::numeric else price end,
    return_rate  = case when p_changes ? 'daily_profit_percent'
                        then round((p_changes ->> 'daily_profit_percent')::numeric / 100 * payout_interval_days, 4)
                        else return_rate end,
    duration_days = v_duration,
    status       = case when p_changes ? 'status' then (p_changes ->> 'status')::public.package_status else status end,
    max_per_user = case when p_changes ? 'max_per_user' then (p_changes ->> 'max_per_user')::integer else max_per_user end,
    sort_order   = case when p_changes ? 'sort_order' then (p_changes ->> 'sort_order')::integer else sort_order end
  where id = old.id
  returning * into pkg;

  perform public.write_audit('admin', null, p_admin_id, 'package.updated', 'packages', pkg.id, to_jsonb(old), to_jsonb(pkg));
  return to_jsonb(pkg);
end;
$$;

-- Enable / disable. A disabled package cannot be bought, but existing subscriptions keep running.
create function public.admin_set_package_status(p_admin_id uuid, p_package_id uuid, p_status public.package_status)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare old public.packages; pkg public.packages;
begin
  perform public.assert_package_admin(p_admin_id);

  select * into old from public.packages where id = p_package_id and deleted_at is null for update;
  if not found then raise exception 'PACKAGE_NOT_FOUND'; end if;

  update public.packages set status = p_status where id = old.id returning * into pkg;

  perform public.write_audit('admin', null, p_admin_id,
    case p_status when 'archived' then 'package.disabled' when 'active' then 'package.enabled' else 'package.status_changed' end,
    'packages', pkg.id, jsonb_build_object('status', old.status), jsonb_build_object('status', pkg.status));
  return to_jsonb(pkg);
end;
$$;

-- Soft delete. Blocked while members still have it running: disable it instead.
create function public.admin_delete_package(p_admin_id uuid, p_package_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare pkg public.packages;
begin
  perform public.assert_package_admin(p_admin_id);

  select * into pkg from public.packages where id = p_package_id and deleted_at is null for update;
  if not found then raise exception 'PACKAGE_NOT_FOUND'; end if;

  if exists (select 1 from public.user_packages
              where package_id = pkg.id and status = 'active' and deleted_at is null) then
    raise exception 'PACKAGE_IN_USE';
  end if;

  update public.packages set deleted_at = now() where id = pkg.id returning * into pkg;

  perform public.write_audit('admin', null, p_admin_id, 'package.deleted', 'packages', pkg.id, to_jsonb(pkg), null);
  return to_jsonb(pkg);
end;
$$;

revoke all on function
  public.assert_package_admin, public.admin_create_package, public.admin_update_package,
  public.admin_set_package_status, public.admin_delete_package
  from public, anon, authenticated;
grant execute on function
  public.admin_create_package, public.admin_update_package,
  public.admin_set_package_status, public.admin_delete_package
  to service_role;

-- Starter tiers. Seeded as drafts on purpose: review the numbers, then enable them from the admin page.
insert into public.packages (slug, name, description, price, currency, return_rate, payout_interval_days, duration_days, status, sort_order) values
  ('starter', 'Starter', 'A first step to learn how packages work.', 10,  'USD', 0.0010, 1, 30, 'draft', 10),
  ('bronze',  'Bronze',  'A little more room to grow.',              50,  'USD', 0.0012, 1, 30, 'draft', 20),
  ('silver',  'Silver',  'A steady middle tier.',                    100, 'USD', 0.0015, 1, 45, 'draft', 30),
  ('gold',    'Gold',    'For members ready to commit longer.',      250, 'USD', 0.0018, 1, 60, 'draft', 40),
  ('diamond', 'Diamond', 'Our largest and longest package.',         500, 'USD', 0.0020, 1, 90, 'draft', 50)
on conflict (slug) where deleted_at is null do nothing;
