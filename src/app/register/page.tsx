import Link from "next/link";
import { AuthCard } from "@/components/ui/auth-card";
import { RegisterForm } from "@/components/auth/register-form";

export const metadata = { title: "Create account" };

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
