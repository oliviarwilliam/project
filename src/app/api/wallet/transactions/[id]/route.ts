import type { NextRequest } from "next/server";
import { ok, route } from "@/lib/api/http";
import { requireUser } from "@/lib/api/auth";
import * as wallets from "@/services/wallet";

type Context = { params: Promise<{ id: string }> };

export const GET = route(async (_request: NextRequest, { params }: Context) => {
  const { db } = await requireUser();
  const { id } = await params;
  return ok(await wallets.getTransaction(db, id));
});
