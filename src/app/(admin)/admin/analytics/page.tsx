import Link from "next/link";
import { FlowChart } from "@/components/admin/flow-chart";
import { Card, EmptyState, PageHeader, StatCard, cx } from "@/components/dashboard/ui";
import { FINANCE_ROLES } from "@/lib/admin-roles";
import { requireAdminPage } from "@/lib/admin";
import { money, shortDate } from "@/lib/format";
import { href } from "@/lib/query-string";
import * as adminService from "@/services/admin";

export const metadata = { title: "Admin: Analytics" };

const RANGES = [7, 30, 90];

export default async function AdminAnalyticsPage({ searchParams }: { searchParams: Promise<{ days?: string; currency?: string }> }) {
  await requireAdminPage(FINANCE_ROLES);
  const { days = "30", currency } = await searchParams;

  const [data, o] = await Promise.all([
    adminService.financials(days, currency).catch(() => adminService.financials(30)),
    adminService.overview(currency).catch(() => adminService.overview()),
  ]);
  const c = data.currency;
  const chip = (active: boolean) => cx("rounded-full border px-3 py-1 text-sm font-medium", active ? "border-brand bg-brand text-brand-fg" : "border-line text-muted hover:text-ink");

  return (
    <>
      <PageHeader title="Financial analytics" subtitle={`Last ${data.days} days in ${c}`} />

      <div className="mb-5 flex flex-wrap gap-2">
        {RANGES.map((r) => <Link key={r} href={href("/admin/analytics", { days: r, currency: c })} className={chip(data.days === r)}>{r} days</Link>)}
        {o.currencies.length > 1 && <span className="mx-1 w-px bg-line" />}
        {o.currencies.length > 1 && o.currencies.map((x) => <Link key={x} href={href("/admin/analytics", { days: data.days, currency: x })} className={chip(x === c)}>{x}</Link>)}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard icon="in" label="Deposits" value={money(data.totals.deposits, c)} />
        <StatCard icon="out" label="Withdrawals" value={money(data.totals.withdrawals, c)} hint={`${money(data.totals.refunds, c)} refunded`} />
        <StatCard icon="trend" label="Net flow" value={money(data.totals.net, c)} hint="Deposits minus withdrawals, after refunds" />
        <StatCard icon="box" label="Package purchases" value={money(data.totals.purchases, c)} />
        <StatCard icon="trend" label="Profit paid out" value={money(data.totals.profit, c)} />
        <StatCard icon="wallet" label="Money in wallets now" value={money(o.wallet_balance, c)} />
      </div>

      <Card className="mt-6">
        <h2 className="mb-3 font-semibold">Deposits and withdrawals by day</h2>
        {data.totals.deposits === 0 && data.totals.withdrawals === 0 ? (
          <EmptyState icon="trend" title="No activity in this period" text="Deposits and withdrawals will be charted here." />
        ) : (
          <FlowChart series={data.series} currency={c} />
        )}
      </Card>

      <Card className="mt-6 p-0">
        <details>
          <summary className="cursor-pointer p-5 font-semibold">Daily figures</summary>
          <div className="overflow-x-auto border-t border-line">
            <table className="w-full min-w-[34rem] text-sm tabular-nums">
              <thead className="text-left text-xs text-muted"><tr><th className="p-3">Day</th><th className="p-3 text-right">Deposits</th><th className="p-3 text-right">Withdrawals</th><th className="p-3 text-right">Purchases</th><th className="p-3 text-right">Profit</th></tr></thead>
              <tbody className="divide-y divide-line">
                {[...data.series].reverse().map((d) => (
                  <tr key={d.day}><td className="p-3">{shortDate(d.day)}</td><td className="p-3 text-right">{money(d.deposits, c)}</td><td className="p-3 text-right">{money(d.withdrawals, c)}</td><td className="p-3 text-right">{money(d.purchases, c)}</td><td className="p-3 text-right">{money(d.profit, c)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </Card>
    </>
  );
}
