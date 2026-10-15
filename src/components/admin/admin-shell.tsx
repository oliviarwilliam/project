"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cx, Icon, type IconName } from "@/components/dashboard/ui";
import { ALL_ADMIN_ROLES, FINANCE_ROLES, MANAGE_ROLES, USER_ROLES, type AdminRole } from "@/lib/admin-roles";

const NAV: { href: string; label: string; icon: IconName; roles: readonly AdminRole[]; exact?: boolean }[] = [
  { href: "/admin", label: "Overview", icon: "home", roles: ALL_ADMIN_ROLES, exact: true },
  { href: "/admin/users", label: "Users", icon: "users", roles: USER_ROLES },
  { href: "/admin/packages", label: "Packages", icon: "box", roles: MANAGE_ROLES },
  { href: "/admin/withdrawals", label: "Withdrawals", icon: "out", roles: FINANCE_ROLES },
  { href: "/admin/analytics", label: "Analytics", icon: "trend", roles: FINANCE_ROLES },
  { href: "/admin/audit-logs", label: "Audit logs", icon: "shield", roles: MANAGE_ROLES },
  { href: "/admin/settings", label: "Settings", icon: "gear", roles: MANAGE_ROLES },
];

export function AdminShell({ role, children }: { role: AdminRole; children: ReactNode }) {
  const pathname = usePathname();
  const items = NAV.filter((item) => item.roles.includes(role));
  const active = (item: (typeof NAV)[number]) => (item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`));

  return (
    <div className="container-page py-6 lg:py-8">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold tracking-tight">Admin console</h1>
          <span className="rounded-full bg-brand/10 px-2.5 py-0.5 text-xs font-semibold capitalize text-brand">{role.replace("_", " ")}</span>
        </div>
        <Link href="/dashboard" className="text-sm font-medium text-muted hover:text-ink">Member view</Link>
      </div>

      <div className="lg:flex lg:gap-8">
        <nav aria-label="Admin" className="-mx-4 mb-6 flex gap-1 overflow-x-auto px-4 pb-1 lg:sticky lg:top-24 lg:mx-0 lg:mb-0 lg:block lg:w-52 lg:shrink-0 lg:space-y-1 lg:self-start lg:overflow-visible lg:px-0">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active(item) ? "page" : undefined}
              className={cx(
                "flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                active(item) ? "bg-brand/10 text-brand" : "text-muted hover:bg-line/50 hover:text-ink",
              )}
            >
              <Icon name={item.icon} className="h-4 w-4" />
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
