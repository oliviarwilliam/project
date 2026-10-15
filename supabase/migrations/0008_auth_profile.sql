-- Profile fields ---------------------------------------------------------
alter table public.users rename column display_name to full_name;

alter table public.users
  add column bank_name      text,
  add column account_number text,
  add column account_name   text,
  add constraint users_full_name_len check (full_name is null or char_length(full_name) between 2 and 80),
  add constraint users_account_number_format check (account_number is null or account_number ~ '^[0-9]{6,20}$'),
  add constraint users_bank_all_or_none check (
    (bank_name is null and account_number is null and account_name is null)
    or (bank_name is not null and account_number is not null and account_name is not null)
  );

-- Signup: create profile and wallet -------------------------------------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  name text := left(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), 80);
begin
  insert into public.users (id, email, full_name)
  values (new.id, new.email, case when char_length(name) >= 2 then name end);

  insert into public.wallets (user_id) values (new.id);
  return new;
end;
$$;

-- Keep email and verified phone in sync with Supabase Auth ---------------
create function public.sync_auth_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.users
     set email = coalesce(new.email, email),
         phone = case
                   when new.phone_confirmed_at is not null and coalesce(new.phone, '') <> ''
                   then '+' || new.phone
                   else phone
                 end
   where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_updated
  after update of email, phone, phone_confirmed_at on auth.users
  for each row execute function public.sync_auth_user();

-- Members can edit these columns. Phone changes only through verification.
revoke update (phone) on public.users from authenticated;
grant update (full_name, bank_name, account_number, account_name) on public.users to authenticated;

-- Avatars ------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "Avatars are public" on storage.objects
  for select using (bucket_id = 'avatars');

create policy "Members add their own avatar" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Members replace their own avatar" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Members remove their own avatar" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
