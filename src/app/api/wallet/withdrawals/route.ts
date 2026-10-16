import type { NextRequest } from "next/server";
import { ok, readJson, route } from "@/lib/api/http";
import { requireUser } from "@/lib/api/auth";
import * as withdrawals from "@/services/withdrawals";
import * as wallets from "@/services/wallet";

// GET /api/wallet/withdrawals?limit=20  ->  the member's requests, newest first
export const GET = route(async (request: NextRequest) => {
  const { db } = await requireUser();
  return ok(await withdrawals.listMine(db, request.nextUrl.searchParams.get("limit")));
});

// POST /api/wallet/withdrawals   Header: Idempotency-Key
// { "amount": 25, "currency": "NGN", "fundingSource": "profit" | "referral", ... }
// The database enforces the source-specific balance, referral unlock, cooldown and minimum,
// then creates a pending request and notifies admins.
export const POST = route(async (request: NextRequest) => {
  const { user } = await requireUser();
  const body = await readJson(request);
  const result = await wallets.requestWithdrawal(user.id, {
    amount: body.amount,
    currency: body.currency,
    method: body.method,
    destination: body.destination,
    fundingSource: body.fundingSource,
    idempotencyKey: request.headers.get("idempotency-key"),
  });
  return ok(result, 201);
}, { rate: { name: "withdraw", limit: 10, windowSec: 600 } });
