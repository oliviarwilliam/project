# Package purchase

## Flow and where each step lives
| Step | Where |
| --- | --- |
| 1. Member selects a package | `PurchaseButton` on `/packages`, then `POST /api/packages/:id/purchase` |
| 2. Validate balance | `GET /api/packages/:id/purchase` (preview) and again inside the database function |
| 3. Deduct amount | `post_wallet_transaction` (locks the wallet, blocks overdrafts) |
| 4. Create active package | insert into `user_packages` with the price, rate and dates frozen at purchase |
| 5. Save transaction | ledger row of type `package_purchase`, linked by `purchase_txn_id` |
| 6. Audit log | `write_audit` row with balance before and after, plus a member notification |

Steps 3 to 6 are one function, `wallet_purchase_package` (`0009`, hardened in `0012`). A function call is one transaction, so if any step fails everything rolls back and the member is never charged for a package they did not get.

## Duplicate protection (four layers)
1. **Idempotency key.** The button reuses one key per purchase attempt. Sending the same key again returns the first result and charges nothing. Keys are scoped to the member, and reusing a key for a different package is rejected (`IDEMPOTENCY_KEY_REUSED`).
2. **Wallet row lock.** All purchases by one member run one at a time, so two requests can never both spend the same balance.
3. **Duplicate window.** Buying the same package again within 30 seconds is rejected (`DUPLICATE_PURCHASE`). This catches double clicks and two open tabs, which use different keys. Change it with the `purchase_duplicate_window_seconds` setting. Set it to 0 to turn it off.
4. **Per member limit.** `packages.max_per_user` caps how many active copies one member can own (`PACKAGE_LIMIT_REACHED`). It is checked after the lock, so parallel requests cannot slip past it.

The package row is locked with FOR SHARE, so an admin editing or disabling it waits for running purchases to finish.

## Errors
Responses are `{ "error": { "code", "message" } }`.

| Code | Status | Meaning |
| --- | --- | --- |
| `INSUFFICIENT_FUNDS` | 422 | Balance is lower than the price |
| `PACKAGE_UNAVAILABLE` | 404 | Not active, deleted or unknown |
| `PACKAGE_LIMIT_REACHED` | 409 | Member already owns the maximum |
| `DUPLICATE_PURCHASE` | 409 | Bought the same package moments ago |
| `IDEMPOTENCY_KEY_REUSED` | 409 | Key was used for something else |
| `IDEMPOTENCY_KEY_REQUIRED` | 400 | Missing `Idempotency-Key` header |
| `WALLET_NOT_FOUND` | 404 | No wallet in the package currency |
| `ACCOUNT_RESTRICTED`, `MAINTENANCE_MODE` | 403, 503 | Account or system blocks transactions |

## API
| Method and path | Purpose |
| --- | --- |
| GET `/api/packages/:id/purchase` | Preview: `canPurchase`, `balance`, `shortfall`, `blockedBy` |
| POST `/api/packages/:id/purchase` | Buy. Needs `Idempotency-Key` |
| POST `/api/wallet/purchases` | Same as above with `{ packageId }` in the body |
| GET `/api/wallet/purchases?status=active` | The member's purchased packages |

## How to test
1. Fund a wallet, then buy a package: expect one ledger debit, one `user_packages` row with `status = active`, one `wallet.package_purchase` audit row.
2. Send the same request twice with the same key: the second response has `replayed: true`, balance drops once.
3. Click Buy twice fast, or buy in two tabs: the second gets `DUPLICATE_PURCHASE`.
4. Try with a balance below the price: `INSUFFICIENT_FUNDS`, no rows created.
5. Run `select * from wallet_reconcile('<wallet id>')`: `is_balanced` should be true.
