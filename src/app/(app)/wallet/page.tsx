import Link from "next/link";
import { Card, EmptyState, PageHeader, cx } from "@/components/dashboard/ui";
import { TXN_LABELS, TransactionList } from "@/components/dashboard/transaction-list";
import { FundWalletCard } from "@/components/dashboard/fund-wallet-card";
import { money } from "@/lib/format";
import { fundingConfig } from "@/lib/payments/config";
import { createClient } from "@/lib/supabase/server";
import * as wallets from "@/services/wallet";

export const metadata = { title: "Wallet" };

type Props = { searchParams: Promise<{ type?: string; cursor?: string }> };

export default async function WalletPage({ searchParams }: Props) {
  const { type, cursor } = await searchParams;
  const db = await createClient();

  const overview = await wallets.getOverview(db).catch(() => null);
  if (!overview) {
    return (
      <>
        <PageHeader title="Wallet" />
        <EmptyState icon="wallet" title="Wallet not ready" text="We could not load your wallet. Try again in a moment." />
      </>
    );
  }

  const { wallet, summary } = overview;
  const page = await wallets
    .listTransactions(db, { type, cursor, limit: 15 })
    .catch(() => ({ items: [], nextCursor: null }));

  const chip = (active: boolean) =>
    cx("whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-medium", active ? "border-brand bg-brand text-brand-fg" : "border-line text-muted hover:text-ink");
  const nextParams = new URLSearchParams({ ...(type ? { type } : {}), ...(page.nextCursor ? { cursor: page.nextCursor } : {}) });
  const totals: [string, number][] = [
    ["Deposits", summary.by_type["deposit:credit"] ?? 0],
    ["Profit", summary.by_type["earning:credit"] ?? 0],
    ["Withdrawn", summary.by_type["withdrawal:debit"] ?? 0],
  ];

  const funding = fundingConfig(wallet.currency);

  return (
    <>
      <PageHeader title="Wallet"/>

      <section className="rounded-2xl bg-brand p-6 text-brand-fg sm:p-8">
        <p className="text-sm opacity-80">Available balance</p>
        <p className="mt-1 text-4xl font-bold tabular-nums tracking-tight sm:text-5xl">{money(wallet.balance, wallet.currency)}</p>
        <div className="mt-6 grid grid-cols-3 gap-3 text-sm">
          {totals.map(([label, value]) => (
            <div key={label}>
              <p className="opacity-70">{label}</p>
              <p className="font-semibold tabular-nums">{money(value, wallet.currency)}</p>
            </div>
          ))}
        </div>
        <Link href="/withdrawals" className="btn mt-6 bg-brand-fg text-brand hover:opacity-90">Withdraw</Link>
      </section>

      {funding && <FundWalletCard currency={wallet.currency} {...funding} />}

      <Card className="mt-6">
        <h2 className="font-semibold">Transaction history</h2>
        <div className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-2">
          <Link href="/wallet" className={chip(!type)}>All</Link>
          {Object.entries(TXN_LABELS).map(([key, label]) => (
            <Link key={key} href={`/wallet?type=${key}`} className={chip(type === key)}>{label}</Link>
          ))}
        </div>
        <TransactionList items={page.items} currency={wallet.currency} />
        {page.nextCursor && (
          <div className="mt-4 text-center">
            <Link href={`/wallet?${nextParams}`} className="btn btn-ghost border border-line">Older transactions</Link>
          </div>
        )}
      </Card>
    </>
  );
}
