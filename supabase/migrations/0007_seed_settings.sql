insert into public.settings (key, value, description, is_public) values
  ('default_currency',              '"USD"',                    'Currency used for new wallets',                       true),
  ('min_withdrawal_amount',         '10',                       'Smallest withdrawal a member can request',            true),
  ('withdrawal_fee_percent',        '0',                        'Fee taken from each withdrawal, in percent',          true),
  ('guardian_consent_under_age',    '18',                       'Members below this age need guardian consent',        true),
  ('maintenance_mode',              'false',                    'Blocks purchases and withdrawals when true',          true),
  ('support_email',                 '"support@teenvest.app"',   'Address shown in the help section',                   true)
on conflict (key) where deleted_at is null do nothing;
