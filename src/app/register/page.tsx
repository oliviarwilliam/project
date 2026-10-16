import Link from "next/link";
import type { Metadata } from "next";
import { AuthCard } from "@/components/ui/auth-card";
import { RegisterForm } from "@/components/auth/register-form";
import { getReferralRewardAmount } from "@/services/referrals/referral.service";

const formatReward = (amount: number) => new Intl.NumberFormat("en-NG", {
  style: "currency", currency: "NGN", maximumFractionDigits: 2,
}).format(amount);

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ ref?: string | string[] }> }): Promise<Metadata> {
  const search = await searchParams;
  const ref = Array.isArray(search.ref) ? search.ref[0] : search.ref;
  const reward = await getReferralRewardAmount().catch(() => 1000);
  const formattedReward = formatReward(reward);
  const title = reward > 0 ? `Join TeenVest — your friend earns ${formattedReward}` : "Join TeenVest";
  const description = reward > 0
    ? `Your friend earns ${formattedReward} when you join TeenVest through this link and fund your wallet. Start building your financial knowledge today.`
    : "Join TeenVest to build your financial knowledge and grow good money habits.";
  const previewImage = `/api/referral-preview?amount=${encodeURIComponent(String(reward))}`;

  return {
    title: "Create account",
    description,
    openGraph: {
      type: "website",
      title,
      description,
      url: ref ? `/register?ref=${encodeURIComponent(ref.slice(0, 16))}` : "/register",
      siteName: "TeenVest",
      images: [{ url: previewImage, width: 1200, height: 630, alt: title }],
    },
    twitter: { card: "summary_large_image", title, description, images: [previewImage] },
  };
}

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  const { ref = "" } = await searchParams;
  return (
    <AuthCard
      title="Create your account"
      subtitle="It takes a minute. We will email you a link to verify your address."
      footer={<>Already have an account? <Link href="/login" className="underline hover:text-ink">Log in</Link></>}
    >
      <RegisterForm initialReferralCode={ref.slice(0, 16)} />
    </AuthCard>
  );
}
