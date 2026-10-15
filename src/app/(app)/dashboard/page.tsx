import Link from "next/link";
import { Card, EmptyState, PageHeader, StatCard, StatusBadge } from "@/components/dashboard/ui";
import { TransactionList } from "@/components/dashboard/transaction-list";
import { PENDING_STATUSES, getUserPackages, getWithdrawals } from "@/lib/dashboard/queries";
import { money, shortDate } from "@/lib/format";
import { getProfile } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import * as wallets from "@/services/wallet";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const db = await createClient();
  const { data } = await db.auth.getUser();
  const userId = data.user?.id ?? "";

  const [profile, overview, packages, withdrawals, recent] = await Promise.all([
    getProfile(db, userId),
    wallets.getOverview(db).catch(() => null),
    getUserPackages(db),
    getWithdrawals(db),
    wallets.listTransactions(db, { limit: 5 }).catch(() => ({ items: [], nextCursor: null })),
  ]);

  const currency = overview?.wallet.currency ?? "NGN";
  const by = overview?.summary.by_type ?? {};
  const active = packages.filter((p) => p.status === "active");
  const pending = withdrawals.filter((w) => PENDING_STATUSES.includes(w.status));
  const firstName = profile?.fullName?.split(" ")[0];

  return (
    <>
      <PageHeader title={firstName ? `Hi, ${firstName}` : "Dashboard"} subtitle="Here is how your money is doing." />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard icon="wallet" label="Wallet balance" value={money(overview?.wallet.balance ?? 0, currency)} hint="Available now" />
        <StatCard icon="trend" label="Profit balance" value={money(by["earning:credit"] ?? 0, currency)} hint="Total profit credited" />
        <StatCard icon="box" label="Active packages" value={String(active.length)} hint={`${money(active.reduce((s, p) => s + p.amount, 0), currency)} invested`} />
        <StatCard icon="clock" label="Pending withdrawals" value={String(pending.length)} hint={`${money(pending.reduce((s, w) => s + w.amount, 0), currency)} in review`} />
        <StatCard icon="in" label="Total deposits" value={money(by["deposit:credit"] ?? 0, currency)} />
        <StatCard icon="out" label="Total withdrawals" value={money(by["withdrawal:debit"] ?? 0, currency)} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold">Recent activity</h2>
            <Link href="/wallet" className="text-sm font-medium text-brand">See all</Link>
          </div>
          <TransactionList items={recent.items} currency={currency} />
        </Card>

        <Card className="lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold">Active packages</h2>
            <Link href="/packages" className="text-sm font-medium text-brand">Browse</Link>
          </div>
          {active.length === 0 ? (
            <EmptyState icon="box" title="No active packages" text="Pick a package to start earning." href="/packages" cta="View packages" />
          ) : (
            <ul className="space-y-3">
              {active.slice(0, 4).map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 rounded-xl bg-line/40 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{p.name}</p>
                    <p className="text-xs text-muted">{p.next_payout_at ? `Next payout ${shortDate(p.next_payout_at)}` : "Final payout done"}</p>
                  </div>
                  <StatusBadge status={p.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
