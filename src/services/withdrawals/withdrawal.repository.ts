import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { fromDbError } from "@/services/wallet/errors";
import type { Eligibility, WithdrawalRow, WithdrawalStatus } from "./types";

// Member reads use the member's own client (row level security). Everything else is service role.
const db = () => createAdminClient();
const COLUMNS =
  "id, user_id, wallet_id, amount, fee, net_amount, method, funding_source, destination, status, rejection_reason, external_reference, reviewed_at, processed_at, created_at";

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db().rpc(name, args);
  if (error) throw fromDbError(error);
  return data as T;
}

export const eligibility = (userId: string, currency: string) =>
  rpc<Eligibility>("withdrawal_eligibility", { p_user_id: userId, p_currency: currency });

export async function firstCurrency(userId: string): Promise<string | null> {
  const { data, error } = await db().from("wallets").select("currency").eq("user_id", userId).is("deleted_at", null).order("created_at").limit(1).maybeSingle();
  if (error) throw fromDbError(error);
  return data ? String(data.currency).trim() : null;
}

export async function listMine(client: SupabaseClient, limit: number): Promise<WithdrawalRow[]> {
  const { data, error } = await client.from("withdrawals").select(COLUMNS).is("deleted_at", null).order("created_at", { ascending: false }).limit(limit);
  if (error) throw fromDbError(error);
  return (data ?? []) as WithdrawalRow[];
}

export async function listQueue(status: WithdrawalStatus | null, limit: number): Promise<WithdrawalRow[]> {
  let query = db().from("withdrawals").select(COLUMNS).is("deleted_at", null).order("created_at", { ascending: status === "pending" }).limit(limit);
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) throw fromDbError(error);
  return (data ?? []) as WithdrawalRow[];
}

export async function emails(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await db().from("users").select("id, email").in("id", ids);
  if (error) throw fromDbError(error);
  return new Map((data ?? []).map((u) => [u.id as string, String(u.email)]));
}

export const review = (adminId: string, id: string, decision: "approve" | "reject", reason: string | null) =>
  rpc<WithdrawalRow>("withdrawal_review", { p_admin_id: adminId, p_withdrawal_id: id, p_decision: decision, p_reason: reason });

export const markPaid = (adminId: string, id: string, reference: string | null) =>
  rpc<WithdrawalRow>("withdrawal_mark_paid", { p_admin_id: adminId, p_withdrawal_id: id, p_reference: reference });

export const updateSetting = (adminId: string, key: string, value: number | boolean) =>
  rpc("admin_update_setting", { p_admin_id: adminId, p_key: key, p_value: value });

export async function readSettings() {
  const { data, error } = await db().from("settings").select("key, value")
    .in("key", ["min_withdrawal_amount", "withdrawal_cooldown_days", "withdrawal_fee_percent", "referral_reward_amount", "required_funded_referrals", "maintenance_mode"])
    .is("deleted_at", null);
  if (error) throw fromDbError(error);
  const map = new Map((data ?? []).map((r) => [r.key as string, r.value]));
  return {
    minWithdrawalAmount: Number(map.get("min_withdrawal_amount") ?? 0),
    withdrawalCooldownDays: Number(map.get("withdrawal_cooldown_days") ?? 7),
    withdrawalFeePercent: Number(map.get("withdrawal_fee_percent") ?? 0),
    referralRewardAmount: Number(map.get("referral_reward_amount") ?? 1000),
    requiredFundedReferrals: Number(map.get("required_funded_referrals") ?? 10),
    maintenanceMode: map.get("maintenance_mode") === true,
  };
}

export async function currencies(walletIds: string[]): Promise<Map<string, string>> {
  if (walletIds.length === 0) return new Map();
  const { data, error } = await db().from("wallets").select("id, currency").in("id", walletIds);
  if (error) throw fromDbError(error);
  return new Map((data ?? []).map((w) => [w.id as string, String(w.currency).trim()]));
}
