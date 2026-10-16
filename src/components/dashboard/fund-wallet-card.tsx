"use client";

import { useState } from "react";
import { money } from "@/lib/format";
import { Card } from "./ui";

type Props = { currency: string; min: number; max: number; presets: readonly number[] };

export function FundWalletCard({ currency, min, max, presets }: Props) {
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const value = Number(amount);
    if (!Number.isFinite(value) || value < min || value > max) {
      return setError(`Enter an amount between ${money(min, currency)} and ${money(max, currency)}.`);
    }

    setBusy(true);
    try {
      const res = await fetch("/api/wallet/fund", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amount: value, currency }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? "Could not start the payment.");
      window.location.assign(json.data.authorizationUrl); // stay in the busy state while we leave
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setBusy(false);
    }
  }

  return (
    <Card className="mt-6">
      <h2 className="font-semibold">Fund your wallet</h2>
      <p className="mt-1 text-sm text-muted">Pay securely by card, bank transfer or USSD.</p>
      <form onSubmit={submit} className="mt-4 space-y-3" noValidate>
        <label className="block text-sm font-medium">
          Amount ({currency})
          <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="input mt-1 text-lg tabular-nums" />
        </label>
        <div className="flex flex-wrap gap-2">
          {presets.map((p) => (
            <button key={p} type="button" onClick={() => setAmount(String(p))} className="rounded-full border border-line px-3 py-1.5 text-sm font-medium text-muted hover:text-ink">
              {money(p, currency)}
            </button>
          ))}
        </div>
        {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <button type="submit" disabled={busy} className="btn btn-primary h-11 w-full sm:w-auto sm:px-8">
          {busy ? "Redirecting to Paystack..." : "Add money"}
        </button>
      </form>
    </Card>
  );
}
