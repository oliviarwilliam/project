"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Field, FormAlert } from "@/components/ui/field";
import { ResendEmailButton } from "@/components/auth/resend-email-button";
import { useApiForm } from "@/hooks/use-api-form";
import { schemas } from "@/lib/validation";

export function RegisterForm({ initialReferralCode = "" }: { initialReferralCode?: string }) {
  const router = useRouter();
  const [sentTo, setSentTo] = useState<string | null>(null);

  const form = useApiForm({
    schema: schemas.register,
    url: "/api/auth/register",
    onSuccess: (data, values) => {
      if (data.needsVerification === false) {
        router.replace("/dashboard");
        router.refresh();
        return;
      }
      setSentTo(values.email ?? "");
    },
  });

  if (sentTo) {
    return (
      <div className="space-y-4">
        <FormAlert tone="info">We sent a verification link to {sentTo}. Open it to finish creating your account.</FormAlert>
        <ResendEmailButton email={sentTo} />
      </div>
    );
  }

  return (
    <form onSubmit={form.submit} noValidate className="space-y-4">
      <Field label="Full name" name="fullName" autoComplete="name" error={form.errors.fullName} />
      <Field label="Email" name="email" type="email" autoComplete="email" error={form.errors.email} />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        hint="At least 6 characters with a letter and a number."
        error={form.errors.password}
      />
      <Field label="Confirm password" name="confirmPassword" type="password" autoComplete="new-password" error={form.errors.confirmPassword} />
      <Field label="Referral code (optional)" name="referralCode" defaultValue={initialReferralCode} autoComplete="off" error={form.errors.referralCode} />
      {form.message && <FormAlert>{form.message}</FormAlert>}
      <button type="submit" disabled={form.busy} className="btn btn-primary h-11 w-full">
        {form.busy ? "Creating account" : "Create account"}
      </button>
      <p className="text-xs text-muted">
        Learn more about the platform on the <Link href="/how-it-works" className="underline">How it works</Link> page.
      </p>
    </form>
  );
}
