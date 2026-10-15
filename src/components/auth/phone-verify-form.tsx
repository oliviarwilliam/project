"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Field, FormAlert } from "@/components/ui/field";
import { useApiForm } from "@/hooks/use-api-form";
import { schemas } from "@/lib/validation";

export function PhoneVerifyForm() {
  const router = useRouter();
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("");

  const send = useApiForm({
    schema: schemas.phoneSend,
    url: "/api/auth/phone/send",
    onSuccess: (_data, values) => {
      setPhone(values.phone ?? "");
      setStep("code");
    },
  });

  const verify = useApiForm({
    schema: schemas.phoneVerify,
    url: "/api/auth/phone/verify",
    onSuccess: () => {
      router.replace("/profile");
      router.refresh();
    },
  });

  if (step === "phone") {
    return (
      <form onSubmit={send.submit} noValidate className="space-y-4">
        <Field
          label="Phone number"
          name="phone"
          type="tel"
          autoComplete="tel"
          placeholder="+2348012345678"
          hint="Include the country code."
          error={send.errors.phone}
        />
        {send.message && <FormAlert>{send.message}</FormAlert>}
        <button type="submit" disabled={send.busy} className="btn btn-primary h-11 w-full">
          {send.busy ? "Sending code" : "Send code"}
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={verify.submit} noValidate className="space-y-4">
      <FormAlert tone="info">We sent a 6 digit code to {phone}.</FormAlert>
      <input type="hidden" name="phone" value={phone} />
      <Field
        label="Verification code"
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        error={verify.errors.code}
      />
      {verify.message && !verify.errors.code && <FormAlert>{verify.message}</FormAlert>}
      <button type="submit" disabled={verify.busy} className="btn btn-primary h-11 w-full">
        {verify.busy ? "Checking" : "Verify phone"}
      </button>
      <button type="button" onClick={() => setStep("phone")} className="text-sm text-muted underline hover:text-ink">
        Use a different number
      </button>
    </form>
  );
}
