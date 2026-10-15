import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { fromDbError } from "./errors";
import type { Reconciliation, TxnType, Wallet, WalletSummary, WalletTransaction } from "./types";

// Reads use the caller's own client, so row level security decides what they see.
// Writes call database functions with the service role, after the caller is checked.

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await createAdminClient().rpc(name, args);
  if (error) throw fromDbError(error);
  return data as T;
}

export async function findWallet(db: SupabaseClient, currency?: string): Promise<Wallet | null> {
  let query = db.from("wallets").select("*").is("deleted_at", null).order("created_at").limit(1);
  if (currency) query = query.eq("currency", currency);
  const { data, error } = await query.maybeSingle();
  if (error) throw fromDbError(error);
  return data as Wallet | null;
}

export async function fetchSummary(db: SupabaseClient, walletId: string): Promise<WalletSummary> {
  const { data, error } = await db.rpc("wallet_summary", { p_wallet_id: walletId });
  if (error) throw fromDbError(error);
  return data as WalletSummary;
}

export async function fetchHistory(
  db: SupabaseClient,
  args: { walletId: string; type: TxnType | null; limit: number; before: { createdAt: string; id: string } | null },
): Promise<WalletTransaction[]> {
  const { data, error } = await db.rpc("wallet_history", {
    p_wallet_id: args.walletId,
    p_type: args.type,
    p_limit: args.limit,
    p_before_created: args.before?.createdAt ?? null,
    p_before_id: args.before?.id ?? null,
  });
  if (error) throw fromDbError(error);
  return data as WalletTransaction[];
}

export async function findTransaction(db: SupabaseClient, id: string): Promise<WalletTransaction | null> {
  const { data, error } = await db.from("wallet_transactions").select("*").eq("id", id).maybeSingle();
  if (error) throw fromDbError(error);
  return data as WalletTransaction | null;
}

export const deposit = (args: { userId: string; currency: string; amount: number; key: string; metadata: object }) =>
  rpc("wallet_deposit", {
    p_user_id: args.userId, p_currency: args.currency, p_amount: args.amount,
    p_idempotency_key: args.key, p_metadata: args.metadata,
  });

export const purchasePackage = (args: { userId: string; packageId: string; key: string }) =>
  rpc("wallet_purchase_package", {
    p_user_id: args.userId, p_package_id: args.packageId, p_idempotency_key: args.key,
  });

export const requestWithdrawal = (args: {
  userId: string; currency: string; amount: number; method: string; destination: object; key: string;
}) =>
  rpc("wallet_request_withdrawal", {
    p_user_id: args.userId, p_currency: args.currency, p_amount: args.amount,
    p_method: args.method, p_destination: args.destination, p_idempotency_key: args.key,
  });

export const adminAdjust = (args: {
  adminId: string; walletId: string; direction: string; amount: number; reason: string; key: string;
}) =>
  rpc("wallet_admin_adjust", {
    p_admin_id: args.adminId, p_wallet_id: args.walletId, p_direction: args.direction,
    p_amount: args.amount, p_reason: args.reason, p_idempotency_key: args.key,
  });

export async function reconcile(walletId: string): Promise<Reconciliation | null> {
  const rows = await rpc<Reconciliation[]>("wallet_reconcile", { p_wallet_id: walletId });
  return rows[0] ?? null;
}

// ---- Purchase reads (run as the signed in member, so row level security applies) ----

export async function findBuyablePackage(db: SupabaseClient, id: string) {
  const { data, error } = await db
    .from("packages")
    .select("id, name, price, currency, max_per_user")
    .eq("id", id).eq("status", "active").is("deleted_at", null)
    .maybeSingle();
  if (error) throw fromDbError(error);
  return data as { id: string; name: string; price: number; currency: string; max_per_user: number | null } | null;
}

export async function countOwnedActive(db: SupabaseClient, packageId: string): Promise<number> {
  const { count, error } = await db
    .from("user_packages")
    .select("id", { count: "exact", head: true })
    .eq("package_id", packageId).eq("status", "active").is("deleted_at", null);
  if (error) throw fromDbError(error);
  return count ?? 0;
}

export async function fetchPurchases(db: SupabaseClient, status: string | null) {
  let query = db
    .from("user_packages")
    .select("id, package_id, purchase_txn_id, amount, return_rate, payout_interval_days, starts_at, ends_at, next_payout_at, status, created_at, packages(name)")
    .is("deleted_at", null).order("created_at", { ascending: false }).limit(100);
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) throw fromDbError(error);
  return (data ?? []) as any[];
}
