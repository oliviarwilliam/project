import type { NextRequest } from "next/server";
import { ok, route } from "@/lib/api/http";
import { requireUser } from "@/lib/api/auth";
import * as withdrawals from "@/services/withdrawals";

// GET /api/wallet/withdrawals/eligibility?currency=NGN
// Returns availableProfit, minimum, fee, nextEligibleAt, canRequest and blockedBy. Changes nothing.
export const GET = route(async (request: NextRequest) => {
  const { user } = await requireUser();
  return ok(await withdrawals.getEligibility(user.id, request.nextUrl.searchParams.get("currency") || undefined));
});
