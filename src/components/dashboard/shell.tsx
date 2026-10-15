"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cx, Icon, type IconName } from "./ui";

const NAV: { href: string; label: string; short: string; icon: IconName }[] = [
  { href: "/dashboard", label: "Dashboard", short: "Home", icon: "home" },
  { href: "/packages", label: "Packages", short: "Packages", icon: "box" },
  { href: "/wallet", label: "Wallet", short: "Wallet", icon: "wallet" },
  { href: "/withdrawals", label: "Withdrawals", short: "Withdraw", icon: "out" },
  { href: "/referrals", label: "Referrals", short: "Refer", icon: "users" },
  { href: "/profile", label: "Profile", short: "Profile", icon: "user" },
  { href: "/notifications", label: "Notifications", short: "Alerts", icon: "bell" },
];

export function Shell({ unread, children }: { unread: number; children: ReactNode }) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const badge = (href: string) =>
    href === "/notifications" && unread > 0 ? (
      <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-brand px-1 text-[11px] font-bold text-brand-fg">
        {unread > 9 ? "9+" : unread}
      </span>
    ) : null;

  return (
    <div className="container-page flex gap-8 py-6 lg:py-8">
      <aside className="hidden w-56 shrink-0 lg:block">
        <nav aria-label="Account" className="sticky top-24 space-y-1">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? "page" : undefined}
              className={cx(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                isActive(item.href) ? "bg-brand/10 text-brand" : "text-muted hover:bg-line/50 hover:text-ink",
              )}
            >
              <Icon name={item.icon} />
              {item.label}
              {badge(item.href)}
            </Link>
          ))}
        </nav>
      </aside>

      <div className="min-w-0 flex-1 pb-24 lg:pb-0">{children}</div>

      <nav aria-label="Account" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-7 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive(item.href) ? "page" : undefined}
            className={cx("relative flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium", isActive(item.href) ? "text-brand" : "text-muted")}
          >
            <Icon name={item.icon} className="h-5 w-5" />
            {item.short}
            {item.href === "/notifications" && unread > 0 && <span className="absolute right-1/4 top-1.5 h-2 w-2 rounded-full bg-brand" />}
          </Link>
        ))}
      </nav>
    </div>
  );
}
