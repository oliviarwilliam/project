import type { NextRequest } from "next/server";
import { ok, readJson, route } from "@/lib/api/http";
import { requireAdmin } from "@/lib/api/auth";
import { MANAGE_ROLES, USER_ROLES } from "@/lib/admin-roles";
import * as admin from "@/services/admin";
import { WalletError } from "@/services/wallet";

type Context = { params: Promise<{ id: string }> };

// GET /api/admin/users/:id  ->  profile, wallets, totals, active packages
export const GET = route(async (_request: NextRequest, { params }: Context) => {
  await requireAdmin(USER_ROLES);
  return ok(await admin.userDetail((await params).id));
});

// DELETE { "confirmation": "DELETE" }  Anonymizes the profile and permanently blocks sign-in.
export const DELETE = route(async (request: NextRequest, { params }: Context) => {
  const { adminId } = await requireAdmin(MANAGE_ROLES);
  const body = await readJson(request);
  if (body.confirmation !== "DELETE") throw new WalletError("VALIDATION_ERROR", "Type DELETE to confirm account removal.");
  return ok(await admin.deleteUser(adminId, (await params).id));
});
