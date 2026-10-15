import type { NextRequest } from "next/server";
import { ok, readJson, route } from "@/lib/api/http";
import { requireAdmin } from "@/lib/api/auth";
import { MANAGE_ROLES } from "@/lib/admin-roles";
import * as admin from "@/services/admin";

type Context = { params: Promise<{ id: string }> };

// POST { "reason": "..." }  Blocks purchases and withdrawals at once, and blocks sign in.
export const POST = route(async (request: NextRequest, { params }: Context) => {
  const { adminId } = await requireAdmin(MANAGE_ROLES);
  const body = await readJson(request);
  return ok(await admin.suspendUser(adminId, (await params).id, body.reason));
});
