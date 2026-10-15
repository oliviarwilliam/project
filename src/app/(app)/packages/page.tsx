import Link from "next/link";
import { Card, EmptyState, Icon, PageHeader, StatusBadge } from "@/components/dashboard/ui";
import { PurchaseButton } from "@/components/dashboard/purchase-button";
import { getCatalog, getUserPackages } from "@/lib/dashboard/queries";
import { money, shortDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import * as wallets from "@/services/wallet";

export const metadata = { title: "Packages" };

const accents = [
  { border: "border-sky-500/25", icon: "text-sky-700 dark:text-sky-200", tile: "bg-sky-300/20", wash: "from-sky-500/20 via-cyan-400/10 to-transparent", glow: "bg-sky-400/25", label: "text-sky-800 dark:text-sky-200" },
  { border: "border-violet-500/25", icon: "text-violet-700 dark:text-violet-200", tile: "bg-violet-300/20", wash: "from-violet-500/20 via-fuchsia-400/10 to-transparent", glow: "bg-violet-400/25", label: "text-violet-800 dark:text-violet-200" },
  { border: "border-amber-500/25", icon: "text-amber-700 dark:text-amber-200", tile: "bg-amber-300/25", wash: "from-amber-400/25 via-orange-300/10 to-transparent", glow: "bg-amber-400/25", label: "text-amber-800 dark:text-amber-200" },
];

export default async function PackagesPage() {
  const db = await createClient();
  const [catalog, mine, overview] = await Promise.all([
    getCatalog(db),
    getUserPackages(db),
    wallets.getOverview(db).catch(() => null),
  ]);
  const balance = overview?.wallet.balance ?? 0;
  const currency = overview?.wallet.currency ?? "NGN";

  return (
    <div className="space-y-10">
      <section className="relative isolate overflow-hidden rounded-3xl bg-gradient-to-br from-brand via-brand to-slate-950 px-6 py-7 text-brand-fg shadow-lg shadow-brand/10 sm:px-8 sm:py-9">
        <div aria-hidden="true" className="absolute -right-12 -top-24 -z-10 h-72 w-72 rounded-full border-[36px] border-white/10" />
        <div aria-hidden="true" className="absolute bottom-0 right-28 -z-10 h-28 w-28 rounded-full bg-white/5 blur-2xl" />
        <div className="flex flex-col gap-7 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-xl">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/65">Build your future</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Choose your next step</h1>
          </div>
          <div className="flex items-center justify-between gap-5 rounded-2xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur sm:min-w-56">
            <div>
              <p className="text-xs font-medium text-white/70">Available balance</p>
              <p className="mt-1 text-xl font-bold tabular-nums">{money(balance, currency)}</p>
            </div>
            <Link href="/wallet" aria-label="Go to wallet" className="grid h-10 w-10 place-items-center rounded-xl bg-white/15 transition hover:bg-white/25">
              <Icon name="wallet" className="h-5 w-5" />
            </Link>
          </div>
        </div>
      </section>

      <section>
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand">Available plans</p>
            <h2 className="mt-1 text-xl font-bold tracking-tight sm:text-2xl">Find the right fit</h2>
          </div>
          <p className="text-sm text-muted">{catalog.length} plan{catalog.length === 1 ? "" : "s"} available</p>
        </div>

        {catalog.length === 0 ? (
          <EmptyState icon="box" title="No packages right now" text="New packages will appear here. Check back soon." />
        ) : (
          <div className="grid items-stretch gap-5 md:grid-cols-2 2xl:grid-cols-3">
            {catalog.map((p, index) => {
              const accent = accents[index % accents.length]!;
              const payouts = Math.floor(p.duration_days / p.payout_interval_days);
              const expectedProfit = p.price * p.return_rate * payouts;
              const profitPerPayout = p.price * p.return_rate;
              const rate = (p.return_rate * 100).toFixed(2);
              const interval = p.payout_interval_days === 1 ? "daily" : `every ${p.payout_interval_days} days`;

              return (
                <article key={p.id} className={`group relative flex h-full flex-col overflow-hidden rounded-[1.75rem] border ${accent.border} bg-surface shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-brand/10`}>
                  <div className={`relative isolate overflow-hidden bg-gradient-to-br ${accent.wash} px-5 pb-5 pt-5 sm:px-6`}>
                    <div aria-hidden="true" className={`absolute -right-8 -top-12 -z-10 h-36 w-36 rounded-full ${accent.glow} blur-2xl transition-transform duration-500 group-hover:scale-125`} />
                    <div aria-hidden="true" className="absolute right-5 top-5 -z-10 h-20 w-20 rounded-full border border-current opacity-[0.08]" />
                    <div className="flex items-start justify-between gap-4">
                      <span className={`grid h-12 w-12 place-items-center rounded-2xl border border-white/60 ${accent.tile} ${accent.icon} shadow-sm`}>
                        <Icon name="trend" className="h-6 w-6" />
                      </span>
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-line/70 bg-surface/80 px-3 py-1.5 text-xs font-bold text-ink shadow-sm backdrop-blur">
                        <Icon name="clock" className={`h-3.5 w-3.5 ${accent.icon}`} /> {p.duration_days} days
                      </span>
                    </div>
                    <div className="mt-6">
                      <p className={`text-[10px] font-extrabold uppercase tracking-[0.2em] ${accent.label}`}>TeenVest plan</p>
                      <h3 className="mt-1.5 text-2xl font-extrabold tracking-tight sm:text-[1.7rem]">{p.name}</h3>
                      <p className="mt-2 line-clamp-2 min-h-10 max-w-md text-sm leading-5 text-muted">{p.description || "Plan details and payout schedule at a glance."}</p>
                    </div>
                  </div>

                  <div className="flex flex-1 flex-col px-5 pb-5 sm:px-6 sm:pb-6">
                    <div className="mt-1 flex items-end justify-between gap-3 border-b border-line pb-5">
                      <div>
                        <p className="text-xs font-semibold text-muted">Starting amount</p>
                        <p className="mt-1 text-3xl font-extrabold tabular-nums tracking-tight sm:text-4xl">{money(p.price, p.currency)}</p>
                      </div>
                      <span className="mb-1 rounded-lg bg-line/40 px-2.5 py-1 text-xs font-semibold text-muted">{payouts} payout{payouts === 1 ? "" : "s"}</span>
                    </div>

                    <div className="mt-4 divide-y divide-line rounded-2xl border border-line/80 bg-bg/60 px-4">
                      <div className="flex items-center justify-between gap-3 py-3">
                        <div><p className="text-xs text-muted">Per payout</p><p className="mt-0.5 font-bold tabular-nums">{money(profitPerPayout, p.currency)}</p></div>
                        <div className="text-right"><p className="text-xs text-muted">Rate</p><p className="mt-0.5 font-bold tabular-nums">{rate}% <span className="text-xs font-medium text-muted">{interval}</span></p></div>
                      </div>
                      <div className="flex items-center justify-between gap-3 py-3">
                        <p className="text-sm text-muted">Estimated profit over full term</p>
                        <p className="font-bold tabular-nums">{money(expectedProfit, p.currency)}</p>
                      </div>
                    </div>

                    <div className="mt-auto pt-5">
                      <PurchaseButton packageId={p.id} priceLabel={money(p.price, p.currency)} canAfford={balance >= p.price} />
                      {balance < p.price && <Link href="/wallet" className="mt-3 inline-flex w-full items-center justify-center gap-1.5 text-sm font-semibold text-brand hover:underline"><Icon name="wallet" className="h-4 w-4" /> Add funds to your wallet</Link>}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <div className="mb-5 flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand">Your portfolio</p>
            <h2 className="mt-1 text-xl font-bold tracking-tight sm:text-2xl">Your packages</h2>
          </div>
          <span className="rounded-full bg-line/50 px-3 py-1 text-xs font-semibold text-muted">{mine.length} owned</span>
        </div>
        {mine.length === 0 ? (
          <EmptyState icon="trend" title="Your portfolio starts here" text="Choose a package above and it will appear here with its progress and next payout." />
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {mine.map((p) => {
              const start = new Date(p.starts_at).getTime();
              const span = new Date(p.ends_at).getTime() - start;
              const pct = p.status === "completed" ? 100 : Math.min(100, Math.max(0, ((Date.now() - start) / span) * 100));
              const next = p.next_payout_at ? `Next payout ${shortDate(p.next_payout_at)}` : `Ended ${shortDate(p.ends_at)}`;
              return (
                <Card key={p.id} className="overflow-hidden p-0">
                  <div className="p-5 sm:p-6">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-brand/10 text-brand"><Icon name="trend" /></span>
                        <div className="min-w-0">
                          <h3 className="truncate font-bold">{p.name}</h3>
                          <p className="mt-0.5 text-sm text-muted">{money(p.amount, currency)} invested</p>
                        </div>
                      </div>
                      <StatusBadge status={p.status} />
                    </div>
                    <div className="mt-5 flex items-center justify-between text-xs font-medium">
                      <span className="text-muted">Plan progress</span>
                      <span className="tabular-nums">{Math.round(pct)}%</span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-line" role="progressbar" aria-label={`${p.name} progress`} aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
                      <div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${pct}%` }} />
                    </div>
                    <p className="mt-3 flex items-center gap-2 text-sm text-muted"><Icon name="clock" className="h-4 w-4" />{next}</p>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
