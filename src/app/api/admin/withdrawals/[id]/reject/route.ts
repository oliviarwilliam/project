import type { NextRequest } from "next/server";
import { ok, readJson, route } from "@/lib/api/http";
import { requireAdmin } from "@/lib/api/auth";
import * as withdrawals from "@/services/withdrawals";

type Context = { params: Promise<{ id: string }> };

// { "reason": "..." }  The money goes back to the member's wallet.
export const POST = route(async (request: NextRequest, { params }: Context) => {
  const { adminId } = await requireAdmin(["super_admin", "admin", "finance"]);
  const body = await readJson(request);
  return ok(await withdrawals.reject(adminId, (await params).id, body.reason));
});
