import Link from "next/link";
import { AuthCard } from "@/components/ui/auth-card";
import { PhoneVerifyForm } from "@/components/auth/phone-verify-form";

export const metadata = { title: "Verify phone" };

export default function VerifyPhonePage() {
  return (
    <AuthCard
      title="Verify your phone"
      subtitle="We will text you a code to confirm the number is yours."
      footer={<Link href="/profile" className="underline hover:text-ink">Back to profile</Link>}
    >
      <PhoneVerifyForm />
    </AuthCard>
  );
}
