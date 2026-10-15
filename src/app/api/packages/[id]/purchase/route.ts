import type { NextRequest } from "next/server";
import { ok, route } from "@/lib/api/http";
import { requireUser } from "@/lib/api/auth";
import * as wallets from "@/services/wallet";

type Context = { params: Promise<{ id: string }> };

// GET  /api/packages/:id/purchase  ->  can I buy this now? (balance, limit, shortfall). Changes nothing.
export const GET = route(async (_request: NextRequest, { params }: Context) => {
  const { db } = await requireUser();
  return ok(await wallets.previewPurchase(db, (await params).id));
});

// POST /api/packages/:id/purchase   Header: Idempotency-Key
// Deducts the wallet and creates the active package in one database transaction.
export const POST = route(async (request: NextRequest, { params }: Context) => {
  const { user } = await requireUser();
  const result = await wallets.purchasePackage(user.id, {
    packageId: (await params).id,
    idempotencyKey: request.headers.get("idempotency-key"),
  });
  return ok(result, 201);
}, { rate: { name: "purchase", limit: 20, windowSec: 60 } });
