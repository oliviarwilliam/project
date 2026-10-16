# Withdrawals

## Flow
1. **Request.** `POST /api/wallet/withdrawals` with `fundingSource: "profit"` or `"referral"` (needs an `Idempotency-Key` header).
2. **Validate rules.** Inside `wallet_request_withdrawal_v2` (migration `0025`), after locking the member's wallet.
3. **Create a pending request.** Profit is held from the member wallet; referral rewards are reserved from the separate rewards balance. A `withdrawals` row starts as `pending`. No money leaves until an admin approves and pays.
4. **Notify admin.** Every active `super_admin`, `admin` and `finance` user gets an in-app notification (they see it on `/notifications`). The member gets one too. An audit log is written.

All of this is one database transaction.

## Rules
| Rule | How it is enforced |
| --- | --- |
| Profit withdrawals | The 10 referral requirement does not apply. Available profit = profit credited (ledger type `earning`) minus profit already requested (pending, approved, processing, paid), capped at the wallet balance. Over the limit gives `EXCEEDS_PROFIT_BALANCE`. Rejected requests give the profit back. |
| Referral reward withdrawals | Referral rewards are held separately from the wallet. They can be withdrawn after the admin-configured funded referral requirement is met. Rejected requests unlock the amount again. |
| Cooldown | Each withdrawal source has its own cooldown clock, using `withdrawal_cooldown_days`. A referral reward withdrawal does not move the next eligible date for profit. Rejected requests do not count. |
| Minimum amount | Currently ₦5,000. Admins can set it from ₦0 to ₦1,000,000. Enforced by the database withdrawal transaction. |
| Admin approval required | Status starts `pending`. Only `withdrawal_review` (approve or reject) and `withdrawal_mark_paid` move it on, and only finance staff and admins can call them. |
| Also checked | Account active, not in maintenance mode, and date of birth set. Both sources use the same configured minimum and fee; each has an independent cooldown. |

## Settings (admin)
`PATCH /api/admin/settings/withdrawals` with any of `minWithdrawalAmount` (₦0 to ₦1,000,000), `withdrawalCooldownDays` (0 to 90, 0 turns the limit off), `withdrawalFeePercent` (0 to 50). Changes are range checked and audited. `GET` returns the current values.

## API
| Method and path | Who | Purpose |
| --- | --- | --- |
| GET `/api/wallet/withdrawals/eligibility` | Member | Available profit, minimum, fee, next eligible date, `canRequest`, `blockedBy` |
| POST `/api/wallet/withdrawals` | Member | Request a profit or referral reward withdrawal |
| GET `/api/wallet/withdrawals` | Member | History |
| GET `/api/admin/withdrawals?status=pending` | Admin, finance | Review queue with member email and bank details |
| POST `/api/admin/withdrawals/:id/approve` | Admin, finance | Approve a pending request |
| POST `/api/admin/withdrawals/:id/reject` | Admin, finance | Reject with a reason. Profit is refunded; referral rewards are released back to their separate balance. |
| POST `/api/admin/withdrawals/:id/paid` | Admin, finance | Mark an approved request as paid, with an optional bank reference |
| GET, PATCH `/api/admin/settings/withdrawals` | Admin | Read or change the rules |

## Errors
`{ "error": { "code", "message" } }`. Codes: `EXCEEDS_PROFIT_BALANCE`, `REFERRAL_REWARD_INSUFFICIENT`, `WITHDRAWAL_COOLDOWN`, `BELOW_MIN_WITHDRAWAL`, `PROFILE_INCOMPLETE`, `REFERRALS_REQUIRED` (referral rewards only), `ACCOUNT_RESTRICTED`, `MAINTENANCE_MODE`, `WITHDRAWAL_NOT_FOUND`, `WITHDRAWAL_NOT_PENDING`, `WITHDRAWAL_NOT_APPROVED`, `REASON_REQUIRED`, plus the wallet codes.

## How to test
1. With profit and fewer than 10 funded referrals, verify profit eligibility and submit a profit withdrawal; the referral count must not block it.
2. Request more than `availableProfit`: `EXCEEDS_PROFIT_BALANCE`. A valid profit withdrawal creates one `pending` row and one wallet debit.
3. With fewer funded referrals than the configured requirement, submit a referral withdrawal: `REFERRALS_REQUIRED`. Once the requirement is met, a valid referral withdrawal creates a pending row without changing the main wallet balance.
4. A referral withdrawal must not change the next eligible profit withdrawal date. Each source has its own cooldown.
5. Admin rejects a profit withdrawal: the wallet gets a `refund` credit. Rejecting a referral withdrawal releases the amount back to the referral balance.
6. Admin approves, then marks paid: status `approved` then `paid`.
7. `select * from wallet_reconcile('<wallet id>');` should show `is_balanced = true`.
