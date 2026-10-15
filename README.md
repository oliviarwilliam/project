# TeenVest

A savings and investing education platform for teenagers. Members fund a wallet, buy packages that pay a daily profit, and withdraw their profit with admin approval. Admins manage users, packages, withdrawals and rules from a built-in console.

> **Status: not yet compiled or run.** This code was written without access to `npm`, a database or Paystack, so the first build on your machine will probably need a few fixes. Follow "Quick start", fix what the type check finds, then work through `docs/security-checklist.md` before any real money is involved. Real money from minors also needs legal advice (securities, consumer protection, child protection, data protection).

## Contents
1. [What is in the box](#what-is-in-the-box)
2. [Quick start](#quick-start)
3. [Prerequisites](#prerequisites)
4. [Local setup, step by step](#local-setup-step-by-step)
5. [Try the whole product locally](#try-the-whole-product-locally)
6. [Everyday commands](#everyday-commands)
7. [Project structure](#project-structure)
8. [How the code is organised](#how-the-code-is-organised)
9. [Database](#database)
10. [API overview](#api-overview)
11. [Security in one page](#security-in-one-page)
12. [Developer recipes](#developer-recipes)
13. [Troubleshooting](#troubleshooting)
14. [Deploying](#deploying)
15. [Documentation index](#documentation-index)

## What is in the box
| Area | What it does |
| --- | --- |
| Accounts | Email and password sign up with email confirmation, optional phone verification, password reset, profile with bank details and avatar |
| Wallet | Balance, append-only ledger, transaction history with filters |
| Funding | Paystack checkout, verified on return and by webhook, credited exactly once |
| Packages | Five tiers (Starter to Diamond) paying a daily profit, managed by admins |
| Purchases | Atomic buy with duplicate protection and per-member limits |
| Daily earnings | A scheduled job pays every package once a day and stops at expiry |
| Withdrawals | Profit only, once every 7 days (configurable), minimum amount, admin approval |
| Bank payouts | Optional automatic Paystack transfers with retries and a kill switch |
| Admin console | Overview, users (search, suspend, transactions), packages, withdrawals, analytics, audit logs, settings |
| Security | Row level security, rate limits, CSRF protection, CSP and other headers, audit trail, role permissions |
| PWA | Installable, offline page, safe service worker |

## Quick start
```bash
git clone <your-repo-url> teenvest && cd teenvest
nvm use                      # Node 22 (any version from 20.11 works)
npm install                  # also creates package-lock.json: commit it
cp .env.example .env.local   # then fill it in (see "Local setup")
# apply supabase/migrations/0001 ... 0017 to your Supabase project (see "Local setup")
npm run dev                  # http://localhost:3000
```
Before you push anything, run all four checks:
```bash
npm run typecheck && npm run lint && npm run security:check && npm run build
```

## Prerequisites
| Tool | Version | Why |
| --- | --- | --- |
| Node.js | 20.11 or newer (22 recommended, see `.nvmrc`) | Runs Next.js 15 |
| npm | 10 or newer | Installs packages |
| A Supabase project | free tier is fine for development | Database, auth, storage |
| A Paystack account | test mode needs no verification | Card payments and payouts |
| Supabase CLI | optional but recommended | Applies migrations, runs a local stack |
| Docker | only for the local Supabase stack | `supabase start` |
| A tunnel (ngrok or cloudflared) | only to test Paystack webhooks | Paystack cannot reach `localhost` |

## Local setup, step by step

### 1. Install
```bash
npm install
```
Commit the generated `package-lock.json`. Render and CI use `npm ci`, which needs it.

### 2. Create a Supabase project
Create a project at supabase.com and keep it open. You need three things from Project Settings, API: the project URL, the `anon` key and the `service_role` key.

### 3. Fill in `.env.local`
```bash
cp .env.example .env.local
```
| Variable | Local value |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` |
| `NEXT_PUBLIC_SUPABASE_URL` | your project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | the service_role key (server only, never share it) |
| `PAYSTACK_SECRET_KEY` | your **test** key, `sk_test_...` |
| `CRON_SECRET` | any long random string: `openssl rand -base64 32` |
| `PAYSTACK_TRANSFERS_ENABLED` | `false` |
| `RATE_LIMIT_DISABLED` | `true` (optional, stops you locking yourself out while testing) |

Every variable is explained in `docs/environment.md`.

### 4. Apply the database migrations
Run the files in `supabase/migrations` **in number order**, `0001` to `0017`.

**With the Supabase CLI (recommended):**
```bash
npm install -g supabase       # or: brew install supabase/tap/supabase
supabase login
supabase link --project-ref <your-project-ref>
supabase db push
```
**Without it:** open the SQL editor in the Supabase dashboard, paste each file in order and run it. Stop and read the message if one fails. Do not skip ahead.

`pg_cron` (daily earnings) may not be available on every plan. Migration `0013` then prints a notice and carries on. You can still run earnings by hand (see below).

### 5. Configure Supabase Auth
In the dashboard, Authentication:
- **URL Configuration:** Site URL `http://localhost:3000`, and add `http://localhost:3000/auth/callback` to Redirect URLs.
- **Providers, Email:** keep "Confirm email" on.
- **Providers, Phone** (optional): needs an SMS provider such as Twilio. Skip it if you do not need phone verification.
- Free-tier projects send only a few auth emails per hour. For heavy testing add your own SMTP sender.

### 6. Start the app
```bash
npm run dev
```
Open http://localhost:3000. Register an account and confirm the email link.

### 7. Make yourself an admin
Sign up in the app first, then in the Supabase SQL editor:
```sql
insert into public.admin_users (user_id, role)
select id, 'super_admin' from auth.users where email = 'you@example.com';
```
Visit http://localhost:3000/admin. Roles are `super_admin`, `admin`, `finance` and `support` (see `docs/admin.md`).

### Optional: run Supabase locally with Docker
```bash
supabase init        # creates supabase/config.toml, leaves your migrations alone
supabase start       # prints the local URL and keys
supabase db reset    # applies every migration to the local database
```
Put the printed local URL and keys in `.env.local`. Confirmation emails appear in the local mail inbox at http://127.0.0.1:54324. In `supabase/config.toml` set `site_url = "http://localhost:3000"` and add `http://localhost:3000/auth/callback` to `additional_redirect_urls`.

## Try the whole product locally
This walks through every feature. Use two browser profiles (or one normal and one private window): one as an admin, one as a member.

### Packages
The migration seeds Starter, Bronze, Silver, Gold and Diamond as **drafts**. As admin, open `/admin/packages`, check the numbers and press Publish on a few. The amounts and rates are starting values only.

### Fund the wallet
As the member open `/wallet`, enter an amount and continue to Paystack. Use a Paystack test card from their docs. After paying you return to `/wallet/fund/callback`, which verifies the payment itself, so **funding works locally without webhooks**.

To test webhooks too: start a tunnel (`ngrok http 3000` or `cloudflared tunnel --url http://localhost:3000`), set the Paystack test webhook to `https://<tunnel>/api/webhooks/paystack`, and add the tunnel address to `ALLOWED_ORIGINS` if you browse through it. Replay an event from the Paystack dashboard: the balance must not change twice.

No Paystack yet? Credit a test balance as an admin instead: open the member at `/admin/users`, use "Manual adjustment", add money with a reason.

### Buy a package
`/packages`, press Buy, confirm. Click twice quickly: only one purchase happens (30 second duplicate guard plus idempotency key).

### Pay a day of profit
Packages pay once a day. To test now, move a package's payout date back and run the job:
```sql
update public.user_packages set next_payout_at = now() - interval '1 day' where status = 'active';
```
Then as admin open `/admin/settings` and press **Run now** under Daily earnings. Run it again: nothing new is paid. Moving the date back three days pays three days (catch-up). The member's profit shows on the dashboard.

### Withdraw
Withdrawals have rules, so a fresh member is blocked until:
1. They have **profit** (only profit can be withdrawn, not deposits). Use the step above.
2. They have a **date of birth**. Set it by SQL for testing:
   ```sql
   update public.users
      set date_of_birth = '2000-01-01'
    where email = 'member@example.com';
   ```
3. They saved bank details at `/profile`.

Then `/withdrawals` shows the available profit and the request form. Request one. As admin open `/admin/withdrawals`, approve it, then **Mark paid** (automatic transfers are off by default). Check `/admin/audit-logs` and the member's `/notifications`.

To test the 7 day rule request a second one: it is refused. Change the rule in `/admin/settings`.

### Automatic bank payouts (optional)
Set `PAYSTACK_TRANSFERS_ENABLED=true`. Only NGN wallets and valid Nigerian bank accounts work. Read `docs/transfers.md` first (OTP must be off for transfers, the balance must be funded, live mode needs an IP allow list).

### Suspend a user
`/admin/users`, open a member, Suspend with a reason. Their purchases and withdrawals stop at once.

### The PWA
The service worker runs only in a production build:
```bash
npm run build && npm start      # http://localhost:3000
```
Open DevTools, Application, check the manifest and service worker, then try Offline.

## Everyday commands
| Command | What it does |
| --- | --- |
| `npm run dev` | Development server with hot reload |
| `npm run build` | Production build (also type checks) |
| `npm start` | Serve the production build |
| `npm run typecheck` | TypeScript, no output files |
| `npm run lint` | ESLint (`any` and unused variables are warnings, not errors) |
| `npm run security:check` | Static security rules: every route has an access rule, every table has row level security, definer functions have a fixed search path, no secrets in public variables, CSRF and CSP wired in |

## Project structure
```
.
├── middleware.ts                # CSRF check, CSP nonce, session refresh, page protection
├── next.config.ts               # security headers and cache rules
├── render.yaml                  # Render blueprint (one web service; Supabase runs schedules)
├── scripts/security-check.mjs   # the static security check
├── supabase/migrations/         # all database changes, in order (0001 ... 0017)
├── docs/                        # topic guides (see the index below)
├── public/                      # service worker, offline page, icons
└── src/
    ├── instrumentation.ts       # checks environment variables when the server starts
    ├── app/
    │   ├── (app)/               # signed in member pages: dashboard, packages, wallet, withdrawals, profile, notifications
    │   ├── (admin)/admin/       # admin console pages
    │   ├── login, register, forgot-password, reset-password, verify-phone
    │   ├── auth/callback        # email confirmation and reset links
    │   └── api/                 # JSON API (see "API overview")
    ├── components/
    │   ├── admin/               # admin forms, shell, chart
    │   ├── dashboard/           # member UI pieces and shared UI primitives (ui.tsx)
    │   ├── auth/, profile/, layout/, pwa/, ui/
    ├── services/                # business logic, one folder per domain
    │   ├── wallet/              # ledger, deposits, purchases, withdrawal requests
    │   ├── payments/            # Paystack funding
    │   ├── packages/            # package management
    │   ├── earnings/            # daily profit engine
    │   ├── withdrawals/        # eligibility rules, admin review
    │   ├── transfers/           # Paystack bank payouts
    │   └── admin/               # user search, analytics, audit log reads
    ├── lib/
    │   ├── api/                 # route wrapper, auth checks, rate limiting, safe body reader
    │   ├── security/            # CSRF, CSP, audit helper
    │   ├── supabase/            # browser, server, admin and middleware clients
    │   └── ...                  # env, formatting, logger, validation helpers
    └── data/                    # static content: navigation, site info, route lists
```

## How the code is organised
Each feature follows the same path, and each layer has one job:

```
Page or component  ->  API route  ->  service  ->  repository  ->  database function
   (what you see)    (who is asking)  (the rules)  (the queries)    (the truth, one transaction)
```

| Layer | Rule |
| --- | --- |
| **Page** | Server components read data through a service. Client components call the API with `fetch`. |
| **API route** (`src/app/api/**/route.ts`) | Thin. Checks who is calling (`requireUser`, `requireAdmin(roles)`, a webhook signature or a cron secret), parses input, calls one service function, returns JSON. Wrapped in `route()` for rate limiting and error handling. |
| **Service** | Validates input and decides what to do. No SQL here. |
| **Repository** | The only place that talks to Supabase. Reads use the member's own client so row level security applies. |
| **Database function** | Anything that moves money runs as **one transaction** inside Postgres (ledger row, balance, business row, audit log, notification together or not at all). |

Principles to keep when you change things:
- **Money moves only in database functions**, never from the app with plain updates. A trigger blocks direct balance edits.
- **The service role key is server only.** Files marked `"use client"` must never import it (the security check enforces this).
- **Everything that can be retried has an idempotency key** (purchases, withdrawals, deposits, adjustments), so a double click or a replayed webhook cannot pay twice.
- **Errors are short codes** such as `INSUFFICIENT_FUNDS`. The database raises the code, `src/services/wallet/errors.ts` maps it to a friendly message and an HTTP status, and the API answers `{ "error": { "code", "message" } }`. Successful answers are `{ "data": ... }`.
- **Style:** small functions, early returns, no deep nesting, no heavy dependencies (the runtime dependencies are Next, React, Supabase, next-themes and server-only), plain English in user-facing text.

## Database
Migrations are forward only. Never edit one that has run somewhere, add a new one.

| File | Adds |
| --- | --- |
| `0001` to `0005` | Types, tables (users, wallets, ledger, packages, user packages, earnings, withdrawals, notifications, audit logs, admin users, settings), triggers |
| `0006` | Row level security and privileges |
| `0007` | Default settings |
| `0008` | Profile fields, bank details, phone sync, avatars bucket |
| `0009` | Wallet functions: deposit, purchase, withdrawal request, profit credit, admin adjustment, reconcile |
| `0010` | Paystack payments table and `payment_complete` |
| `0011` | Package administration functions |
| `0012` | Purchase hardening (duplicate window, per-member limit) |
| `0013` | Daily earnings engine, run log, pg_cron schedule |
| `0014` | Withdrawal rules, admin review functions, editable settings |
| `0015` | Admin dashboard queries, user suspension |
| `0016` | Paystack transfers: recipients, attempts, retry planning |
| `0017` | Production hardening: privileges, rate limits, request audit, sensitive change audit |

Useful facts:
- All amounts are `numeric(14,2)`. The ledger (`wallet_transactions`) and `audit_logs` are append only: edits, deletes and truncates are blocked.
- Tables use `uuid` keys, `created_at`, `updated_at` and (where it makes sense) `deleted_at` for soft delete.
- Full design notes and an ER diagram are in `docs/database.md`.

Handy queries:
```sql
-- Does every wallet balance match its ledger? (expect no rows)
select w.id, r.balance, r.ledger_balance
  from public.wallets w cross join lateral public.wallet_reconcile(w.id) r
 where not r.is_balanced;

-- Latest audit entries
select created_at, action, actor_type, entity_table from public.audit_logs order by created_at desc limit 20;
```

## API overview
All routes return JSON. Money-changing calls need an `Idempotency-Key` header. Browsers send cookies automatically. From a terminal you must also send `Origin: http://localhost:3000` and `Content-Type: application/json` (the CSRF check requires them).

| Group | Routes | Who |
| --- | --- | --- |
| Auth | `/api/auth/login`, `register`, `logout`, `forgot-password`, `reset-password`, `resend-email`, `phone/send`, `phone/verify` | public or signed in |
| Profile | `/api/profile`, `/api/profile/avatar` | member |
| Wallet | `/api/wallet`, `/api/wallet/transactions`, `/api/wallet/fund`, `/api/wallet/fund/verify` | member |
| Packages | `/api/packages` (public list), `/api/packages/:id/purchase`, `/api/wallet/purchases` | public, member |
| Earnings | `/api/earnings`, `/api/earnings/summary` | member |
| Withdrawals | `/api/wallet/withdrawals`, `/api/wallet/withdrawals/eligibility` | member |
| Admin | `/api/admin/overview`, `analytics`, `users/**`, `packages/**`, `withdrawals/**`, `wallets/**`, `audit-logs`, `settings`, `earnings/runs` | admins, by role |
| Webhooks | `/api/webhooks/paystack` | Paystack, signature checked |
| Cron | `/api/cron/transfers`, `/api/cron/daily-earnings` | scheduler, bearer secret |
| Ops | `/api/health`, `/api/csp-report` | public |

Details per topic are in `docs/wallet.md`, `docs/paystack.md`, `docs/packages.md`, `docs/purchases.md`, `docs/earnings.md`, `docs/withdrawals.md`, `docs/transfers.md` and `docs/admin.md`.

## Security in one page
- **Row level security** is on for every table. Members read their own rows only; all writes go through database functions.
- **Rate limiting** on every API route, stored in Postgres so it holds across servers. Set `RATE_LIMIT_DISABLED=true` locally if it gets in your way (refused in production).
- **CSRF:** data-changing requests must come from your own origin and be JSON.
- **Headers:** CSP with a per-request nonce (report-only until you set `CSP_MODE=enforce`), HSTS, frame and referrer policies.
- **Audit log** for money, admin actions, sign ins, password and bank changes, with IP.
- **Roles:** checked in the page, the route and the database function.
- **Kill switch:** automatic payouts need `PAYSTACK_TRANSFERS_ENABLED=true`.

Read `docs/security-checklist.md` before launch. It lists the open risks honestly.

## Developer recipes

### Add an API endpoint
1. Put the rules in a service function (`src/services/<domain>/`). Validate input there with the helpers in `src/services/wallet/validation.ts`.
2. Put the queries in that domain's repository. If it changes money or several tables, write a database function instead (new migration).
3. Create `src/app/api/<path>/route.ts`:
   ```ts
   import { ok, route } from "@/lib/api/http";
   import { requireUser } from "@/lib/api/auth";

   export const GET = route(async () => {
     const { db } = await requireUser();
     return ok(await myService.list(db));
   });
   ```
   For admin routes use `requireAdmin(["super_admin", "admin"])` with an explicit list of roles. For stricter rate limits pass `{ rate: { name: "x", limit: 10, windowSec: 600 } }` as the second argument of `route`.
4. Run `npm run security:check`. It fails if the route has no access rule.

### Add a database change
1. Create `supabase/migrations/00NN_short_name.sql` (next number, never edit an old file).
2. New table: enable row level security, add policies, revoke what members must not do.
3. New `security definer` function: add `set search_path = public`, then `revoke all on function ... from public, anon, authenticated;` and `grant execute ... to service_role;`.
4. Apply it (`supabase db push`), then run `npm run security:check`.

### Add an admin page
1. Create `src/app/(admin)/admin/<name>/page.tsx` and call `await requireAdminPage([...roles])` first. Do this in every page, because layouts are not re-checked on client navigation.
2. Add the item and its roles to `NAV` in `src/components/admin/admin-shell.tsx`.
3. Read data through a service. Use client components only for buttons and forms, and call the admin API from them with `adminRequest` (`src/lib/admin-api.ts`).

### Add an error code
Add one line to the catalog in `src/services/wallet/errors.ts` (`CODE: [httpStatus, "Friendly message."]`), then `raise exception 'CODE'` in SQL or `throw new WalletError("CODE")` in TypeScript.

### Change a business rule
Many rules are editable settings (minimum withdrawal, days between withdrawals, fee, maintenance mode) at `/admin/settings`. Other rules live in the database functions listed above. Change them with a new migration using `create or replace function`.

### Logging
Use `logger.info("event.name", { ...fields })` from `src/lib/logger.ts`. It prints one JSON line per event, easy to search on Render. Never log secrets, tokens or full bank numbers.

## Troubleshooting
| Symptom | Cause and fix |
| --- | --- |
| App will not start: "Invalid configuration" | A required variable is missing or too short. Compare `.env.local` with `.env.example`. `CRON_SECRET` needs 32+ characters. |
| `403 CSRF_BLOCKED` from curl or Postman | Add `-H "Origin: http://localhost:3000"`. Browsers do this for you. |
| `415 UNSUPPORTED_MEDIA_TYPE` | Send `Content-Type: application/json`. |
| `429` while testing | Rate limit. Set `RATE_LIMIT_DISABLED=true` in `.env.local` and restart. |
| Redirect loop between `/login` and `/dashboard` | Cookies are blocked or `NEXT_PUBLIC_SITE_URL` does not match the address in your browser. |
| Confirmation email never arrives | Free Supabase projects have a low email limit. Use custom SMTP, or the local Docker stack and its mail inbox. |
| `permission denied for function ...` | A client tried to call a locked database function. Call it from server code with the service role instead. |
| "Add your date of birth" on withdrawals | Set `date_of_birth` with the SQL in "Withdraw". |
| Withdrawal says "You do not have enough profit" | Only profit is withdrawable. Pay a day of profit first. |
| Wallet funded on Paystack but balance did not change | Open `/wallet/fund/callback?reference=<ref>` to force a check, and read the server log for `payment` lines. Webhooks need a public URL. |
| Daily earnings never run | `pg_cron` may be off. Press Run now in `/admin/settings`, or use the Render cron job. |
| Service worker serves old files | It runs only in production builds. In DevTools, Application, Service Workers, Unregister, then reload. |
| CSP violations in the console | Expected in report-only mode while you tune. See `/api/csp-report` lines in the log before enforcing. |
| `npm ci` fails on Render | `package-lock.json` is not committed. Run `npm install` locally and commit the file. |
| Type or lint errors on the very first build | Expected for never-compiled code. Fix them in small commits. |

## Deploying
Production runs on one Render web service with Supabase handling database, authentication, and scheduled jobs, plus Paystack for payments. The full walkthrough, including the smoke test and go-live checklist, is in `docs/deployment.md`. The blueprint is `render.yaml`.

Short version: build and test locally, apply migrations to production Supabase, create the first admin, deploy the blueprint, set the environment variables, run the smoke test, then switch `CSP_MODE=enforce`, and only then enable `PAYSTACK_TRANSFERS_ENABLED`.

## Documentation index
| File | Topic |
| --- | --- |
| `docs/deployment.md` | Supabase, Paystack and Render setup, smoke test, operations |
| `docs/environment.md` | Every environment variable |
| `docs/security-checklist.md` | Review findings, open risks, pre-launch checklist, verification commands |
| `docs/database.md` | Schema, relationships, constraints, indexes |
| `docs/wallet.md` | Ledger, atomic money movement |
| `docs/paystack.md` | Wallet funding and webhooks |
| `docs/packages.md` | Package model and admin |
| `docs/purchases.md` | Buying a package safely |
| `docs/earnings.md` | Daily profit engine and scheduling |
| `docs/withdrawals.md` | Withdrawal rules and approval |
| `docs/transfers.md` | Automatic Paystack payouts and retries |
| `docs/admin.md` | Admin console, roles, user suspension |

## Contributing
1. Branch from `main`.
2. Keep changes small. New behaviour that touches money needs a migration, an error-code review and a note in the matching doc.
3. Before opening a pull request: `npm run typecheck && npm run lint && npm run security:check && npm run build`.
4. Never commit `.env*` files, keys or database dumps.

## License
Add your license here before sharing the code.
