"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { AvatarUploader } from "@/components/profile/avatar-uploader";
import { Field, FormAlert } from "@/components/ui/field";
import { useApiForm } from "@/hooks/use-api-form";
import type { Profile } from "@/lib/profile";
import { schemas } from "@/lib/validation";

type Props = { profile: Profile; emailVerified: boolean; phoneVerified: boolean };

export function ProfileForm({ profile, emailVerified, phoneVerified }: Props) {
  const router = useRouter();
  const [saved, setSaved] = useState(false);

  const form = useApiForm({
    schema: schemas.profile,
    url: "/api/profile",
    method: "PATCH",
    onSuccess: () => {
      setSaved(true);
      router.refresh();
    },
  });
  const now = new Date();
  const maxBirthDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  return (
    <div className="space-y-8">
      <AvatarUploader initialUrl={profile.avatarUrl} name={profile.fullName ?? profile.email} />

      <form onSubmit={form.submit} onChange={() => setSaved(false)} noValidate className="space-y-8">
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Personal details</h2>
          <Field label="Full name" name="fullName" defaultValue={profile.fullName ?? ""} autoComplete="name" error={form.errors.fullName} />
          <Field label="Date of birth" name="dateOfBirth" type="date" min="1900-01-02" defaultValue={profile.dateOfBirth?.slice(0, 10) ?? ""} max={maxBirthDate} hint="Required to check withdrawal eligibility." error={form.errors.dateOfBirth} />
          <Field label="Email" id="email" value={profile.email} readOnly hint={emailVerified ? "Verified" : "Not verified. Check your inbox for the link."} />
          <Field
            label="Phone"
            id="phone"
            value={profile.phone ?? ""}
            placeholder="Not added"
            readOnly
            hint={
              <>
                {phoneVerified ? "Verified. " : "Not verified. "}
                <Link href="/verify-phone" className="underline">{profile.phone ? "Change number" : "Add and verify a number"}</Link>
              </>
            }
          />
        </section>

        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Bank details</h2>
            <p className="mt-1 text-sm text-muted">Used for withdrawals. Fill in all three fields or leave them empty.</p>
          </div>
          <Field label="Bank name" name="bankName" defaultValue={profile.bankName ?? ""} error={form.errors.bankName} />
          <Field
            label="Account number"
            name="accountNumber"
            inputMode="numeric"
            defaultValue={profile.accountNumber ?? ""}
            error={form.errors.accountNumber}
          />
          <Field label="Account name" name="accountName" defaultValue={profile.accountName ?? ""} error={form.errors.accountName} />
        </section>

        {form.message && <FormAlert>{form.message}</FormAlert>}
        {saved && <FormAlert tone="info">Profile saved.</FormAlert>}
        <button type="submit" disabled={form.busy} className="btn btn-primary h-11 px-6">
          {form.busy ? "Saving" : "Save changes"}
        </button>
      </form>
    </div>
  );
}
