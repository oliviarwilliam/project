import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";
import { WalletError } from "@/services/wallet/errors";
import { parseCurrency, parseLimit, parseUuid } from "@/services/wallet/validation";
import * as repo from "./withdrawal.repository";
import type { AdminWithdrawal, Eligibility, Withdrawal, WithdrawalRow } from "./types";
import { parseReason, parseReference, parseSettings, parseStatusFilter } from "./validation";

// Requesting a withdrawal is wallets.requestWithdrawal (src/services/wallet). The database
// function enforces the rules. This module adds the checks, history and admin review.

const toWithdrawal = (r: WithdrawalRow): Withdrawal => ({
  id: r.id, amount: Number(r.amount), fee: Number(r.fee), netAmount: Number(r.net_amount),
  method: r.method, status: r.status, rejectionReason: r.rejection_reason,
  reviewedAt: r.reviewed_at, processedAt: r.processed_at, createdAt: r.created_at,
});

// ---- Member ----

export async function getEligibility(userId: string, currency?: unknown): Promise<Eligibility> {
  const code = currency ? parseCurrency(currency) : await repo.firstCurrency(userId);
  if (!code) throw new WalletError("WALLET_NOT_FOUND");
  return repo.eligibility(userId, code);
}

export async function listMine(client: SupabaseClient, limit?: unknown): Promise<Withdrawal[]> {
  return (await repo.listMine(client, parseLimit(limit))).map(toWithdrawal);
}

// ---- Admin (callers must check the admin first) ----

export async function adminList(status: unknown, limit?: unknown): Promise<AdminWithdrawal[]> {
  const rows = await repo.listQueue(parseStatusFilter(status) ?? "pending", parseLimit(limit));
  const [emails, currencies] = await Promise.all([
    repo.emails([...new Set(rows.map((r) => r.user_id))]),
    repo.currencies([...new Set(rows.map((r) => r.wallet_id))]),
  ]);
  return rows.map((r) => ({
    ...toWithdrawal(r),
    currency: currencies.get(r.wallet_id) ?? "NGN",
    userId: r.user_id,
    userEmail: emails.get(r.user_id) ?? null,
    destination: r.destination,
    externalReference: r.external_reference,
  }));
}

export async function approve(adminId: string, id: unknown) {
  const row = await repo.review(adminId, parseUuid(id, "id"), "approve", null);
  logger.info("withdrawal.approved", { withdrawalId: row.id, adminId });
  return toWithdrawal(row);
}

// Rejecting returns the held money to the member's wallet in the same transaction.
export async function reject(adminId: string, id: unknown, reason: unknown) {
  const row = await repo.review(adminId, parseUuid(id, "id"), "reject", parseReason(reason));
  logger.info("withdrawal.rejected", { withdrawalId: row.id, adminId });
  return toWithdrawal(row);
}

export async function markPaid(adminId: string, id: unknown, reference: unknown) {
  const row = await repo.markPaid(adminId, parseUuid(id, "id"), parseReference(reference));
  logger.info("withdrawal.paid", { withdrawalId: row.id, adminId });
  return toWithdrawal(row);
}

// ---- Configurable rules ----

export const getSettings = () => repo.readSettings();

export async function updateSettings(adminId: string, body: Record<string, unknown>) {
  for (const { key, value } of parseSettings(body)) await repo.updateSetting(adminId, key, value);
  logger.info("withdrawal.settings_updated", { adminId, keys: Object.keys(body) });
  return repo.readSettings();
}
