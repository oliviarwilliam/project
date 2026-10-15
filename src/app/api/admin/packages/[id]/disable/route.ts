import type { NextRequest } from "next/server";
import { ok, route } from "@/lib/api/http";
import { requireAdmin } from "@/lib/api/auth";
import * as packages from "@/services/packages";

type Context = { params: Promise<{ id: string }> };

// Stops new purchases at once. Current subscribers keep earning.
export const POST = route(async (_request: NextRequest, { params }: Context) => {
  const { adminId } = await requireAdmin(["super_admin", "admin"]);
  return ok(await packages.disable(adminId, (await params).id));
});
