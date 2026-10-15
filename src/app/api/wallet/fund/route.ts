import type { NextRequest } from "next/server";
import { ok, readJson, route } from "@/lib/api/http";
import { requireUser } from "@/lib/api/auth";
import * as payments from "@/services/payments";

// POST /api/wallet/fund   { "amount": 5000, "currency": "NGN" }
// Returns { authorizationUrl, reference }. Redirect the browser to authorizationUrl.
export const POST = route(async (request: NextRequest) => {
  const { user } = await requireUser();
  const body = await readJson(request);
  const result = await payments.startFunding({ id: user.id, email: user.email }, {
    amount: body.amount,
    currency: body.currency,
  });
  return ok(result, 201);
}, { rate: { name: "fund", limit: 10, windowSec: 600 } });
