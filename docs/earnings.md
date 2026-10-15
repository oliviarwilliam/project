# Daily earnings engine

## What runs
`run_daily_earnings()` (migration `0013_earnings_engine.sql`) runs once every 24 hours.

1. Finds packages that are `active` with `next_payout_at <= now()`.
2. For each one, calls `wallet_credit_profit`, which in one transaction saves an `earnings` row, credits the wallet ledger, advances `next_payout_at`, writes an audit log and notifies the member.
3. If the job was down for days, it pays every missed day in the same run (up to 40 per package per run).
4. After the last payout the package becomes `completed` and is never picked up again. A sweep also closes any active package past its end date with no payout left.
5. A package that fails is logged and skipped. The rest continue.
6. It writes one row to `earnings_runs` and an `earnings.run` audit log.

Profit per day is `amount x return_rate`, frozen at purchase. A 30 day package pays 30 times, then stops.

## Why it is safe to run twice
- `earnings` is unique on `(user_package_id, period_start)`, so a period can only be paid once.
- `wallet_credit_profit` locks the package row, and the ledger key `earning:<id>` is unique.
- An advisory lock makes a second overlapping run skip itself (`ALREADY_RUNNING`).

## Schedule it (pick one)
**A. pg_cron, inside Supabase (default).** The migration schedules `daily-earnings` at `0 0 * * *` (00:00 UTC). If the extension is not available it prints a notice and skips. Enable it under Database, Extensions, then re-run the last block of the migration. Check with `select * from cron.job;` and `select * from cron.job_run_details order by start_time desc limit 5;`.

**B. HTTP.** Call `GET /api/cron/daily-earnings` with `Authorization: Bearer $CRON_SECRET`. On Vercel add `vercel.json`:
```json
{ "crons": [{ "path": "/api/cron/daily-earnings", "schedule": "0 0 * * *" }] }
```
Vercel sends the bearer header for you when `CRON_SECRET` is set. Do not enable both A and B. It would still be safe, only wasteful.

## Logging
| Where | What |
| --- | --- |
| `earnings_runs` table | One row per run: trigger, status (`success`, `partial`, `failed`), counts, total paid, up to 50 failures with package ids |
| `audit_logs` | `wallet.profit_credit` per payout and `earnings.run` per run |
| App logs (`src/lib/logger.ts`) | JSON lines: `earnings.run.start`, `.finish`, `.finish_with_failures`, `.skipped`, `.crashed` |
| `cron.job_run_details` | pg_cron's own record, when option A is used |

## API
| Method and path | Who | Purpose |
| --- | --- | --- |
| GET `/api/earnings` | Member | Profit history. Query: `packageId`, `limit`, `cursor` |
| GET `/api/earnings/summary` | Member | Total, today, last 7 days, payouts |
| GET or POST `/api/cron/daily-earnings` | Scheduler | Run the engine |
| GET `/api/admin/earnings/runs` | Admin, finance | Recent runs |
| POST `/api/admin/earnings/runs` | Admin, finance | Run now |

## How to test
1. Buy a package, then move it forward: `update user_packages set next_payout_at = now() - interval '1 day' where id = '<id>';`
2. `select public.run_daily_earnings('manual');` Expect `credited: 1`, one `earnings` row, one ledger credit, one `earnings_runs` row.
3. Run it again. Expect `credited: 0`.
4. Set `next_payout_at = now() - interval '3 days'` and run: expect 3 credits (catch-up).
5. Set `ends_at = now() - interval '1 hour'` and `next_payout_at = now() - interval '1 hour'`: after the run the status is `completed`.
6. `select * from wallet_reconcile('<wallet id>');` should show `is_balanced = true`.
