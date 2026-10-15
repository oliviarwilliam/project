"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { adminRequest } from "@/lib/admin-api";

type Mode = "idle" | "reject" | "paid";
type Action = "approve" | "reject" | "paid" | "transfer";
type Result = { transfer?: { status?: string; reason?: string | null; error?: string } | { error: string }; status?: string; reason?: string | null; error?: string };

// What the admin sees after approve or send transfer.
function describe(r: Result | undefined): string | null {
  const t = (r?.transfer ?? r) as { status?: string; reason?: string | null; error?: string } | undefined;
  if (!t) return null;
  if (t.error) return `Approved, but the transfer did not start: ${t.error}`;
  if (t.status === "failed" || t.status === "reversed") return `Transfer ${t.status}: ${t.reason ?? "no reason given"}`;
  if (t.status === "queued") return "Transfer sent to Paystack. Waiting for confirmation.";
  return t.status === "success" ? "Transfer completed." : "Transfer started. The member is notified when it completes.";
}

export function WithdrawalActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("idle");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (status !== "pending" && status !== "approved") return null;

  async function send(action: Action) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const body = action === "reject" ? { reason: text } : action === "paid" ? { reference: text } : undefined;
      const result = await adminRequest<Result>(`/api/admin/withdrawals/${id}/${action}`, "POST", body);
      setMode("idle");
      setText("");
      if (action === "approve" || action === "transfer") setNotice(describe(result));
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 md:min-w-64">
      {mode === "idle" ? (
        <div className="flex flex-wrap gap-2">
          {status === "pending" ? (
            <button type="button" disabled={busy} onClick={() => send("approve")} className="btn btn-primary flex-1">{busy ? "Saving..." : "Approve and send"}</button>
          ) : (
            <>
              <button type="button" disabled={busy} onClick={() => send("transfer")} className="btn btn-primary flex-1">{busy ? "Sending..." : "Send transfer"}</button>
              <button type="button" onClick={() => setMode("paid")} className="btn btn-ghost border border-line">Mark paid</button>
            </>
          )}
          <button type="button" onClick={() => setMode("reject")} className="btn btn-ghost border border-line text-red-600 dark:text-red-400">Reject</button>
        </div>
      ) : (
        <>
          <label className="block text-sm font-medium">
            {mode === "reject" ? "Reason (sent to the member, money is refunded)" : "Bank reference (for a payment made outside Paystack)"}
            <input value={text} onChange={(e) => setText(e.target.value)} maxLength={300} className="input mt-1" />
          </label>
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={() => send(mode === "reject" ? "reject" : "paid")} className={mode === "reject" ? "btn flex-1 bg-red-600 text-white hover:opacity-90" : "btn btn-primary flex-1"}>
              {busy ? "Saving..." : mode === "reject" ? "Confirm reject" : "Confirm paid"}
            </button>
            <button type="button" disabled={busy} onClick={() => { setMode("idle"); setText(""); }} className="btn btn-ghost border border-line">Cancel</button>
          </div>
        </>
      )}
      {notice && <p role="status" className="text-xs text-muted">{notice}</p>}
      {error && <p role="alert" className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
