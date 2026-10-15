# Package system

## Model
A package pays a profit **every day**: `daily profit = amount x daily rate`. `packages.payout_interval_days` is 1 for these packages and `return_rate` holds the daily rate as a fraction (0.0025 = 0.25%). Admins type a percent; the database converts it.

| Field | Column | Notes |
| --- | --- | --- |
| Name | `name` | 2 to 40 characters, unique (case ignored). The slug is made from it once. |
| Amount | `price`, `currency` | Above 0. Currency cannot change after creation. |
| Daily Profit | `return_rate` | Percent per day, at most 2 decimals. Daily profit must be at least 0.01. |
| Duration | `duration_days` | 1 to 3650. Total profit = daily profit x duration. |
| Status | `status` | `draft` (hidden), `active` (buyable), `archived` (shown as Disabled). |

Extras: `description`, `max_per_user`, `sort_order` (blank puts it last).

Editing or disabling never touches existing purchases: `user_packages` stores the amount, rate and dates at purchase time.

## Database (`0011_packages_admin.sql`)
`admin_create_package`, `admin_update_package`, `admin_set_package_status` and `admin_delete_package` check that the caller is an active `admin` or `super_admin`, apply the change, and write an audit log with old and new values. Delete is a soft delete and is refused while members still own the package. The `package_stats` view adds `active_subscribers` and `total_invested`. Five starter tiers are seeded as drafts so you can review the numbers before enabling them.

## API
| Method and path | Who | Purpose |
| --- | --- | --- |
| GET `/api/packages` | Anyone | Active packages |
| GET `/api/admin/packages` | Admin | All live packages with owner counts |
| POST `/api/admin/packages` | Admin | Create |
| GET `/api/admin/packages/:id` | Admin | One package |
| PATCH `/api/admin/packages/:id` | Admin | Edit any field |
| POST `/api/admin/packages/:id/disable` | Admin | Stop new purchases |
| POST `/api/admin/packages/:id/enable` | Admin | Make it buyable again |
| DELETE `/api/admin/packages/:id` | Admin | Soft delete (only when nobody owns it) |

Body fields: `name`, `price`, `dailyProfitPercent`, `durationDays`, and optional `status`, `description`, `currency`, `maxPerUser`, `sortOrder`.

## Pages
- `/packages` (members): package cards and the member's own packages.
- `/admin/packages`: list with status, owners, Edit, Disable or Enable, Delete.
- `/admin/packages/new` and `/admin/packages/:id/edit`: form with a live preview of daily and total profit.

To make someone an admin, insert a row into `admin_users` with their auth user id and role `admin`.
