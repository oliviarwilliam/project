"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Field, FormAlert } from "@/components/ui/field";
import { ResendEmailButton } from "@/components/auth/resend-email-button";
import { useApiForm } from "@/hooks/use-api-form";
import { schemas } from "@/lib/validation";

export function LoginForm({ next, notice }: { next: string; notice?: string }) {
  const router = useRouter();

  const form = useApiForm({
    schema: schemas.login,
    url: "/api/auth/login",
    onSuccess: () => {
      router.replace(next);
      router.refresh();
    },
  });

  return (
    <form onSubmit={form.submit} noValidate className="space-y-4">
      {notice && !form.message && <FormAlert>{notice}</FormAlert>}
      <Field label="Email" name="email" type="email" autoComplete="email" error={form.errors.email} />
      <Field label="Password" name="password" type="password" autoComplete="current-password" error={form.errors.password} />
      <div className="text-right text-sm">
        <Link href="/forgot-password" className="text-muted underline hover:text-ink">Forgot password?</Link>
      </div>
      {form.message && <FormAlert>{form.message}</FormAlert>}
      {form.code === "email_not_confirmed" && <ResendEmailButton email={form.values.email ?? ""} />}
      <button type="submit" disabled={form.busy} className="btn btn-primary h-11 w-full">
        {form.busy ? "Logging in" : "Log in"}
      </button>
    </form>
  );
}
