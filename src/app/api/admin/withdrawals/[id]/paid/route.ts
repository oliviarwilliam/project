import type { NextRequest } from "next/server";
import { ok, readJson, route } from "@/lib/api/http";
import { requireAdmin } from "@/lib/api/auth";
import * as withdrawals from "@/services/withdrawals";

type Context = { params: Promise<{ id: string }> };

// { "reference": "bank transfer ref" }  Only for approved requests.
export const POST = route(async (request: NextRequest, { params }: Context) => {
  const { adminId } = await requireAdmin(["super_admin", "admin", "finance"]);
  const body = await readJson(request).catch(() => ({}) as Record<string, unknown>);
  return ok(await withdrawals.markPaid(adminId, (await params).id, body.reference));
});
