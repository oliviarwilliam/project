import { Card, EmptyState, PageHeader, cx } from "@/components/dashboard/ui";
import { MarkAllRead } from "@/components/dashboard/mark-all-read";
import { getNotifications } from "@/lib/dashboard/queries";
import { timeAgo } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const items = await getNotifications(await createClient());
  const unread = items.filter((n) => !n.read_at).length;

  return (
    <>
      <PageHeader
        title="Notifications"
        subtitle={unread > 0 ? `${unread} unread` : "You are all caught up."}
        action={unread > 0 ? <MarkAllRead /> : undefined}
      />
      {items.length === 0 ? (
        <EmptyState icon="bell" title="No notifications" text="Updates about deposits, payouts and withdrawals will show up here." />
      ) : (
        <Card className="p-0">
          <ul className="divide-y divide-line">
            {items.map((n) => (
              <li key={n.id} className={cx("flex gap-3 p-4", !n.read_at && "bg-brand/5")}>
                <span className={cx("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.read_at ? "bg-transparent" : "bg-brand")} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-sm font-semibold">{n.title}</p>
                    <time dateTime={n.created_at} className="shrink-0 text-xs text-muted">{timeAgo(n.created_at)}</time>
                  </div>
                  {n.body && <p className="mt-0.5 text-sm text-muted">{n.body}</p>}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
