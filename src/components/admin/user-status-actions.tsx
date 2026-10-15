"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { adminRequest } from "@/lib/admin-api";

export function UserStatusActions({ userId, status }: { userId: string; status: string }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(path: "suspend" | "reactivate") {
    setBusy(true);
    setError(null);
    try {
      await adminRequest(`/api/admin/users/${userId}/${path}`, "POST", path === "suspend" ? { reason } : undefined);
      setAsking(false);
      setReason("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  if (status === "closed") return <p className="text-sm text-muted">This account is closed.</p>;

  if (status === "suspended") {
    return (
      <div className="space-y-2">
        <button type="button" disabled={busy} onClick={() => run("reactivate")} className="btn btn-primary w-full">{busy ? "Saving..." : "Reactivate account"}</button>
        {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {!asking ? (
        <button type="button" onClick={() => setAsking(true)} className="btn btn-ghost w-full border border-line text-red-600 dark:text-red-400">Suspend account</button>
      ) : (
        <>
          <label className="block text-sm font-medium">
            Reason (the member sees that the account is suspended)
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={300} className="input mt-1 h-auto py-2" />
          </label>
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={() => run("suspend")} className="btn flex-1 bg-red-600 text-white hover:opacity-90">{busy ? "Saving..." : "Confirm suspend"}</button>
            <button type="button" disabled={busy} onClick={() => setAsking(false)} className="btn btn-ghost border border-line">Cancel</button>
          </div>
        </>
      )}
      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
