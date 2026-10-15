import type { NextRequest } from "next/server";
import { ok, readJson, route } from "@/lib/api/http";
import { requireAdmin } from "@/lib/api/auth";
import * as packages from "@/services/packages";

const ROLES = ["super_admin", "admin"] as const;

// GET /api/admin/packages  ->  every live package with owner counts
export const GET = route(async () => {
  await requireAdmin(ROLES);
  return ok(await packages.adminList());
});

// POST /api/admin/packages
// { name, price, dailyProfitPercent, durationDays, status?, description?, currency?, maxPerUser?, sortOrder? }
export const POST = route(async (request: NextRequest) => {
  const { adminId } = await requireAdmin(ROLES);
  return ok(await packages.create(adminId, await readJson(request)), 201);
});
