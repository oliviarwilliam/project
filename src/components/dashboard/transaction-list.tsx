import type { WalletTransaction } from "@/services/wallet";
import { money, timeAgo } from "@/lib/format";
import { EmptyState, Icon } from "./ui";

export const TXN_LABELS = {
  deposit: "Deposit",
  package_purchase: "Package purchase",
  withdrawal: "Withdrawal",
  earning: "Profit credit",
  adjustment: "Adjustment",
  refund: "Refund",
} as const;

export function TransactionList({ items, currency }: { items: WalletTransaction[]; currency: string }) {
  if (items.length === 0) {
    return <EmptyState icon="wallet" title="No transactions yet" text="Deposits, purchases and profit credits will show up here." />;
  }

  return (
    <ul className="divide-y divide-line">
      {items.map((t) => {
        const credit = t.direction === "credit";
        return (
          <li key={t.id} className="flex items-center gap-3 py-3">
            <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${credit ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300" : "bg-line/60 text-muted"}`}>
              <Icon name={credit ? "in" : "out"} className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{t.metadata.source === "referral" ? "Referral reward" : TXN_LABELS[t.type]}</p>
              <p className="truncate text-xs text-muted">{t.description ?? "No note"} · {timeAgo(t.created_at)}</p>
            </div>
            <div className="text-right">
              <p className={`text-sm font-semibold tabular-nums ${credit ? "text-emerald-600 dark:text-emerald-300" : ""}`}>
                {credit ? "+" : "-"}{money(t.amount, currency)}
              </p>
              <p className="text-xs tabular-nums text-muted">Bal {money(t.balance_after, currency)}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
