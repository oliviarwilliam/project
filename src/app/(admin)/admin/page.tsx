import Link from "next/link";
import { Card, EmptyState, PageHeader, StatCard, StatusBadge, cx } from "@/components/dashboard/ui";
import { ALL_ADMIN_ROLES, FINANCE_ROLES, MANAGE_ROLES } from "@/lib/admin-roles";
import { requireAdminPage } from "@/lib/admin";
import { money, shortDate, timeAgo } from "@/lib/format";
import { href } from "@/lib/query-string";
import * as adminService from "@/services/admin";
import * as withdrawalService from "@/services/withdrawals";

export const metadata = { title: "Admin: Overview" };

export default async function AdminOverviewPage({ searchParams }: { searchParams: Promise<{ currency?: string }> }) {
  const admin = await requireAdminPage(ALL_ADMIN_ROLES);
  const { currency } = await searchParams;

  const o = await adminService.overview(currency).catch(() => adminService.overview());
  const canSeeMoney = FINANCE_ROLES.includes(admin.role);
  const [queue, recent] = await Promise.all([
    canSeeMoney ? withdrawalService.adminList("pending", 5) : Promise.resolve([]),
    MANAGE_ROLES.includes(admin.role) ? adminService.auditLogs({ limit: 5 }) : Promise.resolve(null),
  ]);

  const c = o.currency;
  const chip = (active: boolean) => cx("rounded-full border px-3 py-1 text-sm font-medium", active ? "border-brand bg-brand text-brand-fg" : "border-line text-muted hover:text-ink");

  return (
    <>
      <PageHeader
        title="Overview"
        subtitle={canSeeMoney ? `Money figures are in ${c}.` : undefined}
        action={canSeeMoney && o.currencies.length > 1 ? (
          <div className="flex gap-2">{o.currencies.map((x) => <Link key={x} href={href("/admin", { currency: x })} className={chip(x === c)}>{x}</Link>)}</div>
        ) : undefined}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard icon="users" label="Total users" value={String(o.users.total)} hint={`${o.users.active} active, ${o.users.suspended} suspended`} />
        <StatCard icon="trend" label="New this week" value={String(o.users.new_7d)} />
        {canSeeMoney && (
          <>
            <StatCard icon="wallet" label="Money in wallets" value={money(o.wallet_balance, c)} />
            <StatCard icon="box" label="Active packages" value={String(o.packages.active)} hint={`${money(o.packages.invested, c)} invested`} />
            <StatCard icon="clock" label="Awaiting review" value={String(o.withdrawals.pending_count)} hint={`${money(o.withdrawals.pending_amount, c)} requested`} />
            <StatCard icon="out" label="Approved, not yet paid" value={String(o.withdrawals.approved_count)} hint={`${money(o.withdrawals.approved_amount, c)} to send`} />
            <StatCard icon="in" label="Deposits, 30 days" value={money(o.flows_30d.deposits, c)} />
            <StatCard icon="out" label="Withdrawals, 30 days" value={money(o.flows_30d.withdrawals, c)} />
            <StatCard icon="trend" label="Profit paid, 30 days" value={money(o.flows_30d.profit, c)} />
          </>
        )}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {canSeeMoney && (
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">Withdrawals to review</h2>
              <Link href="/admin/withdrawals" className="text-sm font-medium text-brand">Open queue</Link>
            </div>
            {queue.length === 0 ? (
              <EmptyState icon="clock" title="Nothing waiting" text="New requests will show up here." />
            ) : (
              <ul className="divide-y divide-line">
                {queue.map((w) => (
                  <li key={w.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{w.userEmail ?? "Member"}</p>
                      <p className="text-xs text-muted">{shortDate(w.createdAt)}</p>
                    </div>
                    <p className="text-sm font-semibold tabular-nums">{money(w.amount, w.currency)}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        {recent && (
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">Recent activity</h2>
              <Link href="/admin/audit-logs" className="text-sm font-medium text-brand">Audit logs</Link>
            </div>
            {recent.items.length === 0 ? (
              <EmptyState icon="shield" title="No activity yet" text="Actions will be recorded here." />
            ) : (
              <ul className="divide-y divide-line">
                {recent.items.map((e) => (
                  <li key={e.id} className="py-3">
                    <p className="text-sm font-semibold">{e.action}</p>
                    <p className="truncate text-xs text-muted">{e.actorLabel} · {timeAgo(e.createdAt)}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
      </div>
    </>
  );
}
