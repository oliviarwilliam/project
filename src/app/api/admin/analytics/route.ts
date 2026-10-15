import type { NextRequest } from "next/server";
import { ok, route } from "@/lib/api/http";
import { requireAdmin } from "@/lib/api/auth";
import { FINANCE_ROLES } from "@/lib/admin-roles";
import * as admin from "@/services/admin";

// GET /api/admin/analytics?days=30&currency=NGN  ->  daily deposits, withdrawals, purchases, profit, refunds
export const GET = route(async (request: NextRequest) => {
  await requireAdmin(FINANCE_ROLES);
  const q = request.nextUrl.searchParams;
  return ok(await admin.financials(q.get("days") ?? undefined, q.get("currency") || undefined));
});
