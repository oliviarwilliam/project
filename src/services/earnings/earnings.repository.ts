import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { fromDbError } from "@/services/wallet/errors";
import type { EarningRow, EarningsSummary, RunSummary, RunTrigger } from "./types";

// Member reads use the member's own client, so row level security limits what they see.

export async function fetchHistory(
  db: SupabaseClient,
  args: { packageId: string | null; limit: number; before: { createdAt: string; id: string } | null },
): Promise<EarningRow[]> {
  const { data, error } = await db.rpc("earnings_history", {
    p_package_id: args.packageId,
    p_limit: args.limit,
    p_before: args.before?.createdAt ?? null,
    p_before_id: args.before?.id ?? null,
  });
  if (error) throw fromDbError(error);
  return data as EarningRow[];
}

export async function fetchSummary(db: SupabaseClient): Promise<EarningsSummary> {
  const { data, error } = await db.rpc("earnings_summary");
  if (error) throw fromDbError(error);
  return data as EarningsSummary;
}

// ---- Service role only ----

export async function runDaily(trigger: RunTrigger): Promise<{ summary: RunSummary | null; error: string | null }> {
  const { data, error } = await createAdminClient().rpc("run_daily_earnings", { p_trigger: trigger });
  return error ? { summary: null, error: error.message } : { summary: data as RunSummary, error: null };
}

// If the runner itself crashes, nothing inside it could be logged, so record it here.
export async function saveFailedRun(trigger: RunTrigger, startedAt: Date, message: string) {
  const { error } = await createAdminClient()
    .from("earnings_runs")
    .insert({ trigger, status: "failed", started_at: startedAt.toISOString(), error: message.slice(0, 500) });
  if (error) throw fromDbError(error);
}

export async function listRuns(limit: number) {
  const { data, error } = await createAdminClient()
    .from("earnings_runs").select("*").order("started_at", { ascending: false }).limit(limit);
  if (error) throw fromDbError(error);
  return data ?? [];
}
