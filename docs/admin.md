# Super admin dashboard

Open `/admin`. Access is checked in the layout and again in every page, and every API route checks the role.

## Roles
| Section | super_admin | admin | finance | support |
| --- | --- | --- | --- | --- |
| Overview | yes | yes | yes (money figures) | yes (user figures only) |
| Users (search, view transactions) | yes | yes | no | yes (read only) |
| Suspend, reactivate | yes | yes (not other admins) | no | no |
| Packages | yes | yes | no | no |
| Withdrawals | yes | yes | yes | no |
| Financial analytics | yes | yes | yes | no |
| Audit logs, Settings | yes | yes | no | no |

## Sections
- **Overview.** User counts, money in wallets, active packages, withdrawals waiting, 30 day flows, the review queue and recent audit entries. A currency switcher shows when more than one currency exists.
- **Users.** `/admin/users` searches by email, name or full user id with a status filter and paging. A user page shows the profile, wallet totals, a transaction history with filters, suspend or reactivate, and a manual wallet adjustment (reason required).
- **Packages.** `/admin/packages`: create, edit, enable, disable (see `docs/packages.md`).
- **Withdrawals.** `/admin/withdrawals`: tabs for To review, To pay, Paid and Rejected. Approve, reject with a reason (refunds the member), or mark paid with a bank reference.
- **Financial analytics.** `/admin/analytics`: 7, 30 or 90 days, totals, a deposits against withdrawals chart and a daily table.
- **Audit logs.** `/admin/audit-logs`: filter by area, expand an entry to see the before and after values.
- **Settings.** Minimum withdrawal, days between withdrawals, withdrawal fee, maintenance mode, plus recent daily earnings runs with a Run now button.

## Suspending a user
`POST /api/admin/users/:id/suspend` with a reason. The database sets the account to `suspended`, which blocks package purchases and withdrawals immediately, writes an audit log and tells the member. The service also bans the member from signing in. A member who is already signed in may keep browsing until their session token expires (about an hour), but cannot move money. You cannot suspend yourself, and only a super admin can suspend another admin.

## API added in this step
| Method and path | Roles |
| --- | --- |
| GET `/api/admin/overview` | all admins |
| GET `/api/admin/analytics` | super_admin, admin, finance |
| GET `/api/admin/users`, `/api/admin/users/:id`, `/api/admin/users/:id/transactions` | super_admin, admin, support |
| POST `/api/admin/users/:id/suspend`, `/reactivate` | super_admin, admin |
| GET `/api/admin/audit-logs` | super_admin, admin |
| GET, PATCH `/api/admin/settings` | super_admin, admin |

Packages, withdrawals, wallet adjustments and earnings runs use the routes from earlier steps.

## Database (`0015_admin_dashboard.sql`)
`admin_set_user_status`, `admin_search_users`, `admin_user_detail`, `admin_user_transactions`, `admin_overview`, `admin_financials`, `admin_audit_logs`, and an updated `admin_update_setting` that also accepts `maintenance_mode`. All are service role only.

## Test it
1. Make yourself `super_admin`: `update admin_users set role = 'super_admin' where user_id = '<your auth id>';`
2. Visit `/admin`. Search for a member, open them, view transactions.
3. Suspend the member with a reason. Their purchase and withdrawal calls now fail with `ACCOUNT_RESTRICTED`. Reactivate.
4. Request a withdrawal as a member, then approve and mark it paid from `/admin/withdrawals`.
5. Check `/admin/audit-logs` for `user.suspended`, `withdrawal.approved` and `withdrawal.paid`.
