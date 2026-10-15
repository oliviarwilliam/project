import type { NextRequest } from "next/server";
import { ok, route } from "@/lib/api/http";
import { hasValidSignature } from "@/lib/api/auth";
import { serverEnv } from "@/lib/env.server";
import * as payments from "@/services/payments";
import * as transfers from "@/services/transfers";
import { WalletError } from "@/services/wallet";

// Paystack signs the raw body with HMAC SHA512 using your secret key.
// Read the raw text first. Parsing and re-serialising would change the bytes and break the check.
export const POST = route(async (request: NextRequest) => {
  const raw = await request.text();
  if (!hasValidSignature(raw, request.headers.get("x-paystack-signature"), serverEnv.paystackSecretKey, "sha512")) {
    throw new WalletError("UNAUTHORIZED");
  }

  let event: unknown;
  try {
    event = JSON.parse(raw);
  } catch {
    throw new WalletError("VALIDATION_ERROR", "Body must be JSON.");
  }

  // Any 2xx tells Paystack we got it. A 5xx makes Paystack retry later.
  const name = (event as { event?: unknown } | null)?.event;
  if (typeof name === "string" && name.startsWith("transfer.")) return ok(await transfers.handleWebhookEvent(event));
  return ok(await payments.handleWebhookEvent(event));
}, { rate: false });
