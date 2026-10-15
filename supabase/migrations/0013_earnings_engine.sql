-- ============================================================================
-- Daily earnings engine.
-- Builds on wallet_credit_profit (0009), which pays ONE period for ONE package
-- and is already safe to repeat: earnings is unique on (user_package_id, period_start).
-- This file adds the runner, its run log, history reads and the schedule.
-- ============================================================================

-- Run log: one row per run --------------------------------------------------------
create table public.earnings_runs (
  id            uuid primary key default gen_random_uuid(),
  trigger       text not null,
  status        text not null,
  started_at    timestamptz not null,
  finished_at   timestamptz not null default now(),
  packages_due  integer not null default 0,
  credited      integer not null default 0,
  failed        integer not null default 0,
  completed     integer not null default 0,
  swept         integer not null default 0,
  total_amount  numeric(14,2) not null default 0,
  error         text,
  details       jsonb not null default '[]'::jsonb,
  constraint earnings_runs_trigger_valid check (trigger in ('pg_cron', 'http', 'manual')),
  constraint earnings_runs_status_valid check (status in ('success', 'partial', 'failed'))
);
create index earnings_runs_started_idx on public.earnings_runs (started_at desc);

alter table public.earnings_runs enable row level security;
create policy "Admins read all" on public.earnings_runs for select to authenticated using (public.is_admin());
revoke all on public.earnings_runs from anon;
revoke insert, update, delete on public.earnings_runs from authenticated;

-- Faster history reads -----------------------------------------------------------
create index earnings_credited_idx on public.earnings (user_id, credited_at desc, id desc)
  where status = 'credited' and deleted_at is null;
create index earnings_package_idx on public.earnings (user_package_id, credited_at desc)
  where status = 'credited' and deleted_at is null;

-- The runner ------------------------------------------------------------------------
-- 1. Finds active packages with a payout due.
-- 2. Pays every missed day (catch-up), up to p_max_periods per package per run.
-- 3. wallet_credit_profit completes a package after its last payout.
-- 4. A failing package is logged and skipped. It never blocks the others.
-- 5. Writes the run log and an audit row.
create function public.run_daily_earnings(
  p_trigger text default 'manual', p_max_packages integer default 5000, p_max_periods integer default 40
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r record; res jsonb;
  v_started timestamptz := clock_timestamp();
  v_trigger text := case when p_trigger in ('pg_cron', 'http', 'manual') then p_trigger else 'manual' end;
  v_due integer := 0; v_credited integer := 0; v_failed integer := 0;
  v_completed integer := 0; v_swept integer := 0; v_periods integer;
  v_total numeric(14,2) := 0; v_errors jsonb := '[]'::jsonb; v_status text; v_run uuid; v_summary jsonb;
begin
  -- Two runs at once would only waste work, but skipping is cleaner.
  if not pg_try_advisory_xact_lock(hashtext('daily_earnings')) then
    return jsonb_build_object('skipped', true, 'reason', 'ALREADY_RUNNING');
  end if;

  for r in
    select id from public.user_packages
     where status = 'active' and deleted_at is null and next_payout_at <= now()
     order by next_payout_at
     limit greatest(p_max_packages, 1)
     for update skip locked
  loop
    v_due := v_due + 1;
    v_periods := 0;

    loop
      exit when v_periods >= greatest(p_max_periods, 1);
      perform 1 from public.user_packages
       where id = r.id and status = 'active' and next_payout_at <= now();
      exit when not found;

      begin
        res := public.wallet_credit_profit(r.id);
        v_credited := v_credited + 1;
        v_periods := v_periods + 1;
        v_total := v_total + coalesce((res -> 'earning' ->> 'amount')::numeric, 0);
      exception when others then
        v_failed := v_failed + 1;
        if jsonb_array_length(v_errors) < 50 then
          v_errors := v_errors || jsonb_build_array(jsonb_build_object('user_package_id', r.id, 'error', sqlerrm));
        end if;
        raise warning 'Daily earnings failed for package %: %', r.id, sqlerrm;
        exit;
      end;
    end loop;

    if v_periods > 0 then
      perform 1 from public.user_packages where id = r.id and status = 'completed';
      if found then v_completed := v_completed + 1; end if;
    end if;
  end loop;

  -- Safety net: an active package that is past its end date and has no payout left is finished.
  with swept as (
    update public.user_packages set status = 'completed'
     where status = 'active' and deleted_at is null and ends_at <= now() and next_payout_at is null
     returning id
  )
  select count(*) into v_swept from swept;

  v_status := case when v_failed = 0 then 'success' when v_credited > 0 then 'partial' else 'failed' end;

  insert into public.earnings_runs
    (trigger, status, started_at, finished_at, packages_due, credited, failed, completed, swept, total_amount, details)
  values
    (v_trigger, v_status, v_started, clock_timestamp(), v_due, v_credited, v_failed, v_completed, v_swept, v_total, v_errors)
  returning id into v_run;

  v_summary := jsonb_build_object(
    'run_id', v_run, 'status', v_status, 'packages_due', v_due, 'credited', v_credited,
    'failed', v_failed, 'completed', v_completed, 'swept', v_swept, 'total_amount', v_total);

  perform public.write_audit('system', null, null, 'earnings.run', 'earnings_runs', v_run, null, v_summary);
  return v_summary || jsonb_build_object('errors', v_errors);
end;
$$;

-- Member reads. Security invoker, so row level security limits them to the caller. ---
create function public.earnings_history(
  p_package_id uuid default null, p_limit integer default 20,
  p_before timestamptz default null, p_before_id uuid default null
) returns setof public.earnings
language sql stable as $$
  select * from public.earnings
   where status = 'credited' and deleted_at is null
     and (p_package_id is null or user_package_id = p_package_id)
     and (p_before is null or (credited_at, id) < (p_before, p_before_id))
   order by credited_at desc, id desc
   limit least(greatest(p_limit, 1), 101);
$$;

create function public.earnings_summary() returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'total_credited', coalesce(sum(amount), 0),
    'today',          coalesce(sum(amount) filter (where credited_at >= date_trunc('day', now())), 0),
    'last_7_days',    coalesce(sum(amount) filter (where credited_at >= now() - interval '7 days'), 0),
    'payouts',        count(*))
    from public.earnings where status = 'credited' and deleted_at is null;
$$;

revoke all on function public.run_daily_earnings, public.earnings_history, public.earnings_summary from public, anon, authenticated;
grant execute on function public.run_daily_earnings to service_role;
grant execute on function public.earnings_history, public.earnings_summary to authenticated;

-- The older batch function is replaced by run_daily_earnings.
drop function if exists public.wallet_credit_due_profits(integer);

-- Schedule: every day at 00:00 UTC, inside the database (needs the pg_cron extension).
-- If pg_cron is not available, this only prints a notice. Use the HTTP route instead (docs/earnings.md).
do $$
begin
  create extension if not exists pg_cron with schema pg_catalog;
  perform cron.unschedule('daily-earnings') where exists (select 1 from cron.job where jobname = 'daily-earnings');
  perform cron.schedule('daily-earnings', '0 0 * * *', $job$select public.run_daily_earnings('pg_cron')$job$);
exception when others then
  raise notice 'pg_cron is not available (%). Call /api/cron/daily-earnings from another scheduler.', sqlerrm;
end;
$$;
