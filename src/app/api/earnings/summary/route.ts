import { ok, route } from "@/lib/api/http";
import { requireUser } from "@/lib/api/auth";
import * as earnings from "@/services/earnings";

// GET /api/earnings/summary  ->  total, today, last 7 days, number of payouts
export const GET = route(async () => {
  const { db } = await requireUser();
  return ok(await earnings.earningsSummary(db));
});
