import type { NextRequest } from "next/server";
import { ok, readJson, route } from "@/lib/api/http";
import { requireUser } from "@/lib/api/auth";
import * as wallets from "@/services/wallet";

// GET /api/wallet/purchases?status=active  ->  the member's purchased packages
export const GET = route(async (request: NextRequest) => {
  const { db } = await requireUser();
  return ok(await wallets.listPurchases(db, request.nextUrl.searchParams.get("status")));
});

// POST /api/wallet/purchases  { "packageId": "..." }   Header: Idempotency-Key
// Same as POST /api/packages/:id/purchase. Kept so existing callers keep working.
export const POST = route(async (request: NextRequest) => {
  const { user } = await requireUser();
  const body = await readJson(request);
  const result = await wallets.purchasePackage(user.id, {
    packageId: body.packageId,
    idempotencyKey: request.headers.get("idempotency-key"),
  });
  return ok(result, 201);
}, { rate: { name: "purchase", limit: 20, windowSec: 60 } });
