import Link from "next/link";
import { notFound } from "next/navigation";
import { AdjustWalletForm } from "@/components/admin/adjust-wallet-form";
import { UserStatusActions } from "@/components/admin/user-status-actions";
import { Card, PageHeader, StatusBadge, cx } from "@/components/dashboard/ui";
import { TXN_LABELS, TransactionList } from "@/components/dashboard/transaction-list";
import { FINANCE_ROLES, MANAGE_ROLES, USER_ROLES } from "@/lib/admin-roles";
import { requireAdminPage } from "@/lib/admin";
import { money, shortDate } from "@/lib/format";
import { href } from "@/lib/query-string";
import { createClient } from "@/lib/supabase/server";
import * as adminService from "@/services/admin";
import { WalletError } from "@/services/wallet";

export const metadata = { title: "Admin: User" };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ type?: string; cursor?: string }> };

export default async function AdminUserPage({ params, searchParams }: Props) {
  const admin = await requireAdminPage(USER_ROLES);
  const { id } = await params;
  const { type, cursor } = await searchParams;

  const detail = await adminService.userDetail(id).catch((e) => {
    if (e instanceof WalletError) return null; // bad id or no such user
    throw e;
  });
  if (!detail) notFound();

  const [{ data: me }, txns] = await Promise.all([
    (await createClient()).auth.getUser(),
    adminService.userTransactions(id, { type, cursor, limit: 15 }).catch(() => ({ items: [], nextCursor: null })),
  ]);

  const { user, wallets, totals } = detail;
  const currency = wallets[0]?.currency.trim() ?? "NGN";
  const isSelf = me.user?.id === user.id;
  const canManage = MANAGE_ROLES.includes(admin.role) && !isSelf;
  const chip = (active: boolean) => cx("whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-medium", active ? "border-brand bg-brand text-brand-fg" : "border-line text-muted hover:text-ink");
  const row = (label: string, value: string) => <div className="flex justify-between gap-4"><dt className="text-muted">{label}</dt><dd className="text-right font-medium">{value}</dd></div>;

  return (
    <>
      <PageHeader
        title={user.full_name ?? user.email}
        subtitle={user.email}
        action={<Link href="/admin/users" className="text-sm font-medium text-brand">Back to users</Link>}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6">
          <Card>
            <div className="mb-3 flex items-center gap-2">
              <h2 className="font-semibold">Profile</h2>
              <StatusBadge status={user.status} />
              {detail.is_admin && <span className="rounded-full bg-brand/10 px-2 py-0.5 text-xs font-semibold text-brand">Admin</span>}
            </div>
            <dl className="space-y-2 text-sm">
              {row("Joined", shortDate(user.created_at))}
              {row("Phone", user.phone ?? "Not set")}
              {row("Date of birth", user.date_of_birth ? shortDate(user.date_of_birth) : "Not set")}
              {row("Guardian consent", user.guardian_consent_at ? shortDate(user.guardian_consent_at) : "None")}
              {row("Bank", user.bank_name ? `${user.bank_name} •••• ${user.account_last4}` : "Not set")}
              {row("Active packages", String(detail.active_packages))}
            </dl>
            {canManage && <div className="mt-5 border-t border-line pt-5"><UserStatusActions userId={user.id} status={user.status} /></div>}
            {isSelf && <p className="mt-4 text-xs text-muted">This is your own account.</p>}
          </Card>

          <Card>
            <h2 className="mb-3 font-semibold">Wallet</h2>
            {wallets.length === 0 ? <p className="text-sm text-muted">No wallet.</p> : (
              <ul className="space-y-1 text-sm">
                {wallets.map((w) => <li key={w.id} className="flex justify-between"><span className="text-muted">{w.currency}</span><span className="font-semibold tabular-nums">{money(Number(w.balance), w.currency.trim())}</span></li>)}
              </ul>
            )}
            <dl className="mt-4 space-y-2 border-t border-line pt-4 text-sm">
              {row("Deposits", money(totals.deposits, currency))}
              {row("Package purchases", money(totals.purchases, currency))}
              {row("Profit earned", money(totals.profit, currency))}
              {row("Withdrawals", money(totals.withdrawals, currency))}
            </dl>
            {FINANCE_ROLES.includes(admin.role) && wallets[0] && (
              <div className="mt-5 border-t border-line pt-5">
                <h3 className="mb-2 text-sm font-semibold">Manual adjustment</h3>
                <AdjustWalletForm walletId={wallets[0].id} currency={currency} />
              </div>
            )}
          </Card>
        </div>

        <Card className="lg:col-span-2">
          <h2 className="font-semibold">Transactions</h2>
          <div className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-2">
            <Link href={`/admin/users/${id}`} className={chip(!type)}>All</Link>
            {Object.entries(TXN_LABELS).map(([key, label]) => (
              <Link key={key} href={href(`/admin/users/${id}`, { type: key })} className={chip(type === key)}>{label}</Link>
            ))}
          </div>
          <TransactionList items={txns.items} currency={currency} />
          {txns.nextCursor && (
            <div className="mt-4 text-center">
              <Link href={href(`/admin/users/${id}`, { type, cursor: txns.nextCursor })} className="btn btn-ghost border border-line">Older transactions</Link>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
