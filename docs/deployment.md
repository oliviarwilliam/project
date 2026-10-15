# Deployment guide (Supabase + Paystack + Render)

Do the steps in order. Do everything once against a **staging** copy (test keys, a second Supabase project, a second Render service) before touching production.

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
1. Create the project. Pick the region nearest your members. Save the database password somewhere safe.
2. Apply the migrations **in order** (`supabase/migrations/0001` to `0017`).
   - CLI: `supabase login`, `supabase link --project-ref YOUR_REF`, `supabase db push`.
   - Or paste each file into the SQL editor, one at a time, in number order.
3. Database, Extensions: enable `pg_cron` (daily earnings). If your plan cannot, keep the `teenvest-daily-earnings` job in `render.yaml`.
4. Authentication settings:
   - URL Configuration: Site URL `https://YOUR-DOMAIN`; redirect URLs `https://YOUR-DOMAIN/auth/callback` (and your staging URL on the staging project only).
   - Providers: email on, everything unused off. Require email confirmation.
   - Password rules: minimum 6, turn on leaked password protection if your plan allows.
   - Add CAPTCHA (Turnstile or hCaptcha) for sign up and sign in.
   - Set up your own SMTP sender so confirmation emails come from your domain.
   - Phone provider (for example Twilio) only if you use phone verification.
5. Project Settings, API: copy the URL, the `anon` key and the `service_role` key. Only the first two are public.
6. Storage: confirm the `avatars` bucket exists (migration 0008).
7. Create the first admin. Sign up in the app, then in the SQL editor:
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
1. New, Blueprint, select the repository. Render reads `render.yaml` and proposes three services: `teenvest` (web), `teenvest-transfers` (cron) and `teenvest-daily-earnings` (cron).
2. Fill in the values it asks for (see `docs/environment.md`): `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `PAYSTACK_SECRET_KEY`, and `APP_URL` on each cron job. `CRON_SECRET` is generated for you.
3. Deploy. The build runs `security:check` and `next build`. The app refuses to start if a required variable is missing, and the health check `/api/health` must go green.
4. Add your custom domain (Settings, Custom Domains), follow the DNS instructions, wait for the certificate.
5. If `NEXT_PUBLIC_SITE_URL` was a placeholder, set the real domain now and **redeploy**, because public values are baked into the build.
6. Scaling: more than one instance is fine. Rate limits and locks live in the database.

## 5. Smoke test (staging, then production)
1. Register, confirm the email, sign in. Check `audit_logs` has `auth.login`.
2. Fund the wallet with a Paystack test card. Balance rises once. Replay the webhook from the Paystack dashboard: the balance must not change.
3. Buy a package. Click twice quickly: one purchase only.
4. Run the daily earnings job (admin Settings, Run now). A payout appears once. Run it again: nothing new.
5. Request a withdrawal. Admin approves it. With transfers off, mark it paid by hand. Then (staging only) switch `PAYSTACK_TRANSFERS_ENABLED=true` and repeat to test a real transfer.
6. Suspend a member as admin: they can no longer buy or withdraw.
7. Run the commands in "Verify" in `docs/security-checklist.md`. Every result must match.
8. Open the site on a phone, install it, switch to airplane mode: the offline page shows.
9. Look in the Render logs for `csp.violation` lines. None for your own pages means you can set `CSP_MODE=enforce`.

## 6. Going live
- [ ] Every box in `docs/security-checklist.md` ticked, legal review done
- [ ] Live Paystack key and webhook set, a small real payment tested and refunded
- [ ] `CSP_MODE=enforce`
- [ ] `PAYSTACK_TRANSFERS_ENABLED=true` (when you are ready for automatic payouts)
- [ ] Notifications on for failed deploys and for service downtime

## 7. Running it
- **Logs:** Render, Logs. Lines are JSON. Search for `rate_limit.blocked`, `transfer.failed`, `earnings.run.finish_with_failures`, `config.warning`.
- **Backups:** Supabase daily backups; use point in time recovery if your plan has it. Practise one restore on staging.
- **Weekly:** run the ledger check from the checklist. Any row it returns is an incident.
- **Rollback:** Render, Deploys, pick the last good deploy, Rollback. Database changes are forward only, so write a new migration to undo one. Never edit a migration that already ran in production.
- **Updates:** `npm audit` and dependency updates monthly, applied to staging first.
- **Incident basics:** suspend affected accounts, set maintenance mode (admin Settings), rotate keys (`docs/environment.md`), read `audit_logs` for the time window.
