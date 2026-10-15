import { logger } from "@/lib/logger";
import { checkRate } from "@/lib/api/rate-limit";
import { headers } from "next/headers";

// Browsers post Content Security Policy violations here. They are logged, never stored.
export async function POST(request: Request) {
  const verdict = await checkRate(await headers(), { name: "csp-report", limit: 60, windowSec: 60 });
  if (!verdict.allowed) return new Response(null, { status: 429 });

  const text = (await request.text()).slice(0, 4000);
  try {
    const r = (JSON.parse(text) as { "csp-report"?: Record<string, string> })["csp-report"] ?? {};
    logger.warn("csp.violation", {
      directive: r["violated-directive"], blocked: r["blocked-uri"], document: r["document-uri"], source: r["source-file"],
    });
  } catch { /* not a report */ }
  return new Response(null, { status: 204 });
}
