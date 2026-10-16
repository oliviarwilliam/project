import type { SupabaseClient } from "@supabase/supabase-js";
import { WalletError, type WalletErrorCode } from "./errors";
import * as repo from "./wallet.repository";
import * as withdrawalRepo from "@/services/withdrawals/withdrawal.repository";
import type { Eligibility } from "@/services/withdrawals/types";
import type { Page, Wallet, WalletSummary, WalletTransaction } from "./types";
import {
  decodeCursor, encodeCursor, parseAmount, parseCurrency, parseDestination, parseDirection,
  parseIdempotencyKey, parseLimit, parseText, parseTxnType, parseUuid, parseWithdrawalSource,
} from "./validation";

// Keys are scoped by user and action, so one member can never replay another's request.
const scopeKey = (owner: string, action: string, key: string) => `${owner}:${action}:${key}`;

async function requireWallet(db: SupabaseClient, currency?: string): Promise<Wallet> {
  const wallet = await repo.findWallet(db, currency);
  if (!wallet) throw new WalletError("WALLET_NOT_FOUND");
  return wallet;
}

// ---- Reads (run as the signed in member) ----

export async function getOverview(db: SupabaseClient, currency?: string) {
  const wallet = await requireWallet(db, currency ? parseCurrency(currency) : undefined);
  const summary: WalletSummary = await repo.fetchSummary(db, wallet.id);
  return { wallet, summary };
}

export async function listTransactions(
  db: SupabaseClient,
  input: { currency?: string; type?: unknown; limit?: unknown; cursor?: string | null },
): Promise<Page<WalletTransaction>> {
  const wallet = await requireWallet(db, input.currency ? parseCurrency(input.currency) : undefined);
  const limit = parseLimit(input.limit);
  const rows = await repo.fetchHistory(db, {
    walletId: wallet.id,
    type: parseTxnType(input.type),
    limit: limit + 1,
    before: input.cursor ? decodeCursor(input.cursor) : null,
  });

  const items = rows.slice(0, limit);
  const last = items.at(-1);
  const hasMore = rows.length > limit && last !== undefined;
  return { items, nextCursor: hasMore ? encodeCursor(last.created_at, last.id) : null };
}

export async function getTransaction(db: SupabaseClient, id: unknown): Promise<WalletTransaction> {
  const txn = await repo.findTransaction(db, parseUuid(id, "id"));
  if (!txn) throw new WalletError("TRANSACTION_NOT_FOUND");
  return txn;
}

// ---- Member actions ----

export function purchasePackage(userId: string, input: { packageId: unknown; idempotencyKey: string | null }) {
  return repo.purchasePackage({
    userId,
    packageId: parseUuid(input.packageId, "packageId"),
    key: scopeKey(userId, "purchase", parseIdempotencyKey(input.idempotencyKey)),
  });
}

export function requestWithdrawal(
  userId: string,
  input: { amount: unknown; currency?: unknown; method: unknown; destination: unknown; idempotencyKey: string | null; fundingSource?: unknown },
) {
  const currency = input.currency === undefined ? "NGN" : parseCurrency(input.currency);
  const fundingSource = parseWithdrawalSource(input.fundingSource);
  const amount = parseAmount(input.amount);
  return repo.requestWithdrawal({
    userId,
    currency,
    amount,
    method: parseText(input.method, "method", 2, 40),
    destination: parseDestination(input.destination),
    key: scopeKey(userId, "withdrawal", parseIdempotencyKey(input.idempotencyKey)),
    fundingSource,
  }).catch(async (error: unknown) => {
    if (!(error instanceof WalletError)) throw error;

    // The database remains authoritative. Read the same eligibility snapshot only
    // when needed to make its reason actionable for the member.
    let eligibility: Eligibility | null = null;
    if (["WITHDRAWAL_COOLDOWN", "BELOW_MIN_WITHDRAWAL", "NO_PROFIT_AVAILABLE", "EXCEEDS_PROFIT_BALANCE", "REFERRALS_REQUIRED", "REFERRAL_REWARD_INSUFFICIENT"].includes(error.code)) {
      try {
        eligibility = await withdrawalRepo.eligibility(userId, currency);
      } catch {
        // Keep the original, safe error if the supplementary eligibility read fails.
      }
    }

    const date = (value: string | null | undefined) => value
      ? new Intl.DateTimeFormat("en-NG", { dateStyle: "long", timeStyle: "short", timeZone: "Africa/Lagos" }).format(new Date(value))
      : null;
    const naira = (value: number) => `₦${new Intl.NumberFormat("en-NG", { maximumFractionDigits: 2 }).format(value)}`;

    if (error.code === "WITHDRAWAL_COOLDOWN") {
      const nextDate = date(fundingSource === "referral" ? eligibility?.next_referral_eligible_at : eligibility?.next_eligible_at);
      if (nextDate) throw new WalletError(error.code, `Your next ${fundingSource} withdrawal is available on ${nextDate}.`);
    }
    if (error.code === "BELOW_MIN_WITHDRAWAL" && eligibility) {
      throw new WalletError(error.code, `Enter at least ${naira(eligibility.min_amount)} to withdraw.`);
    }
    if (error.code === "NO_PROFIT_AVAILABLE" && eligibility) {
      throw new WalletError(error.code, `Your available profit is ${naira(eligibility.available_profit)}. Wait until it reaches the minimum withdrawal amount of ${naira(eligibility.min_amount)} before withdrawing.`);
    }
    if (error.code === "EXCEEDS_PROFIT_BALANCE" && eligibility) {
      throw new WalletError(error.code, `Your available profit is ${naira(eligibility.available_profit)}, below the ${naira(amount)} you entered. Wait until your available profit reaches ${naira(amount)} before withdrawing.`);
    }
    if (error.code === "REFERRALS_REQUIRED" && eligibility) {
      const remaining = Math.max(0, eligibility.required_referrals - eligibility.qualified_referrals);
      throw new WalletError(error.code, `You have ${eligibility.qualified_referrals} of ${eligibility.required_referrals} funded referrals. ${remaining} more are needed to withdraw referral rewards.`);
    }
    if (error.code === "REFERRAL_REWARD_INSUFFICIENT" && eligibility) {
      throw new WalletError(error.code, `Your available referral rewards are ${naira(eligibility.available_referral_rewards)}. Enter that amount or less.`);
    }
    throw error;
  });
}

// ---- Trusted callers (payment webhook, scheduled job, admins) ----

export function recordDeposit(input: { userId: unknown; currency: unknown; amount: unknown; eventId: unknown }) {
  const eventId = parseText(input.eventId, "event_id", 4, 128);
  return repo.deposit({
    userId: parseUuid(input.userId, "user_id"),
    currency: parseCurrency(input.currency),
    amount: parseAmount(input.amount),
    key: `deposit:${eventId}`,
    metadata: { provider_event_id: eventId },
  });
}

export function adminAdjust(
  adminId: string,
  walletId: unknown,
  input: { direction: unknown; amount: unknown; reason: unknown; idempotencyKey: string | null },
) {
  return repo.adminAdjust({
    adminId,
    walletId: parseUuid(walletId, "walletId"),
    direction: parseDirection(input.direction),
    amount: parseAmount(input.amount),
    reason: parseText(input.reason, "reason", 5, 300),
    key: scopeKey(adminId, "adjust", parseIdempotencyKey(input.idempotencyKey)),
  });
}

export async function reconcile(walletId: unknown) {
  const result = await repo.reconcile(parseUuid(walletId, "walletId"));
  if (!result) throw new WalletError("WALLET_NOT_FOUND");
  return result;
}

// ---- Package purchases ----

// Step 2 of the flow, without changing anything: can this member buy this package right now?
export async function previewPurchase(db: SupabaseClient, packageId: unknown) {
  const id = parseUuid(packageId, "packageId");
  const pkg = await repo.findBuyablePackage(db, id);
  if (!pkg) throw new WalletError("PACKAGE_UNAVAILABLE");

  const currency = pkg.currency.trim();
  const wallet = await requireWallet(db, currency);
  const owned = await repo.countOwnedActive(db, id);
  const price = Number(pkg.price);

  let blockedBy: WalletErrorCode | null = null;
  if (pkg.max_per_user !== null && owned >= pkg.max_per_user) blockedBy = "PACKAGE_LIMIT_REACHED";
  else if (wallet.balance < price) blockedBy = "INSUFFICIENT_FUNDS";

  return {
    package: { id: pkg.id, name: pkg.name, price, currency },
    balance: wallet.balance,
    shortfall: Math.max(0, Math.round((price - wallet.balance) * 100) / 100),
    ownedCount: owned,
    maxPerUser: pkg.max_per_user,
    canPurchase: blockedBy === null,
    blockedBy,
  };
}

export async function listPurchases(db: SupabaseClient, status?: unknown) {
  const filter = status === undefined || status === null || status === "" ? null : String(status);
  if (filter && !["active", "completed", "cancelled"].includes(filter)) {
    throw new WalletError("VALIDATION_ERROR", "status must be active, completed or cancelled.");
  }
  const rows = await repo.fetchPurchases(db, filter);
  return rows.map((r) => ({
    id: r.id as string,
    packageId: r.package_id as string,
    packageName: (r.packages?.name ?? "Package") as string,
    amount: Number(r.amount),
    dailyProfit: Math.round((Number(r.amount) * Number(r.return_rate) / r.payout_interval_days) * 100) / 100,
    status: r.status as string,
    startsAt: r.starts_at as string,
    endsAt: r.ends_at as string,
    nextPayoutAt: (r.next_payout_at ?? null) as string | null,
    purchaseTransactionId: r.purchase_txn_id as string,
    purchasedAt: r.created_at as string,
  }));
}
