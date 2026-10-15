import type { NextRequest } from "next/server";
import { ok, route } from "@/lib/api/http";
import { requireAdmin } from "@/lib/api/auth";
import { USER_ROLES } from "@/lib/admin-roles";
import * as admin from "@/services/admin";

type Context = { params: Promise<{ id: string }> };

// GET /api/admin/users/:id/transactions?type=deposit&limit=20&cursor=...
export const GET = route(async (request: NextRequest, { params }: Context) => {
  await requireAdmin(USER_ROLES);
  const q = request.nextUrl.searchParams;
  return ok(await admin.userTransactions((await params).id, { type: q.get("type"), limit: q.get("limit"), cursor: q.get("cursor") }));
});
