"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { adminRequest } from "@/lib/admin-api";

export function DeleteUserAction({ userId }: { userId: string }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await adminRequest(`/api/admin/users/${userId}`, "DELETE", { confirmation });
      router.replace("/admin/users");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete this account.");
      setBusy(false);
    }
  }

  if (!asking) {
    return <button type="button" onClick={() => setAsking(true)} className="btn btn-ghost w-full border border-red-300 text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/40">Delete account</button>;
  }

  return (
    <div className="space-y-3 rounded-xl border border-red-200 bg-red-50/70 p-4 dark:border-red-900 dark:bg-red-950/20">
      <div>
        <p className="text-sm font-semibold text-red-800 dark:text-red-200">Remove this account?</p>
        <p className="mt-1 text-xs leading-5 text-red-800/80 dark:text-red-200/80">Sign-in will be blocked and profile details anonymized. Financial transaction records will remain for account history.</p>
      </div>
      <label className="block text-xs font-semibold text-ink">
        Type DELETE to confirm
        <input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" className="input mt-1 border-red-200 bg-surface dark:border-red-900" />
      </label>
      <div className="flex gap-2">
        <button type="button" disabled={busy || confirmation !== "DELETE"} onClick={remove} className="btn flex-1 bg-red-600 text-white hover:bg-red-700 disabled:cursor-not-allowed">
          {busy ? "Removing..." : "Confirm delete"}
        </button>
        <button type="button" disabled={busy} onClick={() => { setAsking(false); setConfirmation(""); setError(null); }} className="btn btn-ghost border border-line">Cancel</button>
      </div>
      {error && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{error}</p>}
    </div>
  );
}
