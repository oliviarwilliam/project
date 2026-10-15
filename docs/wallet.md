# Wallet system

## Layers

| Layer | Location | Job |
| --- | --- | --- |
| Database functions | `supabase/migrations/0009_wallet_functions.sql` | Move money, enforce rules, write audit logs |
| Repository | `src/services/wallet/wallet.repository.ts` | The only code that talks to the database |
| Service | `src/services/wallet/wallet.service.ts` | Validation, key scoping, orchestration |
| Routes | `src/app/api/**` | Check who is calling, then call the service |

Reads run as the signed in member, so row level security applies. Writes call database functions with the service role, only after the route has checked the caller.

## Transaction types

| Type | Direction | Created by | Function |
| --- | --- | --- | --- |
| deposit | credit | Paystack payment confirmation | `wallet_deposit` |
| package_purchase | debit | Member | `wallet_purchase_package` |
| withdrawal | debit | Member | `wallet_request_withdrawal` |
| earning (profit credit) | credit | Scheduled job | `wallet_credit_profit` |
| adjustment | credit or debit | Admin | `wallet_admin_adjust` |

## Integrity guarantees

1. **Atomic.** Each function is one transaction. Balance, ledger row, business row, audit log and notification all commit together or not at all.
2. **One way to change a balance.** A trigger rejects any update to `wallets.balance` unless it comes from `post_wallet_transaction`.
3. **No overdrafts.** The wallet row is locked (`for update`), the new balance is checked, and a table constraint backs it up.
4. **Idempotent.** Each write has a key. Sending it twice returns the first result and does nothing else. Member keys are prefixed with the user id.
5. **Append only ledger.** Ledger and audit rows cannot be edited or deleted.
6. **No double profit.** One earning per package period, enforced by a unique key.
7. **Auditable.** Every action writes to `audit_logs` with the actor. Admin adjustments store the balance before and after and the reason.
8. **Checkable.** `wallet_reconcile` compares the stored balance with the ledger sum.

## Endpoints

| Method and path | Who | Purpose |
| --- | --- | --- |
| GET `/api/wallet` | Member | Balance and totals |
| GET `/api/wallet/transactions` | Member | History and ledger. Query: `type`, `limit`, `cursor`, `currency` |
| GET `/api/wallet/transactions/:id` | Member | One transaction |
| POST `/api/wallet/purchases` | Member | Buy a package |
| POST `/api/wallet/withdrawals` | Member | Request a withdrawal |
| POST `/api/webhooks/paystack` | Paystack | Confirm a payment and credit the deposit (see `docs/paystack.md`) |
| GET or POST `/api/cron/daily-earnings` | Scheduler | Pay all due profits (see `docs/earnings.md`) |
| POST `/api/admin/wallets/:walletId/adjustments` | Admin, finance | Credit or debit with a reason |
| GET `/api/admin/wallets/:walletId/reconcile` | Any admin | Balance check |

Purchase, withdrawal and adjustment calls need an `Idempotency-Key` header. Generate one id per user action and reuse it on retries.

Responses are `{ "data": ... }` or `{ "error": { "code", "message" } }`. Error codes include `INSUFFICIENT_FUNDS`, `BELOW_MIN_WITHDRAWAL`, `PACKAGE_LIMIT_REACHED`, `GUARDIAN_CONSENT_REQUIRED` and `MAINTENANCE_MODE`.

## Rules worth knowing

- A withdrawal debits the wallet straight away and creates a `pending` request. The fee is stored on the request and taken from the payout, not added to the debit.
- Withdrawals need a date of birth, and guardian consent for members under the age in the `guardian_consent_under_age` setting.
- A profit credit pays `amount x return_rate` once per payout interval. A package completes when the next payout would fall after its end date.
- Withdrawal rules and admin review are in `docs/withdrawals.md`.
