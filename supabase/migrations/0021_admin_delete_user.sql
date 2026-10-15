-- Remove access and profile data while retaining user-linked financial history.
create or replace function public.audit_user_sensitive_changes() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_bank boolean;
begin
  if current_setting('app.account_anonymization', true) = 'on' then return new; end if;

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

create function public.admin_delete_user(p_admin_id uuid, p_user_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_admin public.admin_users; v_user public.users; v_deleted_at timestamptz := now();
begin
  select * into v_admin from public.admin_users
   where id = p_admin_id and is_active and deleted_at is null and role in ('super_admin', 'admin');
  if not found then raise exception 'NOT_AUTHORIZED'; end if;
  if v_admin.user_id = p_user_id then raise exception 'CANNOT_MODIFY_SELF'; end if;
  if exists (select 1 from public.admin_users where user_id = p_user_id and is_active and deleted_at is null) then
    raise exception 'USER_IS_ADMIN';
  end if;

  select * into v_user from public.users where id = p_user_id and deleted_at is null for update;
  if not found then raise exception 'USER_NOT_FOUND'; end if;

  perform set_config('app.account_anonymization', 'on', true);
  update public.users set
    email = 'deleted+' || p_user_id::text || '@redacted.invalid',
    full_name = 'Deleted member',
    username = null,
    avatar_url = null,
    phone = null,
    country_code = null,
    date_of_birth = null,
    guardian_email = null,
    guardian_consent_at = null,
    bank_name = null,
    account_number = null,
    account_name = null,
    referral_code = upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
    status = 'closed',
    deleted_at = v_deleted_at,
    updated_at = v_deleted_at
   where id = p_user_id;

  perform public.write_audit('admin', null, p_admin_id, 'user.deleted', 'users', p_user_id,
    jsonb_build_object('status', v_user.status),
    jsonb_build_object('status', 'closed', 'deleted_at', v_deleted_at));

  return jsonb_build_object('id', p_user_id, 'deleted', true);
end;
$$;

revoke all on function public.admin_delete_user(uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_delete_user(uuid, uuid) to service_role;
