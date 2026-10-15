import type { NextRequest } from "next/server";
import { ok, route } from "@/lib/api/http";
import { requireAdmin } from "@/lib/api/auth";
import { USER_ROLES } from "@/lib/admin-roles";
import * as admin from "@/services/admin";

// GET /api/admin/users?q=ada@mail.com&status=active&page=1&pageSize=20
// q matches email, name, or a full user id.
export const GET = route(async (request: NextRequest) => {
  await requireAdmin(USER_ROLES);
  const q = request.nextUrl.searchParams;
  return ok(await admin.searchUsers({ q: q.get("q"), status: q.get("status"), page: q.get("page"), pageSize: q.get("pageSize") }));
});
