import { headers as requestHeaders } from "next/headers";
import { NextResponse } from "next/server";
import { readBody } from "@/lib/api/body";
import { checkRate, type RateRule } from "@/lib/api/rate-limit";
import { WalletError } from "@/services/wallet/errors";

export const ok = <T>(data: T, status = 200) => NextResponse.json({ data }, { status });

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  const result = await readBody(request);
  if (!result.ok) throw new WalletError(result.code);
  if (result.body && typeof result.body === "object" && !Array.isArray(result.body)) return result.body as Record<string, unknown>;
  throw new WalletError("VALIDATION_ERROR", "Send a JSON object as the request body.");
}

// Every API route gets a rate limit per client address. Pass a stricter rule for sensitive routes,
// or { rate: false } for routes that are protected another way (signed webhooks, cron).
const DEFAULT_RATE: RateRule = { name: "api", limit: 120, windowSec: 60 };

export function route<Args extends unknown[]>(handler: (...args: Args) => Promise<Response>, opts: { rate?: RateRule | false } = {}) {
  return async (...args: Args): Promise<Response> => {
    try {
      const rule = opts.rate === undefined ? DEFAULT_RATE : opts.rate;
      const verdict = rule ? await checkRate(await requestHeaders(), rule) : null;

      if (verdict && !verdict.allowed) {
        const e = new WalletError("RATE_LIMITED");
        return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: e.status, headers: verdict.headers });
      }

      const response = await handler(...args);
      if (verdict) for (const [k, v] of Object.entries(verdict.headers)) response.headers.set(k, v);
      return response;
    } catch (error) {
      if (!(error instanceof WalletError)) console.error("[api] unexpected error:", error);
      const known = error instanceof WalletError ? error : new WalletError("INTERNAL_ERROR");
      return NextResponse.json({ error: { code: known.code, message: known.message } }, { status: known.status });
    }
  };
}
