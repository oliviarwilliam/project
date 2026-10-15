import { AuthCard } from "@/components/ui/auth-card";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export const metadata = { title: "Choose a new password" };

export default function ResetPasswordPage() {
  return (
    <AuthCard title="Choose a new password" subtitle="You will be signed out on your other devices.">
      <ResetPasswordForm />
    </AuthCard>
  );
}
