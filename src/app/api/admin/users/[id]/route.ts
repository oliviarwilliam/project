import type { NextRequest } from "next/server";
import { ok, route } from "@/lib/api/http";
import { requireAdmin } from "@/lib/api/auth";
import { USER_ROLES } from "@/lib/admin-roles";
import * as admin from "@/services/admin";

type Context = { params: Promise<{ id: string }> };

// GET /api/admin/users/:id  ->  profile, wallets, totals, active packages
export const GET = route(async (_request: NextRequest, { params }: Context) => {
  await requireAdmin(USER_ROLES);
  return ok(await admin.userDetail((await params).id));
});
