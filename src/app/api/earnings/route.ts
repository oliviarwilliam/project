import type { NextRequest } from "next/server";
import { ok, route } from "@/lib/api/http";
import { requireUser } from "@/lib/api/auth";
import * as earnings from "@/services/earnings";

// GET /api/earnings?packageId=...&limit=20&cursor=...  ->  the member's profit history
export const GET = route(async (request: NextRequest) => {
  const { db } = await requireUser();
  const q = request.nextUrl.searchParams;
  return ok(await earnings.listEarnings(db, { packageId: q.get("packageId"), limit: q.get("limit"), cursor: q.get("cursor") }));
});
