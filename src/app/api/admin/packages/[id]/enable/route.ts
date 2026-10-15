import type { NextRequest } from "next/server";
import { ok, route } from "@/lib/api/http";
import { requireAdmin } from "@/lib/api/auth";
import * as packages from "@/services/packages";

type Context = { params: Promise<{ id: string }> };

export const POST = route(async (_request: NextRequest, { params }: Context) => {
  const { adminId } = await requireAdmin(["super_admin", "admin"]);
  return ok(await packages.enable(adminId, (await params).id));
});
