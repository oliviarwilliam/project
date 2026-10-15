import { logger } from "@/lib/logger";
import { WalletError, type Page } from "@/services/wallet";
import {
  decodeCursor, encodeCursor, parseCurrency, parseLimit, parseText, parseTxnType, parseUuid,
} from "@/services/wallet/validation";
import * as repo from "./admin.repository";
import type { AuditEntry, Financials, FinancialDay, Overview, UserDetail, UserListItem, WalletTransaction } from "./types";
import { createAdminClient } from "@/lib/supabase/admin";

const invalid = (message: string) => new WalletError("VALIDATION_ERROR", message);
const money = (n: number) => Math.round(n * 100) / 100;

// ---- Overview and analytics ----

export const overview = (currency?: unknown): Promise<Overview> =>
  repo.overview(currency ? parseCurrency(currency) : null);

export async function financials(days?: unknown, currency?: unknown): Promise<Financials> {
  const n = days === undefined || days === null || days === "" ? 30 : Number(days);
  if (!Number.isInteger(n) || n < 1 || n > 365) throw invalid("days must be from 1 to 365.");

  const raw = await repo.financials(n, currency ? parseCurrency(currency) : null);
  const series = raw.series as FinancialDay[];
  const sum = (key: keyof Omit<FinancialDay, "day">) => money(series.reduce((total, d) => total + Number(d[key]), 0));
  const totals = { deposits: sum("deposits"), withdrawals: sum("withdrawals"), purchases: sum("purchases"), profit: sum("profit"), refunds: sum("refunds") };
  return { currency: raw.currency, days: raw.days, series, totals: { ...totals, net: money(totals.deposits - totals.withdrawals + totals.refunds) } };
}

// ---- Users ----

export async function searchUsers(input: { q?: string | null; status?: string | null; page?: unknown; pageSize?: unknown }) {
  const q = (input.q ?? "").trim().slice(0, 100);
  const status = input.status || null;
  if (status && !["active", "suspended", "closed"].includes(status)) throw invalid("Unknown status.");

  const pageSize = parseLimit(input.pageSize);
  const page = input.page === undefined || input.page === null || input.page === "" ? 1 : Number(input.page);
  if (!Number.isInteger(page) || page < 1 || page > 10000) throw invalid("page must be 1 or more.");

  const result = await repo.searchUsers(q, status, pageSize, (page - 1) * pageSize);
  return { total: result.total, page, pageSize, rows: result.rows as UserListItem[] };
}

export const userDetail = (id: unknown): Promise<UserDetail> => repo.userDetail(parseUuid(id, "id"));

export async function userTransactions(
  id: unknown,
  input: { type?: unknown; limit?: unknown; cursor?: string | null },
): Promise<Page<WalletTransaction>> {
  const limit = parseLimit(input.limit);
  const rows = await repo.userTransactions(parseUuid(id, "id"), {
    type: parseTxnType(input.type), limit: limit + 1, before: input.cursor ? decodeCursor(input.cursor) : null,
  });
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  return { items, nextCursor: rows.length > limit && last ? encodeCursor(last.created_at, last.id) : null };
}

export async function suspendUser(adminId: string, id: unknown, reason: unknown) {
  const userId = parseUuid(id, "id");
  const result = await repo.setUserStatus(adminId, userId, "suspended", parseText(reason, "reason", 5, 300));
  const signInBlocked = result.changed ? await repo.setAuthBan(userId, true) : true;
  if (!signInBlocked) logger.error("user.suspend.ban_failed", { userId, adminId });
  logger.info("user.suspended", { userId, adminId });
  return { ...result, signInBlocked };
}

export async function reactivateUser(adminId: string, id: unknown) {
  const userId = parseUuid(id, "id");
  const result = await repo.setUserStatus(adminId, userId, "active", null);
  const signInRestored = result.changed ? await repo.setAuthBan(userId, false) : true;
  if (!signInRestored) logger.error("user.reactivate.unban_failed", { userId, adminId });
  logger.info("user.reactivated", { userId, adminId });
  return { ...result, signInRestored };
}

export async function deleteUser(adminId: string, id: unknown) {
  const userId = parseUuid(id, "id");
  const target = await repo.assertUserCanBeDeleted(adminId, userId);
  const auth = createAdminClient().auth.admin;
  const { data, error: lookupError } = await auth.getUserById(userId);
  if (lookupError || !data.user) throw new WalletError("USER_NOT_FOUND");

  const old = data.user;
  const oldBanUntil = old.banned_until ? Date.parse(old.banned_until) : 0;
  const priorBan = oldBanUntil > Date.now() ? `${Math.max(1, Math.ceil((oldBanUntil - Date.now()) / 3_600_000))}h` : "none";
  const { error: disableError } = await auth.updateUserById(userId, {
    email: `deleted+${userId}@redacted.invalid`,
    phone: "",
    user_metadata: {},
    ban_duration: "876000h",
  });
  if (disableError) throw new WalletError("INTERNAL_ERROR", "Could not disable sign-in for this account.");

  try {
    const result = await repo.deleteUser(adminId, userId);
    logger.info("user.deleted", { userId, adminId });
    return result;
  } catch (error) {
    const { error: restoreError } = await auth.updateUserById(userId, {
      email: old.email,
      phone: old.phone ?? "",
      user_metadata: old.user_metadata ?? {},
      ban_duration: priorBan,
    });
    if (restoreError) logger.error("user.delete.rollback_failed", { userId, adminId, message: restoreError.message, status: target.status });
    throw error;
  }
}

// ---- Audit logs ----

export async function auditLogs(input: { action?: string | null; limit?: unknown; cursor?: string | null }): Promise<Page<AuditEntry>> {
  const action = input.action ? input.action.trim() : null;
  if (action && !/^[a-z_.]{1,40}$/.test(action)) throw invalid("action filter is not valid.");

  const limit = parseLimit(input.limit);
  const rows = await repo.auditLogs(action, limit + 1, input.cursor ? decodeCursor(input.cursor) : null);
  const page = rows.slice(0, limit);

  const emails = await repo.actorEmails(
    [...new Set(page.map((r) => r.actor_user_id).filter(Boolean))],
    [...new Set(page.map((r) => r.actor_admin_id).filter(Boolean))],
  );

  const items: AuditEntry[] = page.map((r) => ({
    id: r.id, action: r.action, entityTable: r.entity_table, entityId: r.entity_id,
    actorType: r.actor_type,
    actorLabel: r.actor_admin_id ? (emails.admin.get(r.actor_admin_id) ?? "admin")
      : r.actor_user_id ? (emails.user.get(r.actor_user_id) ?? "member") : "system",
    oldData: r.old_data, newData: r.new_data, createdAt: r.created_at,
  }));

  const last = page.at(-1);
  return { items, nextCursor: rows.length > limit && last ? encodeCursor(last.created_at, last.id) : null };
}
