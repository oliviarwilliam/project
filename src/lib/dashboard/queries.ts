import type { SupabaseClient } from "@supabase/supabase-js";

// All reads run as the signed in member, so row level security limits every result.

export type UserPackage = {
  id: string; amount: number; return_rate: number; payout_interval_days: number;
  starts_at: string; ends_at: string; next_payout_at: string | null;
  status: "active" | "completed" | "cancelled"; name: string;
};
export type CatalogPackage = {
  id: string; name: string; description: string | null; price: number; currency: string;
  return_rate: number; payout_interval_days: number; duration_days: number;
};
export type Withdrawal = {
  id: string; amount: number; fee: number; net_amount: number; method: string; funding_source: "profit" | "referral";
  status: string; rejection_reason: string | null; created_at: string;
};
export type AppNotification = {
  id: string; type: string; title: string; body: string | null; read_at: string | null; created_at: string;
};

export const PENDING_STATUSES = ["pending", "approved", "processing"];

export async function getUserPackages(db: SupabaseClient): Promise<UserPackage[]> {
  const { data } = await db
    .from("user_packages")
    .select("id, amount, return_rate, payout_interval_days, starts_at, ends_at, next_payout_at, status, packages(name)")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  return (data ?? []).map((row: any) => ({ ...row, name: row.packages?.name ?? "Package" }));
}

export async function getCatalog(db: SupabaseClient): Promise<CatalogPackage[]> {
  const { data } = await db
    .from("packages")
    .select("id, name, description, price, currency, return_rate, payout_interval_days, duration_days")
    .eq("status", "active")
    .is("deleted_at", null)
    .order("sort_order");
  return (data ?? []) as CatalogPackage[];
}

export async function getWithdrawals(db: SupabaseClient): Promise<Withdrawal[]> {
  const { data } = await db
    .from("withdrawals")
    .select("id, amount, fee, net_amount, method, funding_source, status, rejection_reason, created_at")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(50);
  return (data ?? []) as Withdrawal[];
}

export async function getNotifications(db: SupabaseClient): Promise<AppNotification[]> {
  const { data } = await db
    .from("notifications")
    .select("id, type, title, body, read_at, created_at")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(50);
  return (data ?? []) as AppNotification[];
}

export async function getWithdrawalRules(db: SupabaseClient) {
  const { data } = await db.from("settings").select("key, value").in("key", ["min_withdrawal_amount", "withdrawal_fee_percent"]);
  const map = new Map((data ?? []).map((r: { key: string; value: unknown }) => [r.key, Number(r.value)]));
  return { min: map.get("min_withdrawal_amount") ?? 0, feePercent: map.get("withdrawal_fee_percent") ?? 0 };
}
