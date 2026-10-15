import type { NextRequest } from "next/server";
import { ok, route } from "@/lib/api/http";
import { requireUser } from "@/lib/api/auth";
import * as wallets from "@/services/wallet";

// GET /api/wallet?currency=NGN  ->  balance and totals
export const GET = route(async (request: NextRequest) => {
  const { db } = await requireUser();
  const currency = request.nextUrl.searchParams.get("currency") ?? undefined;
  return ok(await wallets.getOverview(db, currency));
});
