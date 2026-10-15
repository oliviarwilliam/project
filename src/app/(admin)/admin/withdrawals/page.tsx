import Link from "next/link";
import { WithdrawalActions } from "@/components/admin/withdrawal-actions";
import { Card, EmptyState, PageHeader, StatusBadge, cx } from "@/components/dashboard/ui";
import { FINANCE_ROLES } from "@/lib/admin-roles";
import { requireAdminPage } from "@/lib/admin";
import { money, shortDate } from "@/lib/format";
import { href } from "@/lib/query-string";
import * as transferService from "@/services/transfers";
import type { TransferRow } from "@/services/transfers";
import * as withdrawalService from "@/services/withdrawals";

export const metadata = { title: "Admin: Withdrawals" };

const TABS = [
  ["pending", "To review"],
  ["approved", "To pay"],
  ["processing", "Sending"],
  ["paid", "Paid"],
  ["rejected", "Rejected"],
] as const;

const FIELD: Record<string, string> = { bank_name: "Bank", account_number: "Account number", account_name: "Account name" };

export default async function AdminWithdrawalsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireAdminPage(FINANCE_ROLES);
  const { status = "pending" } = await searchParams;

  const items = await withdrawalService.adminList(status, 50).catch(() => null);
  const latest = items ? await transferService.latestTransfers(items.map((w) => w.id)).catch(() => new Map<string, TransferRow>()) : new Map<string, TransferRow>();
  const chip = (active: boolean) => cx("whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-medium", active ? "border-brand bg-brand text-brand-fg" : "border-line text-muted hover:text-ink");

  return (
    <>
      <PageHeader title="Withdrawals" subtitle="Approve or reject requests, then mark them paid once the money is sent." />

      <div className="-mx-1 mb-5 flex gap-2 overflow-x-auto px-1 pb-1">
        {TABS.map(([value, label]) => <Link key={value} href={href("/admin/withdrawals", { status: value })} className={chip(status === value)}>{label}</Link>)}
      </div>

      {!items ? (
        <EmptyState icon="out" title="Could not load withdrawals" text="Try again in a moment." href="/admin/withdrawals" cta="Reload" />
      ) : items.length === 0 ? (
        <EmptyState icon="clock" title="Nothing here" text={status === "pending" ? "No requests are waiting for review." : "No withdrawals with this status."} />
      ) : (
        <div className="space-y-3">
          {items.map((w) => (
            <Card key={w.id} className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-start">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-xl font-bold tabular-nums">{money(w.amount, w.currency)}</p>
                  <StatusBadge status={w.status} />
                </div>
                <p className="mt-1 text-sm text-muted">Fee {money(w.fee, w.currency)} · member receives {money(w.netAmount, w.currency)}</p>
                <Link href={`/admin/users/${w.userId}`} className="mt-2 block truncate text-sm font-medium text-brand">{w.userEmail ?? "View member"}</Link>
                <p className="text-xs text-muted">Requested {shortDate(w.createdAt)}</p>
                {latest.get(w.id) && <p className="mt-2 text-xs text-muted">{transferNote(latest.get(w.id) as TransferRow)}</p>}
              </div>

              <dl className="space-y-1 text-sm">
                {Object.entries(w.destination).map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3"><dt className="text-muted">{FIELD[k] ?? k}</dt><dd className="text-right font-medium tabular-nums">{String(v)}</dd></div>
                ))}
                {w.rejectionReason && <p className="pt-1 text-red-600 dark:text-red-400">Rejected: {w.rejectionReason}</p>}
                {w.externalReference && <p className="pt-1 text-muted">Reference: {w.externalReference}</p>}
              </dl>

              <WithdrawalActions id={w.id} status={w.status} />
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

// One line about the newest bank transfer attempt.
function transferNote(t: TransferRow): string {
  const when = (iso: string) => new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
  if (t.status === "success") return `Bank transfer completed (attempt ${t.attempt}).`;
  if (t.status === "queued" || t.status === "pending") return `Bank transfer in progress (attempt ${t.attempt}).`;
  const next = t.retryable && t.retry_after ? ` Next automatic try ${when(t.retry_after)}.` : " Needs an admin: send again, pay manually, or reject.";
  return `Bank transfer ${t.status} (attempt ${t.attempt}): ${t.failure_reason ?? "no reason given"}.${next}`;
}
