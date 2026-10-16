# Paystack wallet funding

## Setup
1. Add `PAYSTACK_SECRET_KEY` to `.env.local` (use the `sk_test_` key first). Set `NEXT_PUBLIC_SITE_URL` to your public URL.
2. Paystack dashboard, Settings, API Keys and Webhooks: set the webhook URL to `https://YOUR_DOMAIN/api/webhooks/paystack`.
3. Apply `supabase/migrations/0010_payments.sql`.
4. Enable the wallet currency on your Paystack account. Funding limits live in `src/lib/payments/config.ts`.
5. To test locally, expose the app with a tunnel and use the tunnel URL as the webhook and site URL.

## Go live on Render

Use test mode first and complete the payment checks below before switching the production service to live credentials. Paystack requires the business account to meet its activation and country-specific compliance requirements before it can process live transactions ([Paystack business activation](https://support.paystack.com/en/articles/2125506)).

1. **Confirm the production site URL.** In Render, set `NEXT_PUBLIC_SITE_URL` to the exact public HTTPS origin members will use, without a trailing slash, for example `https://teenvest.onrender.com`. If you use a custom domain, use that instead. This value is compiled into the app during the build, so redeploy after changing it.
2. **Copy the live secret key.** In the Paystack Dashboard, switch to Live Mode and copy the live secret key from **Settings → API Keys & Webhooks**. In the Render web service, set `PAYSTACK_SECRET_KEY` to the `sk_live_...` value, save it, and redeploy. The key is server-only: do not add it to `NEXT_PUBLIC_*`, source code, or this document. This app initializes and verifies checkout on the server and does not need a Paystack public key in its environment.
3. **Register the live webhook.** In Paystack's Live Mode dashboard, set the webhook URL to `https://YOUR-PRODUCTION-DOMAIN/api/webhooks/paystack`. Use the same origin as `NEXT_PUBLIC_SITE_URL`. The endpoint handles wallet funding events and, when transfers are enabled, transfer events. Paystack recommends using webhooks to receive payment status updates ([Paystack webhooks](https://paystack.com/docs/payments/webhooks/)).
4. **Keep automatic payouts disabled initially.** Leave `PAYSTACK_TRANSFERS_ENABLED=false` in Render while testing wallet deposits. After live funding works and the separate transfer launch checks in [transfers.md](transfers.md) and [security-checklist.md](security-checklist.md) are complete, enable transfers only if you want automatic bank payouts.
5. **Deploy and check startup.** Confirm the Render deploy succeeds and review its logs for configuration warnings. A production service using an `sk_test_` key emits a warning; use the live key for real transactions.
6. **Make one controlled live deposit.** Sign in with a real member account, fund a small amount you are prepared to charge, and complete Paystack checkout. Paystack redirects to `/wallet/fund/callback`; the app verifies the transaction with Paystack before crediting the wallet. Confirm the payment and wallet ledger show one successful credit. A browser redirect by itself is not proof of payment; Paystack also documents verifying transactions before delivering value ([Accept Payments](https://paystack.com/docs/payments/accept-payments/)).
7. **Check webhook delivery.** In the Paystack Dashboard, review webhook delivery for the live transaction. Confirm Render returns a successful response and the corresponding payment is recorded once. The webhook route validates Paystack's signature, and duplicate callback/webhook deliveries are safe to retry.

If the live payment does not complete, check that the Render secret key, site URL, Paystack mode, and webhook URL all belong to the same production setup. Never paste secret keys into logs, support messages, or screenshots. For key replacement, update the Render environment value and redeploy; see [environment.md](environment.md#rotation).

## Flow
1. Member enters an amount on `/wallet` (`FundWalletCard`).
2. `POST /api/wallet/fund` checks limits and rate, saves a `pending` row in `payments`, then calls Paystack Initialize with our own reference (`tv_...`).
3. The browser goes to `authorization_url` on Paystack.
4. Paystack sends the member to `/wallet/fund/callback?reference=...`. That page calls `verifyFunding`.
5. Paystack also sends `charge.success` to the webhook. The route checks the `x-paystack-signature` header (HMAC SHA512 of the raw body), then calls the same `verifyFunding`.
6. `verifyFunding` asks Paystack Verify for the truth, then runs `payment_complete` in the database.
7. `payment_complete` locks the payment row, checks the paid amount and currency match, calls `wallet_deposit` (ledger row, balance, audit log, notification) and marks the payment `success`, all in one transaction.

## Why money is never credited twice
- The callback page and the webhook can arrive together. The payment row is locked, so one wins and the other sees `success` and does nothing.
- The ledger key `deposit:paystack:<reference>` is unique, which stops a second credit even if the row logic failed.

## Safety rules
- The amount credited is the amount saved when the member started, and it must equal what Paystack reports. A difference marks the payment `failed` with `AMOUNT_MISMATCH` and writes an audit log. Nothing is credited.
- Money is never credited from the redirect alone. Only Paystack Verify can confirm it.
- Amounts are sent in the smallest unit (kobo for NGN), converted with `Math.round(amount * 100)`.
- Members cannot read or verify each other's payments. The webhook path is not tied to a member.
- At most 5 attempts per member every 10 minutes.

## Errors
Responses are `{ "error": { "code", "message" } }`. New codes: `UNSUPPORTED_CURRENCY`, `AMOUNT_OUT_OF_RANGE`, `TOO_MANY_ATTEMPTS`, `PAYMENT_NOT_FOUND`, `PAYMENT_AMOUNT_MISMATCH`, `PAYMENT_GATEWAY_ERROR`.
- If Paystack is unreachable while verifying, the payment stays `pending`. The webhook returns 502 so Paystack retries.
- Webhooks for unknown references or other event types return 200 and are ignored.
