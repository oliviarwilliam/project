import type { NextRequest } from "next/server";
import { ok, route } from "@/lib/api/http";
import { requireAdmin } from "@/lib/api/auth";
import { ALL_ADMIN_ROLES } from "@/lib/admin-roles";
import * as admin from "@/services/admin";

// GET /api/admin/overview?currency=NGN
export const GET = route(async (request: NextRequest) => {
  await requireAdmin(ALL_ADMIN_ROLES);
  return ok(await admin.overview(request.nextUrl.searchParams.get("currency") || undefined));
});
