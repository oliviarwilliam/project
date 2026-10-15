# Paystack transfers

Pays approved withdrawals straight to the member's bank account (NGN, Nigerian banks).

## Flow
1. **Admin approves.** `POST /api/admin/withdrawals/:id/approve` approves the request and then starts the transfer. The approval stands even if the transfer cannot start.
2. **Create recipient.** The member's bank name is matched to a Paystack bank code (`GET /bank`, cached six hours). The recipient is created once and saved in `transfer_recipients`, so later withdrawals reuse it.
3. **Initiate transfer.** `POST /transfer` for the amount after the fee, with a unique reference per attempt (`tvw-<withdrawal>-<attempt>`).
4. **Update status.** `transfer.success`, `transfer.failed` and `transfer.reversed` webhooks (same URL and signature check as funding: `/api/webhooks/paystack`) call `transfer_complete`. The withdrawal becomes `paid`, or goes back to `approved` with a retry plan.
5. **Notify.** `transfer_complete` tells the member in the same transaction ("Withdrawal paid", or "Withdrawal delayed"), and tells admins when a transfer fails for good.

## Why it cannot pay twice
- Every attempt has its own reference, saved before Paystack is called.
- If Paystack times out, the service asks Paystack for that reference before doing anything else. If it is unknown, the same reference is sent again.
- Only one live attempt per withdrawal can exist (unique index), and manual "mark paid" is refused while one is live.

## Retry logic
| Situation | What happens |
| --- | --- |
| Timeout, 5xx, rate limit | Attempt stays `queued`. The job verifies by reference, then resumes with the same reference. |
| Failed or reversed, retryable (low Paystack balance, bank down) | Retried after 10 minutes, then 30, then 90, up to `transfer_max_attempts` (3). |
| Failed for good (bad account, unknown bank, key problem, or attempts used up) | Withdrawal stays `approved` with the money still held. Admins and the member are notified. An admin can Send transfer again, Mark paid, or Reject (refund). |
| Webhook never arrives | After 15 minutes the job verifies the transfer with Paystack. |

The job is `GET /api/cron/transfers` with `Authorization: Bearer $CRON_SECRET`. Run it every 5 to 10 minutes (Vercel Cron: `{ "crons": [{ "path": "/api/cron/transfers", "schedule": "*/10 * * * *" }] }`, which needs a plan that allows it).

## Admin API
| Method and path | Purpose |
| --- | --- |
| POST `/api/admin/withdrawals/:id/approve` | Approve and start the transfer. Returns `{ withdrawal, transfer }` |
| POST `/api/admin/withdrawals/:id/transfer` | Start or retry the transfer now |
| GET `/api/admin/withdrawals/:id/transfers` | All attempts |
| POST `/api/admin/withdrawals/:id/paid` | Manual payment outside Paystack (refused while a transfer is live) |

The admin Withdrawals page has a Sending tab, shows the newest attempt on each request, and offers Send transfer.

## Paystack setup
1. Enable Transfers on your Paystack account and fund the balance. Transfers fail with "balance is not enough" otherwise (that is retried automatically).
2. **Turn off OTP for transfers** (Settings, Preferences). If OTP is on, Paystack waits for a code this app does not send, so the attempt is stopped and an admin is told.
3. In live mode add your server IPs to the API IP allow list.
4. The webhook URL is the one already set for funding. Make sure the transfer events are delivered to it.

## Limits
- Only NGN. Other currencies return a clear message: pay manually and mark paid.
- Bank names are free text on the profile. If a name cannot be matched, the attempt fails without a retry and the admin pays manually. Storing a bank code on the profile would remove this.

## Test it
1. With a Paystack test key, approve a withdrawal for an NGN member with a valid 10 digit account. Expect a `withdrawal_transfers` row, status `processing`, then `paid` after the webhook.
2. Use a bad bank name: expect a failed attempt, the withdrawal back at `approved`, and admin and member notifications.
3. Call the cron route: stuck attempts get verified or resumed.
4. `select * from audit_logs where action like 'withdrawal.transfer%' order by created_at desc;`

## Kill switch
Automatic transfers only start when `PAYSTACK_TRANSFERS_ENABLED=true`. With it off, approving a withdrawal still works and the response says transfers are turned off. Pay by hand and use Mark paid. Transfers already sent are still settled by the webhook and the job. Leave it off until the go live checklist in `docs/security-checklist.md` is done.
