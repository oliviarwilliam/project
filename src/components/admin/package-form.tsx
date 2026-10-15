"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/dashboard/ui";
import { money } from "@/lib/format";
import type { PackageStatus } from "@/lib/packages";

type Values = {
  name: string; price: string; dailyProfitPercent: string; durationDays: string; status: PackageStatus;
  description: string; maxPerUser: string; sortOrder: string; currency: string;
};
type Props = { mode: "create" | "edit"; packageId?: string; initial?: Values };

const EMPTY: Values = {
  name: "", price: "", dailyProfitPercent: "", durationDays: "", status: "draft",
  description: "", maxPerUser: "", sortOrder: "", currency: "NGN",
};

export function PackageForm({ mode, packageId, initial = EMPTY }: Props) {
  const router = useRouter();
  const [v, setV] = useState<Values>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof Values) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setV((prev) => ({ ...prev, [key]: e.target.value }));

  const price = Number(v.price);
  const percent = Number(v.dailyProfitPercent);
  const days = Number(v.durationDays);
  const ready = price > 0 && percent > 0 && days > 0;
  const daily = ready ? Math.round(price * percent) / 100 : 0;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);

    const body: Record<string, unknown> = {
      name: v.name, price: v.price, dailyProfitPercent: v.dailyProfitPercent, durationDays: v.durationDays,
      status: v.status, description: v.description, maxPerUser: v.maxPerUser, sortOrder: v.sortOrder,
    };
    if (mode === "create") body.currency = v.currency; // the currency of a package cannot be changed later

    try {
      const res = await fetch(mode === "edit" ? `/api/admin/packages/${packageId}` : "/api/admin/packages", {
        method: mode === "edit" ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? "Could not save the package.");
      router.push("/admin/packages");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setBusy(false);
    }
  }

  const label = "block text-sm font-medium";
  return (
    <form onSubmit={submit} noValidate className="grid gap-6 lg:grid-cols-3">
      <Card className="space-y-4 lg:col-span-2">
        <label className={label}>Name<input value={v.name} onChange={set("name")} maxLength={40} className="input mt-1" /></label>
        <label className={label}>Description (optional)
          <textarea value={v.description} onChange={set("description")} maxLength={300} rows={3} className="input mt-1 h-auto py-2" />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className={label}>Amount<input inputMode="decimal" value={v.price} onChange={set("price")} className="input mt-1 tabular-nums" /></label>
          <label className={label}>Currency<input value="NGN" readOnly className="input mt-1" /></label>
          <label className={label}>Daily profit (%)<input inputMode="decimal" value={v.dailyProfitPercent} onChange={set("dailyProfitPercent")} placeholder="0.25" className="input mt-1 tabular-nums" /></label>
          <label className={label}>Duration (days)<input inputMode="numeric" value={v.durationDays} onChange={set("durationDays")} className="input mt-1 tabular-nums" /></label>
          <label className={label}>Max per member (optional)<input inputMode="numeric" value={v.maxPerUser} onChange={set("maxPerUser")} className="input mt-1 tabular-nums" /></label>
          <label className={label}>Sort order (optional)<input inputMode="numeric" value={v.sortOrder} onChange={set("sortOrder")} className="input mt-1 tabular-nums" /></label>
        </div>
        <label className={label}>Status
          <select value={v.status} onChange={set("status")} className="input mt-1">
            <option value="draft">Draft (hidden)</option>
            <option value="active">Active (visible and buyable)</option>
            <option value="archived">Disabled (hidden, owners keep earning)</option>
          </select>
        </label>
      </Card>

      <div className="space-y-4">
        <Card>
          <h2 className="font-semibold">Preview</h2>
          {ready ? (
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-muted">Daily profit</dt><dd className="font-medium tabular-nums">{money(daily, v.currency)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Total profit</dt><dd className="font-medium tabular-nums">{money(daily * days, v.currency)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Over the full term</dt><dd className="font-medium tabular-nums">{+(percent * days).toFixed(2)}%</dd></div>
            </dl>
          ) : (
            <p className="mt-2 text-sm text-muted">Fill in the amount, daily profit and duration to see the result.</p>
          )}
        </Card>
        {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <button type="submit" disabled={busy} className="btn btn-primary h-11 w-full">{busy ? "Saving..." : mode === "edit" ? "Save changes" : "Create package"}</button>
      </div>
    </form>
  );
}
