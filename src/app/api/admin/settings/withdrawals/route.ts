import type { NextRequest } from "next/server";
import { ok, readJson, route } from "@/lib/api/http";
import { requireAdmin } from "@/lib/api/auth";
import * as withdrawals from "@/services/withdrawals";

const ROLES = ["super_admin", "admin"] as const;

// GET  ->  { minWithdrawalAmount, withdrawalCooldownDays, withdrawalFeePercent }
export const GET = route(async () => {
  await requireAdmin(ROLES);
  return ok(await withdrawals.getSettings());
});

// PATCH any of the three fields. Each change is saved with an audit log.
export const PATCH = route(async (request: NextRequest) => {
  const { adminId } = await requireAdmin(ROLES);
  return ok(await withdrawals.updateSettings(adminId, await readJson(request)));
});
