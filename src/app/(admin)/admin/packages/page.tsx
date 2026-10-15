import Link from "next/link";
import { PackageRowActions } from "@/components/admin/package-row-actions";
import { Card, EmptyState, PageHeader, StatusBadge } from "@/components/dashboard/ui";
import { requireAdminPage } from "@/lib/admin";
import { money } from "@/lib/format";
import { STATUS_LABEL } from "@/lib/packages";
import * as packages from "@/services/packages";

export const metadata = { title: "Admin: Packages" };

export default async function AdminPackagesPage() {
  await requireAdminPage();
  const items = await packages.adminList();
  const live = items.filter((p) => p.status === "active").length;

  return (
    <>
      <PageHeader
        title="Packages"
        subtitle={`${live} active of ${items.length}`}
        action={<Link href="/admin/packages/new" className="btn btn-primary">New package</Link>}
      />

      {items.length === 0 ? (
        <EmptyState icon="box" title="No packages yet" text="Create your first package to let members start earning." href="/admin/packages/new" cta="Create package" />
      ) : (
        <div className="space-y-3">
          {items.map((p) => (
            <Card key={p.id} className="grid gap-4 md:grid-cols-[1.1fr_2fr_auto] md:items-center">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="truncate font-semibold">{p.name}</h2>
                  <StatusBadge status={p.status} label={STATUS_LABEL[p.status]} />
                </div>
                <p className="mt-1 truncate text-sm text-muted">{p.description ?? "No description"}</p>
              </div>

              <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <div><dt className="text-xs text-muted">Amount</dt><dd className="font-semibold tabular-nums">{money(p.price, p.currency)}</dd></div>
                <div><dt className="text-xs text-muted">Daily profit</dt><dd className="font-semibold tabular-nums">{money(p.dailyProfitAmount, p.currency)} <span className="font-normal text-muted">({p.dailyProfitPercent}%)</span></dd></div>
                <div><dt className="text-xs text-muted">Duration</dt><dd className="font-semibold">{p.durationDays} days</dd></div>
                <div><dt className="text-xs text-muted">Active owners</dt><dd className="font-semibold tabular-nums">{p.activeSubscribers}</dd></div>
              </dl>

              <PackageRowActions id={p.id} name={p.name} status={p.status} subscribers={p.activeSubscribers} />
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
