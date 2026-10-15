"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { money } from "@/lib/format";
import { postWallet } from "@/lib/wallet-api";

type Props = {
  currency: string;
  feePercent: number;
  bank: { bankName: string; accountNumber: string; accountName: string };
};

export function WithdrawForm({ currency, feePercent, bank }: Props) {
  const router = useRouter();
  const key = useRef<string | null>(null);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const value = Number(amount);
  const fee = Number.isFinite(value) ? Math.round(value * feePercent) / 100 : 0;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setDone(false);
    if (!(value > 0)) return setError("Enter an amount.");

    setBusy(true);
    key.current ??= crypto.randomUUID();
    try {
      await postWallet("/api/wallet/withdrawals", {
        amount: value,
        currency,
        method: "bank",
        destination: { bank_name: bank.bankName, account_number: bank.accountNumber, account_name: bank.accountName },
      }, key.current);
      key.current = null;
      setAmount("");
      setDone(true);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <label className="block text-sm font-medium">
        Amount ({currency})
        <input
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          className="input mt-1 text-lg tabular-nums"
        />
      </label>
      <dl className="space-y-1 rounded-xl bg-line/40 p-3 text-sm">
        <div className="flex justify-between"><dt className="text-muted">Paid to</dt><dd>{bank.bankName} •••• {bank.accountNumber.slice(-4)}</dd></div>
        <div className="flex justify-between"><dt className="text-muted">Fee ({feePercent}%)</dt><dd className="tabular-nums">{money(fee, currency)}</dd></div>
        <div className="flex justify-between font-semibold"><dt>You receive</dt><dd className="tabular-nums">{money(Math.max(value - fee, 0) || 0, currency)}</dd></div>
      </dl>
      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {done && <p role="status" className="text-sm text-emerald-600 dark:text-emerald-300">Request sent. We will review it soon.</p>}
      <button type="submit" disabled={busy} className="btn btn-primary h-11 w-full">{busy ? "Processing..." : "Withdraw"}</button>
    </form>
  );
}
