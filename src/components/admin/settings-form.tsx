"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { adminRequest } from "@/lib/admin-api";

type Values = { minWithdrawalAmount: number; withdrawalCooldownDays: number; withdrawalFeePercent: number; referralRewardAmount: number; maintenanceMode: boolean };

export function SettingsForm({ initial }: { initial: Values }) {
  const router = useRouter();
  const [v, setV] = useState({
    min: String(initial.minWithdrawalAmount), days: String(initial.withdrawalCooldownDays),
    fee: String(initial.withdrawalFeePercent), maintenance: initial.maintenanceMode,
    referralReward: String(initial.referralRewardAmount),
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);

    // Only send what changed, so the audit log stays meaningful.
    const body: Record<string, unknown> = {};
    if (Number(v.min) !== initial.minWithdrawalAmount) body.minWithdrawalAmount = Number(v.min);
    if (Number(v.days) !== initial.withdrawalCooldownDays) body.withdrawalCooldownDays = Number(v.days);
    if (Number(v.fee) !== initial.withdrawalFeePercent) body.withdrawalFeePercent = Number(v.fee);
    if (Number(v.referralReward) !== initial.referralRewardAmount) body.referralRewardAmount = Number(v.referralReward);
    if (v.maintenance !== initial.maintenanceMode) body.maintenanceMode = v.maintenance;
    if (Object.keys(body).length === 0) return setMessage({ ok: true, text: "Nothing changed." });

    setBusy(true);
    try {
      await adminRequest("/api/admin/settings", "PATCH", body);
      setMessage({ ok: true, text: "Settings saved." });
      router.refresh();
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : "Something went wrong." });
    } finally {
      setBusy(false);
    }
  }

  const label = "block text-sm font-medium";
  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={label}>Minimum withdrawal (NGN)<input inputMode="decimal" min="5000" value={v.min} onChange={(e) => setV({ ...v, min: e.target.value })} className="input mt-1 tabular-nums" /><span className="mt-1 block text-xs font-normal text-muted">Can be increased, with a minimum setting of ₦5,000.</span></label>
        <label className={label}>Days between withdrawals<input inputMode="numeric" value={v.days} onChange={(e) => setV({ ...v, days: e.target.value })} className="input mt-1 tabular-nums" /><span className="mt-1 block text-xs font-normal text-muted">0 turns the limit off</span></label>
        <label className={label}>Withdrawal fee (%)<input inputMode="decimal" value={v.fee} onChange={(e) => setV({ ...v, fee: e.target.value })} className="input mt-1 tabular-nums" /></label>
        <label className={label}>Referral reward (NGN)<input inputMode="decimal" min="0" max="1000000" value={v.referralReward} onChange={(e) => setV({ ...v, referralReward: e.target.value })} className="input mt-1 tabular-nums" /><span className="mt-1 block text-xs font-normal text-muted">Credited after each referred member makes their first wallet deposit. Set to 0 to disable rewards.</span></label>
      </div>
      <label className="flex items-start gap-3 rounded-xl border border-line p-4 text-sm">
        <input type="checkbox" checked={v.maintenance} onChange={(e) => setV({ ...v, maintenance: e.target.checked })} className="mt-0.5 h-4 w-4" />
        <span><span className="font-medium">Maintenance mode</span><br /><span className="text-muted">Pauses package purchases and withdrawals for every member. Deposits and daily profit continue.</span></span>
      </label>
      {message && <p role={message.ok ? "status" : "alert"} className={message.ok ? "text-sm text-emerald-600 dark:text-emerald-300" : "text-sm text-red-600 dark:text-red-400"}>{message.text}</p>}
      <button type="submit" disabled={busy} className="btn btn-primary h-11 px-8">{busy ? "Saving..." : "Save settings"}</button>
    </form>
  );
}
