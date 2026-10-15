import "server-only";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

export type RateRule = { name: string; limit: number; windowSec: number };
export type RateVerdict = { allowed: boolean; headers: Record<string, string> };

const HOPS = Math.max(1, Number(process.env.TRUSTED_PROXY_HOPS ?? 1));
const IP_HEADER = process.env.CLIENT_IP_HEADER?.toLowerCase();

// Which header holds the real client address depends on the proxy in front of the app.
// CLIENT_IP_HEADER names a header your proxy sets (for example cf-connecting-ip).
// Otherwise the entry in X-Forwarded-For added by the last trusted proxy is used.
// Never trust the first entry: the client can write that one.
export function clientIp(h: Headers): string {
  if (IP_HEADER) return h.get(IP_HEADER)?.trim() || "unknown";
  const parts = (h.get("x-forwarded-for") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return parts[Math.max(0, parts.length - HOPS)] ?? "unknown";
}

// Fixed window counter kept in Postgres, so the limit holds across every server instance.
// If the database is unreachable the request is allowed and the problem is logged.
export async function checkRate(h: Headers, rule: RateRule, extraKey?: string): Promise<RateVerdict> {
  if (process.env.RATE_LIMIT_DISABLED === "true" && process.env.NODE_ENV !== "production") return { allowed: true, headers: {} };

  try {
    const { data, error } = await createAdminClient().rpc("rate_limit_hit", {
      p_key: `${rule.name}:${extraKey ?? clientIp(h)}`, p_limit: rule.limit, p_window_seconds: rule.windowSec,
    });
    if (error || !data) throw error ?? new Error("empty result");

    const v = data as { allowed: boolean; hits: number; reset_at: string };
    const reset = Math.max(1, Math.ceil((new Date(v.reset_at).getTime() - Date.now()) / 1000));
    const headers = {
      "RateLimit-Limit": String(rule.limit),
      "RateLimit-Remaining": String(Math.max(0, rule.limit - v.hits)),
      "RateLimit-Reset": String(reset),
    };
    if (!v.allowed) logger.warn("rate_limit.blocked", { rule: rule.name, ip: extraKey ? undefined : clientIp(h) });
    return v.allowed ? { allowed: true, headers } : { allowed: false, headers: { ...headers, "Retry-After": String(reset) } };
  } catch (e) {
    logger.error("rate_limit.unavailable", { rule: rule.name, message: String(e) });
    return { allowed: true, headers: {} };
  }
}
