import Link from "next/link";
import { Card, EmptyState, PageHeader, StatusBadge } from "@/components/dashboard/ui";
import { USER_ROLES } from "@/lib/admin-roles";
import { requireAdminPage } from "@/lib/admin";
import { money, shortDate } from "@/lib/format";
import { href } from "@/lib/query-string";
import * as adminService from "@/services/admin";

export const metadata = { title: "Admin: Users" };

type Props = { searchParams: Promise<{ q?: string; status?: string; page?: string }> };

export default async function AdminUsersPage({ searchParams }: Props) {
  await requireAdminPage(USER_ROLES);
  const { q = "", status = "", page = "1" } = await searchParams;

  const result = await adminService.searchUsers({ q, status, page }).catch(() => null);
  const totalPages = result ? Math.max(1, Math.ceil(result.total / result.pageSize)) : 1;

  return (
    <>
      <PageHeader title="Users" subtitle={result ? `${result.total} found` : undefined} />

      <form className="mb-5 flex flex-col gap-2 sm:flex-row" role="search">
        <input name="q" defaultValue={q} placeholder="Search by email, name or user id" aria-label="Search users" className="input flex-1" />
        <select name="status" defaultValue={status} aria-label="Status" className="input sm:w-44">
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="closed">Closed</option>
        </select>
        <button type="submit" className="btn btn-primary h-11 px-6">Search</button>
      </form>

      {!result ? (
        <EmptyState icon="users" title="Could not load users" text="Check your search and try again." href="/admin/users" cta="Reset" />
      ) : result.rows.length === 0 ? (
        <EmptyState icon="users" title="No users found" text="Try a different email, name or status." href="/admin/users" cta="Clear search" />
      ) : (
        <>
          <div className="space-y-3">
            {result.rows.map((u) => (
              <Link key={u.id} href={`/admin/users/${u.id}`} className="block">
                <Card className="grid gap-3 transition-colors hover:border-brand sm:grid-cols-[1.5fr_1fr_auto] sm:items-center">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-semibold">{u.full_name ?? u.email}</p>
                      <StatusBadge status={u.status} />
                      {u.is_admin && <span className="rounded-full bg-brand/10 px-2 py-0.5 text-xs font-semibold text-brand">Admin</span>}
                    </div>
                    <p className="truncate text-sm text-muted">{u.email}</p>
                  </div>
                  <p className="text-sm text-muted">Joined {shortDate(u.created_at)}<br />{u.active_packages} active package{u.active_packages === 1 ? "" : "s"}</p>
                  <p className="text-right text-sm font-semibold tabular-nums">{u.balance === null ? "No wallet" : money(Number(u.balance), u.currency ?? "NGN")}</p>
                </Card>
              </Link>
            ))}
          </div>

          {totalPages > 1 && (
            <nav aria-label="Pages" className="mt-6 flex items-center justify-between text-sm">
              {result.page > 1 ? <Link href={href("/admin/users", { q, status, page: result.page - 1 })} className="btn btn-ghost border border-line">Previous</Link> : <span />}
              <span className="text-muted">Page {result.page} of {totalPages}</span>
              {result.page < totalPages ? <Link href={href("/admin/users", { q, status, page: result.page + 1 })} className="btn btn-ghost border border-line">Next</Link> : <span />}
            </nav>
          )}
        </>
      )}
    </>
  );
}
