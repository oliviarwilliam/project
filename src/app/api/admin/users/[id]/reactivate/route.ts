import type { NextRequest } from "next/server";
import { ok, route } from "@/lib/api/http";
import { requireAdmin } from "@/lib/api/auth";
import { MANAGE_ROLES } from "@/lib/admin-roles";
import * as admin from "@/services/admin";

type Context = { params: Promise<{ id: string }> };

export const POST = route(async (_request: NextRequest, { params }: Context) => {
  const { adminId } = await requireAdmin(MANAGE_ROLES);
  return ok(await admin.reactivateUser(adminId, (await params).id));
});
