-- Members can maintain the date of birth used by withdrawal eligibility checks.
grant update (date_of_birth) on public.users to authenticated;
