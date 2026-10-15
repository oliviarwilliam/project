-- Set the platform withdrawal floor to NGN 5,000 and prevent admins from lowering it.
insert into public.settings (key, value, description, is_public)
values ('min_withdrawal_amount', '5000', 'Smallest withdrawal a member can request', true)
on conflict (key) where deleted_at is null
do update set value = excluded.value, updated_at = now();

create or replace function public.admin_update_setting(p_admin_id uuid, p_key text, p_value jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_num numeric; v_old jsonb; s public.settings;
begin
  if not exists (
    select 1 from public.admin_users
     where id = p_admin_id and is_active and deleted_at is null and role in ('super_admin', 'admin')
  ) then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if p_key not in ('min_withdrawal_amount', 'withdrawal_cooldown_days', 'withdrawal_fee_percent', 'referral_reward_amount') then
    raise exception 'SETTING_NOT_EDITABLE';
  end if;
  if jsonb_typeof(p_value) <> 'number' then raise exception 'VALIDATION_ERROR'; end if;
  v_num := (p_value #>> '{}')::numeric;
  if (p_key = 'min_withdrawal_amount' and (v_num < 5000 or v_num > 1000000))
     or (p_key = 'withdrawal_cooldown_days' and (v_num < 0 or v_num > 90 or v_num <> trunc(v_num)))
     or (p_key = 'withdrawal_fee_percent' and (v_num < 0 or v_num > 50))
     or (p_key = 'referral_reward_amount' and (v_num < 0 or v_num > 1000000)) then
    raise exception 'VALIDATION_ERROR';
  end if;
  select value into v_old from public.settings where key = p_key and deleted_at is null for update;
  update public.settings set value = p_value, updated_by = p_admin_id where key = p_key and deleted_at is null returning * into s;
  if not found then
    insert into public.settings (key, value, is_public, updated_by) values (p_key, p_value, true, p_admin_id) returning * into s;
  end if;
  perform public.write_audit('admin', null, p_admin_id, 'setting.updated', 'settings', s.id,
    jsonb_build_object('key', p_key, 'value', v_old), jsonb_build_object('key', p_key, 'value', p_value));
  return jsonb_build_object('key', p_key, 'value', p_value);
end;
$$;
