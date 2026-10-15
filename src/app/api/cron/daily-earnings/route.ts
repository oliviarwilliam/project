import type { NextRequest } from "next/server";
import { ok, route } from "@/lib/api/http";
import { hasBearer } from "@/lib/api/auth";
import { serverEnv } from "@/lib/env.server";
import { logger } from "@/lib/logger";
import * as earnings from "@/services/earnings";
import { WalletError } from "@/services/wallet";

// HTTP trigger for the daily run. Use it when pg_cron is not available, or to run by hand.
// Header: Authorization: Bearer $CRON_SECRET  (Vercel Cron sends this automatically)
// Safe to call more than once a day: each package period can only be paid once.
const handler = route(async (request: NextRequest) => {
  if (!hasBearer(request, serverEnv.cronSecret)) {
    logger.warn("earnings.cron.unauthorized");
    throw new WalletError("UNAUTHORIZED");
  }
  return ok(await earnings.runDailyEarnings("http"));
}, { rate: false });

export const GET = handler;
export const POST = handler;
