import type { NextRequest } from "next/server";
import { ok, route } from "@/lib/api/http";
import { hasBearer } from "@/lib/api/auth";
import { serverEnv } from "@/lib/env.server";
import { logger } from "@/lib/logger";
import * as transfers from "@/services/transfers";
import { WalletError } from "@/services/wallet";

// Run every 5 to 10 minutes with:  Authorization: Bearer $CRON_SECRET
// It resumes attempts that stopped halfway, checks transfers whose webhook never arrived,
// and retries failed transfers when their wait time is over.
const handler = route(async (request: NextRequest) => {
  if (!hasBearer(request, serverEnv.cronSecret)) {
    logger.warn("transfer.cron.unauthorized");
    throw new WalletError("UNAUTHORIZED");
  }
  return ok(await transfers.runTransferJobs(25));
}, { rate: false });

export const GET = handler;
export const POST = handler;
