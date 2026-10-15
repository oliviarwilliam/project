# Paystack wallet funding

## Setup
1. Add `PAYSTACK_SECRET_KEY` to `.env.local` (use the `sk_test_` key first). Set `NEXT_PUBLIC_SITE_URL` to your public URL.
2. Paystack dashboard, Settings, API Keys and Webhooks: set the webhook URL to `https://YOUR_DOMAIN/api/webhooks/paystack`.
3. Apply `supabase/migrations/0010_payments.sql`.
4. Enable the wallet currency on your Paystack account. Funding limits live in `src/lib/payments/config.ts`.
5. To test locally, expose the app with a tunnel and use the tunnel URL as the webhook and site URL.

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
