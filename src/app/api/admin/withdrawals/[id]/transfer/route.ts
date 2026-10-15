import type { NextRequest } from "next/server";
import { ok, route } from "@/lib/api/http";
import { requireAdmin } from "@/lib/api/auth";
import { FINANCE_ROLES } from "@/lib/admin-roles";
import * as transfers from "@/services/transfers";

type Context = { params: Promise<{ id: string }> };

// POST  ->  start (or try again) the bank transfer for an approved withdrawal.
// Works even after the automatic attempts are used up. Returns 409 while one is already running.
export const POST = route(async (_request: NextRequest, { params }: Context) => {
  const { adminId } = await requireAdmin(FINANCE_ROLES);
  return ok(await transfers.sendNow(adminId, (await params).id));
});
