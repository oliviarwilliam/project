-- ============================================================================
-- Production hardening: function privileges, RLS safety net, tamper protection,
-- request audit with IP, sensitive profile change audit, DB backed rate limiting.
-- ============================================================================

-- 1. Nobody except the service role may call a SECURITY DEFINER function through the API.
--    is_admin() stays callable because row level security policies use it.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef and p.proname <> 'is_admin'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
  end loop;
end $$;

-- Future functions start locked. Grant what is needed explicitly.
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- 2. Safety net: any public table without row level security gets it switched on.
do $$
declare t record;
begin
  for t in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
  loop
    execute format('alter table public.%I enable row level security', t.relname);
  end loop;
end $$;

-- 3. The ledger and the audit trail cannot be emptied either.
create trigger wallet_transactions_no_truncate before truncate on public.wallet_transactions
  for each statement execute function public.prevent_mutation();
create trigger audit_logs_no_truncate before truncate on public.audit_logs
  for each statement execute function public.prevent_mutation();

-- 4. Rate limiting counters (fixed window). Used by the API through rate_limit_hit().
create table public.rate_limits (
  key          text not null,
  window_start timestamptz not null,
  hits         integer not null default 0,
  primary key (key, window_start)
);
create index rate_limits_window_idx on public.rate_limits (window_start);
alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;

create function public.rate_limit_hit(p_key text, p_limit integer, p_window_seconds integer) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_start timestamptz; v_hits integer;
begin
  if p_window_seconds < 1 or p_limit < 1 then raise exception 'VALIDATION_ERROR'; end if;
  v_start := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  insert into public.rate_limits as r (key, window_start, hits) values (left(p_key, 200), v_start, 1)
  on conflict (key, window_start) do update set hits = r.hits + 1
  returning r.hits into v_hits;

  -- Old windows are cleaned up now and then, so the table stays small.
  if random() < 0.01 then delete from public.rate_limits where window_start < now() - interval '1 day'; end if;

  return jsonb_build_object('allowed', v_hits <= p_limit, 'hits', v_hits, 'limit', p_limit,
                            'reset_at', v_start + make_interval(secs => p_window_seconds));
end;
$$;

-- 5. Audit events raised by the API (sign in, password change, profile edits), with IP and browser.
create function public.audit_request(
  p_actor_user_id uuid, p_action text, p_entity_table text, p_entity_id uuid,
  p_data jsonb, p_ip text, p_user_agent text
) returns void
language plpgsql security definer set search_path = public as $$
declare v_ip inet;
begin
  begin v_ip := nullif(btrim(coalesce(p_ip, '')), '')::inet; exception when others then v_ip := null; end;

  insert into public.audit_logs (actor_type, actor_user_id, action, entity_table, entity_id, new_data, ip_address, user_agent)
  values (case when p_actor_user_id is null then 'system' else 'user' end, p_actor_user_id,
          left(p_action, 80), left(coalesce(p_entity_table, 'auth'), 60), p_entity_id,
          coalesce(p_data, '{}'::jsonb), v_ip, left(p_user_agent, 300));
end;
$$;

-- 6. Bank details, date of birth and guardian consent are what fraud targets. Record every change,
--    and warn the member when bank details change. (Status changes are audited by admin_set_user_status.)
create function public.audit_user_sensitive_changes() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_bank boolean;
begin
  v_bank := (new.bank_name, new.account_number, new.account_name) is distinct from (old.bank_name, old.account_number, old.account_name);

  if v_bank or new.date_of_birth is distinct from old.date_of_birth
     or new.guardian_consent_at is distinct from old.guardian_consent_at then
    perform public.write_audit(
      case when auth.uid() is not null then 'user' else 'system' end, auth.uid(), null,
      case when v_bank then 'user.bank_details_changed' else 'user.sensitive_changed' end,
      'users', new.id,
      jsonb_build_object('bank_name', old.bank_name, 'account_last4', right(old.account_number, 4),
                         'date_of_birth', old.date_of_birth, 'guardian_consent_at', old.guardian_consent_at),
      jsonb_build_object('bank_name', new.bank_name, 'account_last4', right(new.account_number, 4),
                         'date_of_birth', new.date_of_birth, 'guardian_consent_at', new.guardian_consent_at));
  end if;

  if v_bank and old.account_number is not null then
    perform public.push_notification(new.id, 'security', 'Bank details changed',
      'The bank details used for withdrawals were changed. If this was not you, change your password now and contact support.', '{}'::jsonb);
  end if;
  return new;
end;
$$;

create trigger audit_user_sensitive after update on public.users
  for each row execute function public.audit_user_sensitive_changes();

revoke all on function public.rate_limit_hit, public.audit_request, public.audit_user_sensitive_changes from public, anon, authenticated;
grant execute on function public.rate_limit_hit, public.audit_request to service_role;
