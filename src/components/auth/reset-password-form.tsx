"use client";

import { useRouter } from "next/navigation";
import { Field, FormAlert } from "@/components/ui/field";
import { useApiForm } from "@/hooks/use-api-form";
import { schemas } from "@/lib/validation";

export function ResetPasswordForm() {
  const router = useRouter();
  const form = useApiForm({
    schema: schemas.resetPassword,
    url: "/api/auth/reset-password",
    onSuccess: () => {
      router.replace("/dashboard");
      router.refresh();
    },
  });

  return (
    <form onSubmit={form.submit} noValidate className="space-y-4">
      <Field
        label="New password"
        name="password"
        type="password"
        autoComplete="new-password"
        hint="At least 6 characters with a letter and a number."
        error={form.errors.password}
      />
      <Field label="Confirm new password" name="confirmPassword" type="password" autoComplete="new-password" error={form.errors.confirmPassword} />
      {form.message && <FormAlert>{form.message}</FormAlert>}
      <button type="submit" disabled={form.busy} className="btn btn-primary h-11 w-full">
        {form.busy ? "Saving" : "Save new password"}
      </button>
    </form>
  );
}
