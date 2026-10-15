# Withdrawals

## Flow
1. **Request.** `POST /api/wallet/withdrawals` (needs an `Idempotency-Key` header).
2. **Validate rules.** Inside `wallet_request_withdrawal` (migration `0014`), after locking the member's wallet.
3. **Create a pending request.** The amount is held (debited) straight away and a `withdrawals` row is created with status `pending`. No money leaves until an admin approves and pays.
4. **Notify admin.** Every active `super_admin`, `admin` and `finance` user gets an in-app notification (they see it on `/notifications`). The member gets one too. An audit log is written.

All of this is one database transaction.

## Rules
| Rule | How it is enforced |
| --- | --- |
| Profit balance only | Available profit = profit credited (ledger type `earning`) minus profit already requested (pending, approved, processing, paid), capped at the wallet balance. Over the limit gives `EXCEEDS_PROFIT_BALANCE`. Rejected requests give the profit back. |
| Once every 7 days | No other request (not rejected or cancelled) in the last `withdrawal_cooldown_days`. Gives `WITHDRAWAL_COOLDOWN`. The wallet lock stops two requests sent at once from both passing. |
| Admin approval required | Status starts `pending`. Only `withdrawal_review` (approve or reject) and `withdrawal_mark_paid` move it on, and only finance staff and admins can call them. |
| Minimum configurable | `min_withdrawal_amount` setting. Below it gives `BELOW_MIN_WITHDRAWAL`. |
| Also checked | Account active, not in maintenance mode, date of birth set, guardian consent for members under the set age. |

## Settings (admin)
`PATCH /api/admin/settings/withdrawals` with any of `minWithdrawalAmount`, `withdrawalCooldownDays` (0 to 90, 0 turns the limit off), `withdrawalFeePercent` (0 to 50). Changes are range checked and audited. `GET` returns the current values.

## API
| Method and path | Who | Purpose |
| --- | --- | --- |
| GET `/api/wallet/withdrawals/eligibility` | Member | Available profit, minimum, fee, next eligible date, `canRequest`, `blockedBy` |
| POST `/api/wallet/withdrawals` | Member | Request |
| GET `/api/wallet/withdrawals` | Member | History |
| GET `/api/admin/withdrawals?status=pending` | Admin, finance | Review queue with member email and bank details |
| POST `/api/admin/withdrawals/:id/approve` | Admin, finance | Approve a pending request |
| POST `/api/admin/withdrawals/:id/reject` | Admin, finance | Reject with a reason. The held money is refunded in the same transaction. |
| POST `/api/admin/withdrawals/:id/paid` | Admin, finance | Mark an approved request as paid, with an optional bank reference |
| GET, PATCH `/api/admin/settings/withdrawals` | Admin | Read or change the rules |

## Errors
`{ "error": { "code", "message" } }`. Codes: `EXCEEDS_PROFIT_BALANCE`, `WITHDRAWAL_COOLDOWN`, `BELOW_MIN_WITHDRAWAL`, `PROFILE_INCOMPLETE`, `GUARDIAN_CONSENT_REQUIRED`, `ACCOUNT_RESTRICTED`, `MAINTENANCE_MODE`, `WITHDRAWAL_NOT_FOUND`, `WITHDRAWAL_NOT_PENDING`, `WITHDRAWAL_NOT_APPROVED`, `REASON_REQUIRED`, plus the wallet codes.

## How to test
1. As a member with credited profit, call eligibility: `canRequest: true`, `availableProfit` above 0.
2. Request more than `availableProfit`: `EXCEEDS_PROFIT_BALANCE`. Request a valid amount: one `pending` row, one ledger debit, admin notifications.
3. Request again: `WITHDRAWAL_COOLDOWN`. Eligibility shows `nextEligibleAt`.
4. Admin rejects with a reason: the wallet gets a `refund` credit, the request is `rejected`, and the member can request again at once.
5. Admin approves, then marks paid: status `approved` then `paid`.
6. `select * from wallet_reconcile('<wallet id>');` should show `is_balanced = true`.
