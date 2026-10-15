"use client";

import { useState } from "react";
import { Field, FormAlert } from "@/components/ui/field";
import { useApiForm } from "@/hooks/use-api-form";
import { schemas } from "@/lib/validation";

export function ForgotPasswordForm() {
  const [done, setDone] = useState(false);
  const form = useApiForm({ schema: schemas.forgotPassword, url: "/api/auth/forgot-password", onSuccess: () => setDone(true) });

  if (done) {
    return <FormAlert tone="info">If an account exists for that email, a reset link is on its way. It may take a minute to arrive.</FormAlert>;
  }

  return (
    <form onSubmit={form.submit} noValidate className="space-y-4">
      <Field label="Email" name="email" type="email" autoComplete="email" error={form.errors.email} />
      {form.message && <FormAlert>{form.message}</FormAlert>}
      <button type="submit" disabled={form.busy} className="btn btn-primary h-11 w-full">
        {form.busy ? "Sending" : "Send reset link"}
      </button>
    </form>
  );
}
