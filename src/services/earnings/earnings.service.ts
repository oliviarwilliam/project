import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";
import { WalletError, type Page } from "@/services/wallet";
import { decodeCursor, encodeCursor, parseLimit, parseUuid } from "@/services/wallet/validation";
import * as repo from "./earnings.repository";
import type { Earning, EarningRow, EarningsSummary, RunSummary, RunTrigger } from "./types";

const toEarning = (r: EarningRow): Earning => ({
  id: r.id,
  userPackageId: r.user_package_id,
  amount: Number(r.amount),
  periodStart: r.period_start,
  periodEnd: r.period_end,
  creditedAt: r.credited_at,
  transactionId: r.credited_txn_id,
});

// ---- Member: earnings history ----

export async function listEarnings(
  db: SupabaseClient,
  input: { packageId?: string | null; limit?: unknown; cursor?: string | null },
): Promise<Page<Earning>> {
  const limit = parseLimit(input.limit);
  const rows = await repo.fetchHistory(db, {
    packageId: input.packageId ? parseUuid(input.packageId, "packageId") : null,
    limit: limit + 1,
    before: input.cursor ? decodeCursor(input.cursor) : null,
  });

  const items = rows.slice(0, limit);
  const last = items.at(-1);
  const hasMore = rows.length > limit && last?.credited_at;
  return { items: items.map(toEarning), nextCursor: hasMore && last ? encodeCursor(last.credited_at as string, last.id) : null };
}

export const earningsSummary = (db: SupabaseClient): Promise<EarningsSummary> => repo.fetchSummary(db);

// ---- The daily run ----

export async function runDailyEarnings(trigger: RunTrigger): Promise<RunSummary> {
  const startedAt = new Date();
  logger.info("earnings.run.start", { trigger });

  const { summary, error } = await repo.runDaily(trigger);

  if (error || !summary) {
    logger.error("earnings.run.crashed", { trigger, message: error });
    await repo.saveFailedRun(trigger, startedAt, error ?? "No result returned").catch((e) =>
      logger.error("earnings.run.log_failed", { message: String(e) }),
    );
    throw new WalletError("INTERNAL_ERROR");
  }

  if (summary.skipped) {
    logger.warn("earnings.run.skipped", { trigger, reason: summary.reason });
    return summary;
  }

  const fields = { trigger, ...summary, ms: Date.now() - startedAt.getTime() };
  if (summary.failed) logger.warn("earnings.run.finish_with_failures", fields);
  else logger.info("earnings.run.finish", fields);
  return summary;
}

// ---- Admin ----

export function listRuns(limit: unknown) {
  return repo.listRuns(parseLimit(limit));
}
