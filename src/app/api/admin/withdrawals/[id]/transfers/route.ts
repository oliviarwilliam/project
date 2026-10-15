import type { NextRequest } from "next/server";
import { ok, route } from "@/lib/api/http";
import { requireAdmin } from "@/lib/api/auth";
import { FINANCE_ROLES } from "@/lib/admin-roles";
import * as transfers from "@/services/transfers";

type Context = { params: Promise<{ id: string }> };

// GET  ->  every transfer attempt for this withdrawal, oldest first
export const GET = route(async (_request: NextRequest, { params }: Context) => {
  await requireAdmin(FINANCE_ROLES);
  return ok(await transfers.listAttempts((await params).id));
});
