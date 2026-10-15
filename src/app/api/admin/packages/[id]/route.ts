import type { NextRequest } from "next/server";
import { ok, readJson, route } from "@/lib/api/http";
import { requireAdmin } from "@/lib/api/auth";
import * as packages from "@/services/packages";

type Context = { params: Promise<{ id: string }> };
const ROLES = ["super_admin", "admin"] as const;

export const GET = route(async (_request: NextRequest, { params }: Context) => {
  await requireAdmin(ROLES);
  return ok(await packages.adminGet((await params).id));
});

// Send only the fields to change. Existing owners keep the terms they bought.
export const PATCH = route(async (request: NextRequest, { params }: Context) => {
  const { adminId } = await requireAdmin(ROLES);
  return ok(await packages.update(adminId, (await params).id, await readJson(request)));
});

// Soft delete. Refused while members still have the package running (disable it instead).
export const DELETE = route(async (_request: NextRequest, { params }: Context) => {
  const { adminId } = await requireAdmin(ROLES);
  return ok(await packages.remove(adminId, (await params).id));
});
