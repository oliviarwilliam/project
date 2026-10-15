import { createAdminClient } from "@/lib/supabase/admin";
import { fromDbError } from "@/services/wallet/errors";
import type { WalletTransaction } from "@/services/wallet";
import type { Overview, UserDetail, UserListItem } from "./types";

// Every call here uses the service role. The API routes and pages check the admin's role first.
const db = () => createAdminClient();

async function rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await db().rpc(name, args);
  if (error) throw fromDbError(error);
  return data as T;
}

export const overview = (currency: string | null) => rpc<Overview>("admin_overview", { p_currency: currency });
export const financials = (days: number, currency: string | null) =>
  rpc<{ currency: string; days: number; series: unknown[] }>("admin_financials", { p_days: days, p_currency: currency });

export const searchUsers = (search: string, status: string | null, limit: number, offset: number) =>
  rpc<{ total: number; rows: UserListItem[] }>("admin_search_users", { p_search: search || null, p_status: status, p_limit: limit, p_offset: offset });

export const userDetail = (id: string) => rpc<UserDetail>("admin_user_detail", { p_user_id: id });

export const userTransactions = (id: string, a: { type: string | null; limit: number; before: { createdAt: string; id: string } | null }) =>
  rpc<WalletTransaction[]>("admin_user_transactions", {
    p_user_id: id, p_type: a.type, p_limit: a.limit,
    p_before: a.before?.createdAt ?? null, p_before_id: a.before?.id ?? null,
  });

export const setUserStatus = (adminId: string, userId: string, status: "active" | "suspended", reason: string | null) =>
  rpc<{ id: string; status: string; changed: boolean }>("admin_set_user_status", {
    p_admin_id: adminId, p_user_id: userId, p_status: status, p_reason: reason,
  });

export const auditLogs = (action: string | null, limit: number, before: { createdAt: string; id: string } | null) =>
  rpc<Record<string, any>[]>("admin_audit_logs", {
    p_action: action, p_limit: limit, p_before: before?.createdAt ?? null, p_before_id: before?.id ?? null,
  });

// Admins and members shown by email in the audit log.
export async function actorEmails(userIds: string[], adminIds: string[]) {
  const [users, admins] = await Promise.all([
    userIds.length ? db().from("users").select("id, email").in("id", userIds) : Promise.resolve({ data: [], error: null }),
    adminIds.length ? db().from("admin_users").select("id, role, user_id").in("id", adminIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (users.error) throw fromDbError(users.error);
  if (admins.error) throw fromDbError(admins.error);

  const adminUserIds = (admins.data ?? []).map((a) => a.user_id as string);
  const adminUsers = adminUserIds.length ? await db().from("users").select("id, email").in("id", adminUserIds) : { data: [], error: null };
  const emailById = new Map([...(users.data ?? []), ...(adminUsers.data ?? [])].map((u) => [u.id as string, String(u.email)]));

  return {
    user: new Map((users.data ?? []).map((u) => [u.id as string, String(u.email)])),
    admin: new Map((admins.data ?? []).map((a) => [a.id as string, `${emailById.get(a.user_id as string) ?? "admin"} (${a.role})`])),
  };
}

// Suspending also blocks sign in. Reactivating lifts the block.
export async function setAuthBan(userId: string, banned: boolean) {
  const { error } = await db().auth.admin.updateUserById(userId, { ban_duration: banned ? "876000h" : "none" });
  return !error;
}
