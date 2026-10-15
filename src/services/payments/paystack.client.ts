import "server-only";
import { serverEnv } from "@/lib/env.server";
import { WalletError } from "@/services/wallet/errors";

const BASE_URL = "https://api.paystack.co";

export interface PaystackInit {
  authorization_url: string;
  access_code: string;
  reference: string;
}

export interface PaystackTransaction {
  id: number;
  status: string; // success | failed | abandoned | ongoing | pending | processing | queued | reversed
  reference: string;
  amount: number; // smallest unit, e.g. kobo
  currency: string;
  channel: string | null;
  paid_at: string | null;
  gateway_response: string | null;
}

// Returns null when Paystack answers 404. Any other failure becomes PAYMENT_GATEWAY_ERROR.
async function call<T>(path: string, init: RequestInit = {}): Promise<T | null> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${serverEnv.paystackSecretKey}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
  } catch (error) {
    console.error("[paystack] request failed:", error);
    throw new WalletError("PAYMENT_GATEWAY_ERROR");
  }

  if (res.status === 404) return null;

  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.status) {
    console.error("[paystack] error", res.status, body?.message);
    throw new WalletError("PAYMENT_GATEWAY_ERROR");
  }
  return body.data as T;
}

export async function initializeTransaction(input: {
  email: string;
  amountMinor: number;
  currency: string;
  reference: string;
  callbackUrl: string;
  metadata: Record<string, unknown>;
}): Promise<PaystackInit> {
  const data = await call<PaystackInit>("/transaction/initialize", {
    method: "POST",
    body: JSON.stringify({
      email: input.email,
      amount: input.amountMinor,
      currency: input.currency,
      reference: input.reference,
      callback_url: input.callbackUrl,
      metadata: input.metadata,
    }),
  });
  if (!data?.authorization_url) throw new WalletError("PAYMENT_GATEWAY_ERROR");
  return data;
}

export const verifyTransaction = (reference: string) =>
  call<PaystackTransaction>(`/transaction/verify/${encodeURIComponent(reference)}`);
