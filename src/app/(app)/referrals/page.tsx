import { Card, PageHeader, StatCard } from "@/components/dashboard/ui";
import { ReferralShare } from "@/components/dashboard/referral-share";
import { env } from "@/lib/env";
import { money } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { getReferralSummary } from "@/services/referrals/referral.service";

export const metadata = { title: "Referrals" };

export default async function ReferralsPage() {
  const db = await createClient();
  const { data } = await db.auth.getUser();
  const summary = await getReferralSummary(data.user!.id);
  const link = `${env.siteUrl.replace(/\/$/, "")}/register?ref=${encodeURIComponent(summary.referralCode ?? "")}`;

  return (
    <>
      <PageHeader title="Referrals" subtitle="Invite people to TeenVest and earn a wallet reward when they fund their wallet." />
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon="users" label="Funded referrals" value={String(summary.qualified)} hint={`${summary.pending} have not funded their wallet yet`} />
        <StatCard icon="wallet" label="Referral rewards earned" value={money(summary.earned, "NGN")} />
        <StatCard icon="in" label="Reward per funded referral" value={money(summary.rewardAmount, "NGN")} />
      </div>
      <Card className="mt-6">
        <h2 className="font-semibold">Invite friends</h2>
        <p className="mt-1 text-sm text-muted">Share this link. A referral counts after the new member signs up with your code and makes their first wallet deposit. The reward is credited to your wallet.</p>
        {summary.referralCode ? <ReferralShare code={summary.referralCode} link={link} /> : <p role="alert" className="mt-3 text-sm text-red-600">Your referral code is not available. Please contact support.</p>}
      </Card>
    </>
  );
}
