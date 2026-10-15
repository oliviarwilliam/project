import type { NextRequest } from "next/server";
import { ok, route } from "@/lib/api/http";
import { requireAdmin } from "@/lib/api/auth";
import * as withdrawals from "@/services/withdrawals";

// GET /api/admin/withdrawals?status=pending&limit=50  ->  review queue (oldest first when pending)
export const GET = route(async (request: NextRequest) => {
  await requireAdmin(["super_admin", "admin", "finance"]);
  const q = request.nextUrl.searchParams;
  return ok(await withdrawals.adminList(q.get("status"), q.get("limit")));
});
