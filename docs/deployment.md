# Deployment guide (Supabase + Paystack + Render)

Do the steps in order. This setup reuses the Supabase project already configured for development. That means development and the deployed site share the same database, users, authentication settings, and storage. Use Paystack test keys until you are ready for live transactions.

## 1. Build it on your own machine first
```bash
npm install                 # creates package-lock.json. Commit it: Render uses npm ci
npm run typecheck
npm run lint
npm run build
npm run security:check
```
Fix whatever these find. This is the first time the code is compiled, so expect some fixes. Commit and push to GitHub (the repo can be private).

## 2. Supabase
1. Use the existing Supabase project configured in your local `.env.local`; do not create another project for this deployment.
2. Check whether migrations have already been applied. Apply only pending migrations, in order (`supabase/migrations/0001` to the latest migration in `supabase/migrations`).
   - CLI: `supabase login`, `supabase link --project-ref YOUR_REF`, `supabase db push`.
   - Or paste each file into the SQL editor, one at a time, in number order.
3. Database, Extensions: enable `pg_cron` and `pg_net`. The migrations schedule daily earnings with `pg_cron`; `pg_net` lets Supabase call the transfer maintenance endpoint on the web app.
4. Authentication settings on this existing project:
   - URL Configuration: set the Site URL to `https://YOUR-DOMAIN`; add `https://YOUR-DOMAIN/auth/callback` to the redirect URLs. Keep any localhost redirect URLs you still need for development.
   - Providers: email on, everything unused off. Require email confirmation.
   - Password rules: minimum 6, turn on leaked password protection if your plan allows.
   - Add CAPTCHA (Turnstile or hCaptcha) for sign up and sign in.
   - Set up your own SMTP sender so confirmation emails come from your domain.
   - Phone provider (for example Twilio) only if you use phone verification.
5. Project Settings, API: copy the URL, the `anon` key and the `service_role` key. Only the first two are public.
6. Storage: confirm the `avatars` bucket exists (migration 0008).
7. If you have not already created an admin, sign up in the app, then in the SQL editor:
   ```sql
   insert into public.admin_users (user_id, role)
   select id, 'super_admin' from auth.users where email = 'you@your-domain.com';
   ```
   Then enrol TOTP multi-factor authentication for that account.

## 3. Paystack
1. Complete business verification to get live keys. Use `sk_test_` for staging.
2. Settings, API Keys and Webhooks: set the webhook URL to `https://YOUR-DOMAIN/api/webhooks/paystack`.
3. For payouts: turn on Transfers, fund the balance, turn **off** OTP for transfers (Settings, Preferences), and add Render's outbound IP addresses (Render dashboard, Settings, Outbound IPs) to the live IP allow list.
4. Leave `PAYSTACK_TRANSFERS_ENABLED=false` until a staging test transfer works.

## 4. Render
1. New, Blueprint, select the repository. Render reads `render.yaml` and proposes one service: `teenvest` (web, Free).
2. Fill in the values it asks for (see `docs/environment.md`): `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `PAYSTACK_SECRET_KEY`. `CRON_SECRET` is generated for the web service. Save its value; you will add it to Supabase Vault in step 5.
3. Deploy. The build runs `security:check` and `next build`. The app refuses to start if a required variable is missing, and the health check `/api/health` must go green.
4. Add your custom domain (Settings, Custom Domains), follow the DNS instructions, wait for the certificate.
5. If `NEXT_PUBLIC_SITE_URL` was a placeholder, set the real domain now and **redeploy**, because public values are baked into the build.
6. Scaling: more than one instance is fine. Rate limits and locks live in the database.

## 5. Supabase scheduled jobs
Supabase runs daily earnings from the database migration. It also calls the app every 10 minutes to process transfer follow-ups. There are no Render cron services.

1. After the Render deploy, copy its `https://...onrender.com` URL and the `CRON_SECRET` value from the Render Environment page.
2. In Supabase Dashboard, open Vault and create two secrets with these names and values:
   - `teenvest_app_url` = your Render URL, with no trailing slash.
   - `teenvest_cron_secret` = the exact `CRON_SECRET` from Render.
3. In Supabase SQL Editor, schedule the transfer job:
   ```sql
   select cron.schedule(
     'teenvest-transfers',
     '*/10 * * * *',
     $job$
     select net.http_post(
       url := (select decrypted_secret from vault.decrypted_secrets where name = 'teenvest_app_url') || '/api/cron/transfers',
       headers := jsonb_build_object(
         'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'teenvest_cron_secret'),
         'Content-Type', 'application/json'
       ),
       body := '{}'::jsonb
     );
     $job$
   );
   ```
4. Confirm both schedules exist:
   ```sql
   select jobname, schedule, active from cron.job order by jobname;
   ```
   Expect `daily-earnings` and `teenvest-transfers`. Check `cron.job_run_details` after a run for errors. If re-running the schedule setup, remove the existing `teenvest-transfers` job first with `select cron.unschedule(jobid) from cron.job where jobname = 'teenvest-transfers';`.

The Free Render web service can take longer to answer after an idle period. Monitor the Supabase job run history and Render logs after the first scheduled call.

## 6. Verify the deployed app
1. Register, confirm the email, sign in. Check `audit_logs` has `auth.login`.
2. Fund the wallet with a Paystack test card. Balance rises once. Replay the webhook from the Paystack dashboard: the balance must not change.
3. Buy a package. Click twice quickly: one purchase only.
4. Run the daily earnings job (admin Settings, Run now). A payout appears once. Run it again: nothing new.
5. Request a withdrawal. Admin approves it. With transfers off, mark it paid by hand. Then (staging only) switch `PAYSTACK_TRANSFERS_ENABLED=true` and repeat to test a real transfer.
6. Suspend a member as admin: they can no longer buy or withdraw.
7. Run the commands in "Verify" in `docs/security-checklist.md`. Every result must match.
8. Open the site on a phone, install it, switch to airplane mode: the offline page shows.
9. Look in the Render logs for `csp.violation` lines. None for your own pages means you can set `CSP_MODE=enforce`.

## 7. Going live
- [ ] Every box in `docs/security-checklist.md` ticked, legal review done
- [ ] Live Paystack key and webhook set, a small real payment tested and refunded
- [ ] `CSP_MODE=enforce`
- [ ] `PAYSTACK_TRANSFERS_ENABLED=true` (when you are ready for automatic payouts)
- [ ] Notifications on for failed deploys and for service downtime

## 8. Running it
- **Logs:** Render, Logs. Lines are JSON. Search for `rate_limit.blocked`, `transfer.failed`, `earnings.run.finish_with_failures`, `config.warning`.
- **Backups:** Supabase daily backups; use point in time recovery if your plan has it. Practise one restore on staging.
- **Weekly:** run the ledger check from the checklist. Any row it returns is an incident.
- **Rollback:** Render, Deploys, pick the last good deploy, Rollback. Database changes are forward only, so write a new migration to undo one. Never edit a migration that already ran in production.
- **Updates:** `npm audit` and dependency updates monthly, applied to staging first.
- **Incident basics:** suspend affected accounts, set maintenance mode (admin Settings), rotate keys (`docs/environment.md`), read `audit_logs` for the time window.
