# Security checklist and production readiness review

## Honest status
Not ready to take real money yet. The code has **never been compiled or run**: the build environment used to write it had no internet, so `npm install`, the type check, the linter and a real database were not available. Everything below was written and read carefully, and `scripts/security-check.mjs` was run (it passes, and I proved it catches planted mistakes), but nothing replaces the first real build and test. Treat items marked **Open** as blockers.

## Findings from the review
| # | Area | Finding | Severity | Status |
| --- | --- | --- | --- | --- |
| 1 | Build | Never compiled or run. Type errors and runtime faults are likely on first build. | High | **Open.** Run the commands in "Before you deploy". |
| 2 | Rate limiting | None. Login, registration, money endpoints could be hammered. | High | Fixed. Database backed limiter on every API route. |
| 3 | CSRF | Cookie-authenticated JSON API accepted any origin, and the body was parsed whatever its content type, so a hostile web page could submit it. | High | Fixed. Origin check in middleware, JSON content type required, body size capped. |
| 4 | Admin sign in | Admin accounts use a password only. | High | **Open.** Turn on Supabase MFA for admins (see checklist). |
| 5 | Regulation | The product pays fixed daily returns and takes money from minors. | High | **Open, not a code issue.** Get legal advice (securities, consumer, child protection, data protection) before launch. |
| 6 | Money kill switch | `PAYSTACK_TRANSFERS_ENABLED` existed but was never checked, so automatic payouts would run regardless. | High | Fixed. Now enforced. Default off. |
| 7 | Database privileges | Function execute rights depended on each migration remembering to revoke them. | Medium | Fixed. Migration 0017 revokes for all definer functions, locks future ones, and re-enables row level security on any table that lacks it. |
| 8 | Security headers | No CSP or HSTS. | Medium | Fixed. CSP with per-request nonce, HSTS, COOP, strict permissions policy. CSP starts in report-only. |
| 9 | Audit trail | No IP or browser, no sign-in events, bank detail edits not recorded. | Medium | Fixed. `audit_request`, login/password/profile events, and triggers on bank detail and date of birth changes. TRUNCATE blocked on ledger and audit tables. |
| 10 | Withdrawal fraud | A stolen session can change bank details then withdraw. | Medium | Partly fixed (audit and "bank details changed" alert to the member). **Open:** add a waiting period or re-authentication after a bank change. |
| 11 | Client address | Rate limits need the real client IP, which depends on the proxy. | Medium | Needs a check after deploy (`TRUSTED_PROXY_HOPS`, `CLIENT_IP_HEADER`). |
| 12 | Operations | No health check, startup config check, error pages or robots rules. | Medium | Fixed. |
| 13 | Linting | `any` and unused variables are errors in the default Next lint rules and would fail the build. | Medium | Mitigated: set to warnings. Clean them up later. |
| 14 | Role permissions | Reconcile endpoint was open to the support role. | Low | Fixed. Finance and above. |
| 15 | Uploads | Avatar type was taken from what the browser claimed. | Low | Fixed. File signature is checked. |
| 16 | PWA | Placeholder icons, no maskable icon, minimal service worker. | Low | Fixed. |
| 17 | Suspension | A suspended member already signed in keeps their session until the token expires (about an hour), though money actions are blocked at once. | Low | Documented. |

## What is enforced where
**Row level security.** On for every table (15 of 15 plus `rate_limits`). Members read only their own rows. All writes go through `SECURITY DEFINER` functions called with the service role. Members can update only name, bank fields, username, avatar and notification read flags, by column grants. Check with the SQL under "Verify".

**Role permissions.** Roles: `super_admin`, `admin`, `finance`, `support`. Enforced in the page, the API route (`requireAdmin(roles)`) and, for money actions, again inside the database function.

| Area | super_admin | admin | finance | support |
| --- | --- | --- | --- | --- |
| Overview | yes | yes | yes | yes (no money) |
| Users, transactions | yes | yes | no | read only |
| Suspend, reactivate | yes | yes | no | no |
| Packages, settings, audit logs | yes | yes | no | no |
| Withdrawals, analytics, wallet adjustments | yes | yes | yes | no |

**Rate limits** (per client address unless noted; HTTP 429 with `Retry-After`).
| Route | Limit |
| --- | --- |
| Login | 10 per 10 min, and 8 per 15 min per account |
| Register, forgot password, resend email, phone send | 5 per hour |
| Phone verify, reset password | 10 per hour |
| Profile, avatar | 30 and 20 per hour |
| Fund wallet, withdrawal request | 10 per 10 min |
| Package purchase | 20 per minute |
| All other API routes | 120 per minute |
| Webhooks and cron | none (signature or secret instead) |

**CSRF.** Middleware refuses any non-GET request whose `Origin` (or `Referer`) is not this site. Requests with neither header are refused if they carry cookies. Bodies must be `application/json` and under 64 KB.

**Input validation.** Every route validates with a typed parser before anything touches the database: ids as UUIDs, amounts as positive with two decimals and a ceiling, text with length limits, enums from fixed lists, search terms escaped in SQL. The database repeats the important rules (check constraints, unique keys, function checks), so a bug in one layer is caught by the next.

**Audit logging.** The `audit_logs` table cannot be edited, deleted or truncated. It records every wallet movement, package change, withdrawal decision, transfer event, user suspension, setting change, admin action, sign in and failed sign in (email masked), password change, profile edit and bank detail change.

**Headers.** `Content-Security-Policy` (nonce based), `Strict-Transport-Security`, `X-Frame-Options: DENY`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`, and `Cache-Control: no-store` on every API answer.

**PWA.** Real icons (any, maskable, Apple), manifest with shortcuts, a service worker that caches only static files (never pages, API answers or anything signed in), offline page, update check on return to the app.

## Before you deploy
- [ ] `npm install` (creates `package-lock.json`, commit it)
- [ ] `npm run typecheck`, `npm run lint`, `npm run build`, `npm run security:check` all pass
- [ ] Apply migrations `0001` to `0017` to a **test** Supabase project and click through every flow
- [ ] Run the SQL under "Verify" and get the expected results
- [ ] Legal review done (finding 5)

## Supabase
- [ ] Project region close to your users, plan with daily backups (point in time recovery on paid plans)
- [ ] Auth: Site URL and redirect URLs set to the production domain only
- [ ] Auth: email confirmation required, password minimum 10 or more, leaked password protection on (paid plan)
- [ ] Auth: CAPTCHA on sign up and sign in, custom SMTP sender, sensible JWT expiry (1 hour)
- [ ] Auth: MFA (TOTP) enabled and enrolled for every admin account
- [ ] Unused sign in providers off
- [ ] `avatars` bucket: public read, writes only to the member's own folder
- [ ] `pg_cron` enabled (daily earnings) or the Render cron job kept
- [ ] The service role key exists only in Render, not in git, chat or the browser

## Paystack
- [ ] Live keys only after business verification; test keys in staging
- [ ] Webhook URL `https://YOUR-DOMAIN/api/webhooks/paystack` set, charge and transfer events on
- [ ] Transfers enabled and funded; **OTP for transfers turned off**; Render outbound IPs on the live IP allow list
- [ ] Test payment, test failed payment, test duplicate webhook (balance must not change twice)
- [ ] `PAYSTACK_TRANSFERS_ENABLED=true` only after a test transfer works end to end

## Render
- [ ] Blueprint deployed from `render.yaml` with one Free web service, health check green
- [ ] Custom domain with HTTPS; `NEXT_PUBLIC_SITE_URL` set to it **before** the build
- [ ] Supabase Vault contains `teenvest_app_url` and matching `teenvest_cron_secret`; `cron.job` lists daily earnings and transfer follow-up schedules
- [ ] Rate limit address check: trigger a block and confirm the logged address is the visitor's, not the proxy's
- [ ] Deploy and error notifications going to a person who will read them
- [ ] After a clean smoke test with no CSP violations in the logs: `CSP_MODE=enforce`

## Operations
- [ ] First `super_admin` created by SQL, then no shared admin logins
- [ ] Daily check of the audit log for `auth.login_failed` spikes, `transfer.anomaly`, `user.bank_details_changed`
- [ ] Weekly ledger check returns no rows (SQL below)
- [ ] Written plan for a leaked key (rotate in Supabase and Paystack, redeploy, review audit log)
- [ ] Someone can pay withdrawals by hand if Paystack is down

## Verify
Row level security everywhere (expect no rows):
```sql
select tablename from pg_tables where schemaname = 'public' and not rowsecurity;
```
Only `is_admin` may be callable by signed in users among definer functions (expect one `true` for `authed`, none for `anon`):
```sql
select p.oid::regprocedure as fn,
       has_function_privilege('anon', p.oid, 'execute') as anon,
       has_function_privilege('authenticated', p.oid, 'execute') as authed
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.prosecdef
 order by 3 desc, 2 desc;
```
Wallet balances equal their ledgers (expect no rows):
```sql
select w.id, r.balance, r.ledger_balance
  from public.wallets w cross join lateral public.wallet_reconcile(w.id) r
 where not r.is_balanced;
```
From a terminal, against the deployed site:
```bash
# CSRF: expect 403 CSRF_BLOCKED
curl -i -X POST https://YOUR-DOMAIN/api/wallet/fund -H "Origin: https://evil.example" -H "Content-Type: application/json" -d '{"amount":100}'
# Not signed in: expect 401
curl -i -X POST https://YOUR-DOMAIN/api/wallet/fund -H "Origin: https://YOUR-DOMAIN" -H "Content-Type: application/json" -d '{"amount":100}'
# Wrong content type: expect 415
curl -i -X POST https://YOUR-DOMAIN/api/wallet/fund -H "Origin: https://YOUR-DOMAIN" -H "Content-Type: text/plain" -d 'x'
# Rate limit: the 11th attempt should be 429 with Retry-After
for i in $(seq 1 12); do curl -s -o /dev/null -w "%{http_code}\n" -X POST https://YOUR-DOMAIN/api/auth/login -H "Origin: https://YOUR-DOMAIN" -H "Content-Type: application/json" -d '{"email":"a@b.co","password":"wrong-password"}'; done
# Bad webhook signature: expect 401
curl -i -X POST https://YOUR-DOMAIN/api/webhooks/paystack -H "x-paystack-signature: bad" -d '{}'
# Headers
curl -sI https://YOUR-DOMAIN | grep -i -E "strict-transport|content-security|x-frame|x-content-type|referrer|permissions"
```
