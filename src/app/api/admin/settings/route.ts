import type { NextRequest } from "next/server";
import { ok, readJson, route } from "@/lib/api/http";
import { requireAdmin } from "@/lib/api/auth";
import { MANAGE_ROLES } from "@/lib/admin-roles";
import * as withdrawals from "@/services/withdrawals";

// GET   ->  { minWithdrawalAmount, withdrawalCooldownDays, withdrawalFeePercent, maintenanceMode }
// PATCH any of those fields. Each change is range checked and audited.
// (/api/admin/settings/withdrawals still works and does the same thing.)
export const GET = route(async () => {
  await requireAdmin(MANAGE_ROLES);
  return ok(await withdrawals.getSettings());
});

export const PATCH = route(async (request: NextRequest) => {
  const { adminId } = await requireAdmin(MANAGE_ROLES);
  return ok(await withdrawals.updateSettings(adminId, await readJson(request)));
});
