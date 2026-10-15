import type { NextRequest } from "next/server";
import { ok, route } from "@/lib/api/http";
import { requireAdmin } from "@/lib/api/auth";
import * as earnings from "@/services/earnings";

const ROLES = ["super_admin", "admin", "finance"] as const;

// GET /api/admin/earnings/runs?limit=20  ->  recent runs with counts, totals and failures
export const GET = route(async (request: NextRequest) => {
  await requireAdmin(ROLES);
  return ok(await earnings.listRuns(request.nextUrl.searchParams.get("limit")));
});

// POST /api/admin/earnings/runs  ->  run the engine now
export const POST = route(async () => {
  await requireAdmin(ROLES);
  return ok(await earnings.runDailyEarnings("manual"), 201);
});
