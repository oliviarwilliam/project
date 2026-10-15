"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { adminRequest } from "@/lib/admin-api";

export function RunEarningsButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setMessage(null);
    try {
      const r = await adminRequest<{ skipped?: boolean; credited?: number; failed?: number }>("/api/admin/earnings/runs", "POST");
      setMessage(r.skipped ? "A run is already in progress." : `Credited ${r.credited ?? 0} payouts, ${r.failed ?? 0} failed.`);
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button type="button" disabled={busy} onClick={run} className="btn btn-ghost border border-line">{busy ? "Running..." : "Run now"}</button>
      {message && <p role="status" className="text-sm text-muted">{message}</p>}
    </div>
  );
}
