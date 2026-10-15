import { createAdminClient } from "@/lib/supabase/admin";
import { fromDbError } from "@/services/wallet/errors";
import type { NewPackage, PackageRow, PackageStatus } from "./types";

// Reads use the service role so admins also see drafts and disabled packages.
// Writes call the admin_* database functions, which check the admin and write the audit log.
const db = () => createAdminClient();
const PUBLIC_COLUMNS =
  "id, slug, name, description, price, currency, return_rate, payout_interval_days, duration_days, max_per_user, sort_order, status, created_at, updated_at";

export async function listActive(): Promise<PackageRow[]> {
  const { data, error } = await db().from("packages").select(PUBLIC_COLUMNS).eq("status", "active").is("deleted_at", null).order("sort_order");
  if (error) throw fromDbError(error);
  return (data ?? []) as PackageRow[];
}

export async function listAdmin(): Promise<PackageRow[]> {
  const { data, error } = await db().from("package_stats").select("*").order("sort_order").order("created_at");
  if (error) throw fromDbError(error);
  return (data ?? []) as PackageRow[];
}

export async function findAdmin(id: string): Promise<PackageRow | null> {
  const { data, error } = await db().from("package_stats").select("*").eq("id", id).maybeSingle();
  if (error) throw fromDbError(error);
  return data as PackageRow | null;
}

async function call(name: string, args: Record<string, unknown>): Promise<PackageRow> {
  const { data, error } = await db().rpc(name, args);
  if (error) throw fromDbError(error);
  return data as PackageRow;
}

export const create = (adminId: string, p: NewPackage) =>
  call("admin_create_package", {
    p_admin_id: adminId, p_name: p.name, p_price: p.price, p_daily_profit_percent: p.dailyProfitPercent,
    p_duration_days: p.durationDays, p_status: p.status, p_description: p.description,
    p_currency: p.currency, p_max_per_user: p.maxPerUser, p_sort_order: p.sortOrder,
  });

export const update = (adminId: string, id: string, changes: Record<string, unknown>) =>
  call("admin_update_package", { p_admin_id: adminId, p_package_id: id, p_changes: changes });

export const setStatus = (adminId: string, id: string, status: PackageStatus) =>
  call("admin_set_package_status", { p_admin_id: adminId, p_package_id: id, p_status: status });

export const remove = (adminId: string, id: string) =>
  call("admin_delete_package", { p_admin_id: adminId, p_package_id: id });
