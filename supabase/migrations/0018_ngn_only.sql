-- The application now operates exclusively in Nigerian naira.
-- Preserve stored numeric amounts while consolidating every currency-tagged row.
do $$
declare
  r record;
begin
  for r in
    select table_schema, table_name, column_name
      from information_schema.columns c
      join information_schema.tables t using (table_schema, table_name)
     where c.table_schema = 'public' and c.column_name = 'currency'
       and t.table_type = 'BASE TABLE'
  loop
    execute format('update %I.%I set %I = ''NGN'' where %I <> ''NGN''',
      r.table_schema, r.table_name, r.column_name, r.column_name);
    execute format('alter table %I.%I alter column %I set default ''NGN''',
      r.table_schema, r.table_name, r.column_name);
    execute format('alter table %I.%I add constraint %I check (%I = ''NGN'')',
      r.table_schema, r.table_name, r.table_name || '_' || r.column_name || '_ngn_only', r.column_name);
  end loop;
end $$;

update public.settings
   set value = '"NGN"'::jsonb
 where key = 'default_currency';
