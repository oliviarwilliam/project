import Link from "next/link";
import { Card, EmptyState, PageHeader, StatusBadge } from "@/components/dashboard/ui";
import { WithdrawForm } from "@/components/dashboard/withdraw-form";
import { PENDING_STATUSES, getWithdrawals } from "@/lib/dashboard/queries";
import { money, shortDate } from "@/lib/format";
import { getProfile } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { getReferralSummary } from "@/services/referrals/referral.service";
import * as withdrawalService from "@/services/withdrawals";

export const metadata = { title: "Withdrawals" };

export default async function WithdrawalsPage() {
  const db = await createClient();
  const { data } = await db.auth.getUser();
  const userId = data.user?.id ?? "";

  const [profile, history, rules, referralSummary] = await Promise.all([
    getProfile(db, userId),
    getWithdrawals(db),
    withdrawalService.getEligibility(userId).catch(() => null),
    getReferralSummary(userId),
  ]);

  const currency = rules?.currency ?? "NGN";
  const inReview = history.filter((w) => PENDING_STATUSES.includes(w.status));
  const bank =
    profile?.bankName && profile.accountNumber && profile.accountName
      ? { bankName: profile.bankName, accountNumber: profile.accountNumber, accountName: profile.accountName }
      : null;

  return (
    <>
      <PageHeader title="Withdrawals" subtitle={`Withdrawable profit: ${money(rules?.available_profit ?? 0, currency)}`} />

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <h2 className="mb-1 font-semibold">Withdraw</h2>
          {rules && (
            <p className="mb-4 text-sm text-muted">
              Withdraw investment profit. 
            </p>
          )}
          {!bank ? (
            <EmptyState icon="user" title="Add your bank details" text="We need a bank account before we can send money to you." href="/profile" cta="Go to profile" />
          ) : !rules ? (
            <div role="status" className="rounded-xl bg-line/40 p-4 text-sm">
              We could not load your withdrawal details. Try again shortly.
            </div>
          ) : (
            <WithdrawForm currency={currency} feePercent={rules.fee_percent} fundingSource="profit" bank={bank} />
          )}
          {rules && (() => {
            const qualified = Math.max(0, rules.qualified_referrals);
            const required = Math.max(1, rules.required_referrals);
            const progress = Math.min(100, Math.round((qualified / required) * 100));
            const unlocked = qualified >= required;
            const rewardAmount = Number.isFinite(referralSummary.rewardAmount) ? referralSummary.rewardAmount : 1000;
            const referralRewardsBalance = Number.isFinite(rules.referral_rewards_balance) ? rules.referral_rewards_balance : 0;

            return (
              <section className="mt-5 rounded-2xl border border-line bg-surface p-4" aria-label="Referral progress">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">Referral progress</h3>
                    <p className="mt-1 text-sm text-muted">Earn {money(rewardAmount, currency)} for each funded referral.</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-brand/10 px-3 py-1 text-sm font-semibold tabular-nums text-brand">
                    {qualified}/{required}
                  </span>
                </div>
                <div
                  className="mt-4 h-2 overflow-hidden rounded-full bg-line"
                  role="progressbar"
                  aria-label="Funded referral progress"
                  aria-valuemin={0}
                  aria-valuemax={required}
                  aria-valuenow={Math.min(qualified, required)}
                >
                  <div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${progress}%` }} />
                </div>
                <p className="mt-3 text-sm text-muted">
                  Referral rewards: {money(referralRewardsBalance, currency)}
                  {unlocked ? " available to withdraw separately." : ` locked until ${required} funded referrals.`}
                </p>
                {rules.next_referral_eligible_at && (
                  <p className="mt-1 text-sm text-muted">Next referral withdrawal date: {shortDate(rules.next_referral_eligible_at)}</p>
                )}
                <Link href="/referrals" className="btn btn-secondary mt-4 w-full">Invite people</Link>
                {unlocked && bank && (
                  <div className="mt-5 border-t border-line pt-5">
                    <h4 className="mb-3 font-semibold">Withdraw referral rewards</h4>
                    <WithdrawForm currency={currency} feePercent={rules.fee_percent} fundingSource="referral" bank={bank} />
                  </div>
                )}
              </section>
            );
          })()}
          {inReview.length > 0 && (
            <p className="mt-4 text-sm text-muted">
              {inReview.length} in review, {money(inReview.reduce((s, w) => s + w.amount, 0), currency)} in total.
            </p>
          )}
        </Card>

        <Card className="lg:col-span-3">
          <h2 className="mb-2 font-semibold">History</h2>
          {history.length === 0 ? (
            <EmptyState icon="out" title="No withdrawals yet" text="Your requests and their status will appear here." />
          ) : (
            <ul className="divide-y divide-line">
              {history.map((w) => (
                <li key={w.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold tabular-nums">{money(w.amount, currency)}</p>
                    <p className="truncate text-xs text-muted">
                      {shortDate(w.created_at)} · {w.method} · {w.funding_source === "referral" ? "Referral rewards" : "Profit"}
                      {w.rejection_reason ? ` · ${w.rejection_reason}` : ""}
                    </p>
                  </div>
                  <StatusBadge status={w.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
