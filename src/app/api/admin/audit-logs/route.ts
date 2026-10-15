import type { NextRequest } from "next/server";
import { ok, route } from "@/lib/api/http";
import { requireAdmin } from "@/lib/api/auth";
import { MANAGE_ROLES } from "@/lib/admin-roles";
import * as admin from "@/services/admin";

// GET /api/admin/audit-logs?action=withdrawal.&limit=30&cursor=...
// action is a prefix, for example wallet. or package. or user.suspended
export const GET = route(async (request: NextRequest) => {
  await requireAdmin(MANAGE_ROLES);
  const q = request.nextUrl.searchParams;
  return ok(await admin.auditLogs({ action: q.get("action"), limit: q.get("limit"), cursor: q.get("cursor") }));
});
