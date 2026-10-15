import { RunEarningsButton } from "@/components/admin/run-earnings-button";
import { SettingsForm } from "@/components/admin/settings-form";
import { Card, EmptyState, PageHeader, StatusBadge } from "@/components/dashboard/ui";
import { MANAGE_ROLES } from "@/lib/admin-roles";
import { requireAdminPage } from "@/lib/admin";
import { money, timeAgo } from "@/lib/format";
import * as earnings from "@/services/earnings";
import * as withdrawalService from "@/services/withdrawals";

export const metadata = { title: "Admin: Settings" };

export default async function AdminSettingsPage() {
  await requireAdminPage(MANAGE_ROLES);
  const [settings, runs] = await Promise.all([withdrawalService.getSettings(), earnings.listRuns(5)]);

  return (
    <>
      <PageHeader title="Settings" subtitle="Rules that apply to every member. Each change is saved in the audit log." />

      <Card>
        <h2 className="mb-4 font-semibold">Platform rules</h2>
        <SettingsForm initial={settings} />
      </Card>

      <Card className="mt-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Daily earnings</h2>
            <p className="text-sm text-muted">Profit is credited automatically every day. You can run it by hand, it never pays a day twice.</p>
          </div>
          <RunEarningsButton />
        </div>
        {runs.length === 0 ? (
          <EmptyState icon="clock" title="No runs yet" text="The first scheduled run will appear here." />
        ) : (
          <ul className="divide-y divide-line">
            {runs.map((r: Record<string, any>) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                <div>
                  <p className="font-medium">{timeAgo(r.started_at)} <span className="text-muted">({r.trigger})</span></p>
                  <p className="text-xs text-muted">{r.credited} credited, {r.failed} failed, {r.completed} packages finished · {money(Number(r.total_amount))}</p>
                </div>
                <StatusBadge status={r.status} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
