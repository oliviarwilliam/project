import type { NextRequest } from "next/server";
import { ok, readJson, route } from "@/lib/api/http";
import { requireAdmin } from "@/lib/api/auth";
import * as wallets from "@/services/wallet";

type Context = { params: Promise<{ walletId: string }> };

// POST { "direction": "credit" | "debit", "amount": 10, "reason": "..." }   Header: Idempotency-Key
export const POST = route(async (request: NextRequest, { params }: Context) => {
  const { adminId } = await requireAdmin(["super_admin", "admin", "finance"]);
  const { walletId } = await params;
  const body = await readJson(request);
  const result = await wallets.adminAdjust(adminId, walletId, {
    direction: body.direction,
    amount: body.amount,
    reason: body.reason,
    idempotencyKey: request.headers.get("idempotency-key"),
  });
  return ok(result, 201);
});
