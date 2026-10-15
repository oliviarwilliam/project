"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { adminRequest } from "@/lib/admin-api";

export function AdjustWalletForm({ walletId, currency }: { walletId: string; currency: string }) {
  const router = useRouter();
  const key = useRef<string | null>(null);
  const [direction, setDirection] = useState("credit");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    key.current ??= crypto.randomUUID(); // reused on retry so a double click cannot adjust twice
    try {
      await adminRequest(`/api/admin/wallets/${walletId}/adjustments`, "POST", { direction, amount: Number(amount), reason }, key.current);
      key.current = null;
      setAmount("");
      setReason("");
      setMessage({ ok: true, text: "Adjustment saved." });
      router.refresh();
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : "Something went wrong." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <div className="grid grid-cols-2 gap-2">
        <select value={direction} onChange={(e) => setDirection(e.target.value)} className="input" aria-label="Direction">
          <option value="credit">Add money</option>
          <option value="debit">Remove money</option>
        </select>
        <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={`Amount (${currency})`} className="input tabular-nums" aria-label="Amount" />
      </div>
      <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (saved in the audit log)" maxLength={300} className="input" aria-label="Reason" />
      {message && <p role={message.ok ? "status" : "alert"} className={message.ok ? "text-sm text-emerald-600 dark:text-emerald-300" : "text-sm text-red-600 dark:text-red-400"}>{message.text}</p>}
      <button type="submit" disabled={busy} className="btn btn-ghost w-full border border-line">{busy ? "Saving..." : "Apply adjustment"}</button>
    </form>
  );
}
