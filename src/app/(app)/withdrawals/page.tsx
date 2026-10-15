import Link from "next/link";
import { Card, EmptyState, PageHeader, StatusBadge } from "@/components/dashboard/ui";
import { WithdrawForm } from "@/components/dashboard/withdraw-form";
import { PENDING_STATUSES, getWithdrawals } from "@/lib/dashboard/queries";
import { money, shortDate } from "@/lib/format";
import { getProfile } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import * as withdrawalService from "@/services/withdrawals";

export const metadata = { title: "Withdrawals" };

const BLOCKED: Record<string, string> = {
  ACCOUNT_RESTRICTED: "Your account cannot make withdrawals right now.",
  MAINTENANCE_MODE: "Withdrawals are paused for maintenance. Try again later.",
  PROFILE_INCOMPLETE: "Add your date of birth in your profile before withdrawing.",
  REFERRALS_REQUIRED: "Refer 10 people who verify their email before requesting a withdrawal.",
  NO_PROFIT_AVAILABLE: "You do not have enough profit to withdraw yet. Only profit can be withdrawn.",
};

export default async function WithdrawalsPage() {
  const db = await createClient();
  const { data } = await db.auth.getUser();
  const userId = data.user?.id ?? "";

  const [profile, history, rules] = await Promise.all([
    getProfile(db, userId),
    getWithdrawals(db),
    withdrawalService.getEligibility(userId).catch(() => null),
  ]);

  const currency = rules?.currency ?? "NGN";
  const inReview = history.filter((w) => PENDING_STATUSES.includes(w.status));
  const bank =
    profile?.bankName && profile.accountNumber && profile.accountName
      ? { bankName: profile.bankName, accountNumber: profile.accountNumber, accountName: profile.accountName }
      : null;

  const notice =
    rules?.blocked_by === "WITHDRAWAL_COOLDOWN" && rules.next_eligible_at
      ? `You can request one withdrawal every ${rules.cooldown_days} days. Your next one opens on ${shortDate(rules.next_eligible_at)}.`
      : rules?.blocked_by
        ? (BLOCKED[rules.blocked_by] ?? "You cannot request a withdrawal right now.")
        : null;

  return (
    <>
      <PageHeader title="Withdrawals" subtitle={`Withdrawable profit: ${money(rules?.available_profit ?? 0, currency)}`} />

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <h2 className="mb-1 font-semibold">Request a withdrawal</h2>
          {rules && (
            <p className="mb-4 text-sm text-muted">
              Only profit can be withdrawn, once every {rules.cooldown_days} days. Minimum {money(rules.min_amount, currency)}. Every request is reviewed by our team.
            </p>
          )}
          {!bank ? (
            <EmptyState icon="user" title="Add your bank details" text="We need a bank account before we can send money to you." href="/profile" cta="Go to profile" />
          ) : notice || !rules ? (
            <p role="status" className="rounded-xl bg-line/40 p-4 text-sm">
              {rules?.blocked_by === "PROFILE_INCOMPLETE" ? (
                <>Add your date of birth in <Link href="/profile" className="font-medium underline">your profile</Link> to check withdrawal eligibility.</>
              ) : rules?.blocked_by === "REFERRALS_REQUIRED" ? (
                <>You have referred {rules.qualified_referrals} of {rules.required_referrals} required people. <Link href="/referrals" className="font-medium underline">Invite more people</Link></>
              ) : notice ?? "We could not load your withdrawal details. Try again shortly."}
            </p>
          ) : (
            <WithdrawForm available={rules.available_profit} currency={currency} min={rules.min_amount} feePercent={rules.fee_percent} bank={bank} />
          )}
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
                      {shortDate(w.created_at)} · {w.method}
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
