import Link from "next/link";
import { AuthCard } from "@/components/ui/auth-card";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export const metadata = { title: "Forgot password" };

export default function ForgotPasswordPage() {
  return (
    <AuthCard
      title="Reset your password"
      subtitle="Enter your email and we will send you a link to choose a new password."
      footer={<Link href="/login" className="underline hover:text-ink">Back to log in</Link>}
    >
      <ForgotPasswordForm />
    </AuthCard>
  );
}
