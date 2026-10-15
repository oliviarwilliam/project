import type { NextRequest } from "next/server";
import { ok, route } from "@/lib/api/http";
import { requireAdmin } from "@/lib/api/auth";
import { FINANCE_ROLES } from "@/lib/admin-roles";
import * as wallets from "@/services/wallet";

type Context = { params: Promise<{ walletId: string }> };

// Compares the stored balance with the sum of the ledger.
export const GET = route(async (_request: NextRequest, { params }: Context) => {
  await requireAdmin(FINANCE_ROLES);
  const { walletId } = await params;
  return ok(await wallets.reconcile(walletId));
});
