import { redirect } from "next/navigation";
import { EmptyState, PageHeader } from "@/components/dashboard/ui";
import { money } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import * as payments from "@/services/payments";
import { WalletError } from "@/services/wallet";

export const metadata = { title: "Payment status" };

type Props = { searchParams: Promise<{ reference?: string; trxref?: string }> };

// Paystack sends the member back here with ?reference=...
export default async function FundCallbackPage({ searchParams }: Props) {
  const params = await searchParams;
  const reference = params.reference ?? params.trxref;

  const db = await createClient();
  const { data } = await db.auth.getUser();
  if (!data.user) redirect("/login?next=/wallet");
  if (!reference) redirect("/wallet");

  let result: Awaited<ReturnType<typeof payments.verifyFunding>> | null = null;
  let problem: string | null = null;
  try {
    result = await payments.verifyFunding(data.user.id, reference);
  } catch (error) {
    problem = error instanceof WalletError ? error.message : "We could not check this payment. Please try again.";
  }

  return (
    <>
      <PageHeader title="Payment status" />
      {problem ? (
        <EmptyState icon="wallet" title="We could not confirm this payment" text={problem} href={`/wallet/fund/callback?reference=${encodeURIComponent(reference)}`} cta="Check again" />
      ) : result?.status === "success" ? (
        <EmptyState icon="in" title="Payment received" text={`${money(result.amount, result.currency)} is now in your wallet.`} href="/wallet" cta="Back to wallet" />
      ) : result?.status === "pending" ? (
        <EmptyState icon="clock" title="Still confirming" text="Your bank has not confirmed the payment yet. This can take a minute." href={`/wallet/fund/callback?reference=${encodeURIComponent(reference)}`} cta="Check again" />
      ) : (
        <EmptyState icon="wallet" title="Payment not completed" text="No money was taken. You can try again whenever you are ready." href="/wallet" cta="Back to wallet" />
      )}
    </>
  );
}
