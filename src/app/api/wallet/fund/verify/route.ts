import type { NextRequest } from "next/server";
import { ok, route } from "@/lib/api/http";
import { requireUser } from "@/lib/api/auth";
import * as payments from "@/services/payments";

// GET /api/wallet/fund/verify?reference=tv_...
// Safe to call repeatedly. The wallet is credited once, whichever call gets there first.
export const GET = route(async (request: NextRequest) => {
  const { user } = await requireUser();
  return ok(await payments.verifyFunding(user.id, request.nextUrl.searchParams.get("reference")));
});
