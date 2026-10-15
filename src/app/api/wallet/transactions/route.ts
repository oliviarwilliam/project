import type { NextRequest } from "next/server";
import { ok, route } from "@/lib/api/http";
import { requireUser } from "@/lib/api/auth";
import * as wallets from "@/services/wallet";

// GET /api/wallet/transactions?type=deposit&limit=20&cursor=...
// Each row carries balance_after, so this list is also the wallet ledger.
export const GET = route(async (request: NextRequest) => {
  const { db } = await requireUser();
  const q = request.nextUrl.searchParams;
  return ok(
    await wallets.listTransactions(db, {
      currency: q.get("currency") ?? undefined,
      type: q.get("type"),
      limit: q.get("limit"),
      cursor: q.get("cursor"),
    }),
  );
});
