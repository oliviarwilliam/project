import Link from "next/link";
import { Card, EmptyState, PageHeader, cx } from "@/components/dashboard/ui";
import { MANAGE_ROLES } from "@/lib/admin-roles";
import { requireAdminPage } from "@/lib/admin";
import { timeAgo } from "@/lib/format";
import { href } from "@/lib/query-string";
import * as adminService from "@/services/admin";

export const metadata = { title: "Admin: Audit logs" };

const FILTERS = [
  ["", "All"], ["wallet.", "Wallet"], ["withdrawal.", "Withdrawals"], ["package.", "Packages"],
  ["user.", "Users"], ["payment.", "Payments"], ["earnings.", "Earnings"], ["setting.", "Settings"],
] as const;

export default async function AuditLogsPage({ searchParams }: { searchParams: Promise<{ action?: string; cursor?: string }> }) {
  await requireAdminPage(MANAGE_ROLES);
  const { action = "", cursor } = await searchParams;

  const page = await adminService.auditLogs({ action, cursor, limit: 25 }).catch(() => null);
  const chip = (active: boolean) => cx("whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-medium", active ? "border-brand bg-brand text-brand-fg" : "border-line text-muted hover:text-ink");

  return (
    <>
      <PageHeader title="Audit logs" subtitle="Every money movement and admin action, newest first. Entries cannot be edited or deleted." />

      <div className="-mx-1 mb-5 flex gap-2 overflow-x-auto px-1 pb-1">
        {FILTERS.map(([value, label]) => <Link key={label} href={href("/admin/audit-logs", { action: value })} className={chip(action === value)}>{label}</Link>)}
      </div>

      {!page ? (
        <EmptyState icon="shield" title="Could not load the logs" text="Try again in a moment." href="/admin/audit-logs" cta="Reload" />
      ) : page.items.length === 0 ? (
        <EmptyState icon="shield" title="No entries" text="Nothing matches this filter yet." />
      ) : (
        <Card className="p-0">
          <ul className="divide-y divide-line">
            {page.items.map((e) => (
              <li key={e.id}>
                <details className="group">
                  <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 p-4 hover:bg-line/30">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{e.action}</p>
                      <p className="truncate text-xs text-muted">{e.actorLabel} · {e.entityTable}</p>
                    </div>
                    <time dateTime={e.createdAt} className="text-xs text-muted">{timeAgo(e.createdAt)}</time>
                  </summary>
                  <div className="grid gap-3 border-t border-line bg-line/20 p-4 text-xs sm:grid-cols-2">
                    {([["Before", e.oldData], ["After", e.newData]] as const).map(([label, data]) => (
                      <div key={label}>
                        <p className="mb-1 font-semibold">{label}</p>
                        <pre className="overflow-x-auto rounded-lg bg-surface p-3">{data ? JSON.stringify(data, null, 2) : "None"}</pre>
                      </div>
                    ))}
                    {e.entityId && <p className="text-muted sm:col-span-2">Entity id: {e.entityId}</p>}
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {page?.nextCursor && (
        <div className="mt-6 text-center">
          <Link href={href("/admin/audit-logs", { action, cursor: page.nextCursor })} className="btn btn-ghost border border-line">Older entries</Link>
        </div>
      )}
    </>
  );
}
