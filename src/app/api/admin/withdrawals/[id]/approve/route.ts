import type { NextRequest } from "next/server";
import { ok, route } from "@/lib/api/http";
import { requireAdmin } from "@/lib/api/auth";
import * as transfers from "@/services/transfers";

type Context = { params: Promise<{ id: string }> };

export const POST = route(async (_request: NextRequest, { params }: Context) => {
  const { adminId } = await requireAdmin(["super_admin", "admin", "finance"]);
  // Approves, then creates the recipient and starts the Paystack transfer. The approval stands
  // even if the transfer cannot start. The response says what happened to it.
  return ok(await transfers.approveAndPay(adminId, (await params).id));
});
