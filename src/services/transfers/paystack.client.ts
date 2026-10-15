import "server-only";
import { serverEnv } from "@/lib/env.server";

const BASE_URL = "https://api.paystack.co";

// rejected: Paystack refused it, nothing was created.
// unknown:  timeout, network error, 5xx or rate limit. We cannot tell whether it went through.
// not_found: Paystack has no such record.
export type PaystackResult<T> =
  | { ok: true; data: T }
  | { ok: false; kind: "rejected" | "unknown" | "not_found"; status: number; message: string };

async function request<T>(path: string, init: RequestInit = {}): Promise<PaystackResult<T>> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${serverEnv.paystackSecretKey}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });
  } catch {
    return { ok: false, kind: "unknown", status: 0, message: "Could not reach Paystack." };
  }

  const body = await res.json().catch(() => null);
  if (res.ok && body?.status) return { ok: true, data: body.data as T };
  if (res.status === 404) return { ok: false, kind: "not_found", status: 404, message: String(body?.message ?? "Not found") };

  const kind = res.status >= 500 || res.status === 429 ? "unknown" : "rejected";
  return { ok: false, kind, status: res.status, message: String(body?.message ?? `Paystack error ${res.status}`).slice(0, 300) };
}

export interface Bank { name: string; code: string }
export interface PaystackTransfer {
  transfer_code: string;
  reference: string;
  status: string; // success, failed, reversed, pending, otp, received, processing, abandoned, blocked, rejected
  amount: number; // kobo
  currency: string;
  reason?: string | null;
}

// Bank names rarely change, so keep the list for six hours.
let bankCache: { at: number; banks: Bank[] } | null = null;

export async function listBanks(): Promise<PaystackResult<Bank[]>> {
  if (bankCache && Date.now() - bankCache.at < 6 * 3600_000) return { ok: true, data: bankCache.banks };
  const res = await request<{ name: string; code: string; active?: boolean }[]>("/bank?country=nigeria&perPage=200");
  if (!res.ok) return res;
  const banks = res.data.filter((b) => b.active !== false).map((b) => ({ name: b.name, code: b.code }));
  bankCache = { at: Date.now(), banks };
  return { ok: true, data: banks };
}

export const createRecipient = (i: { name: string; accountNumber: string; bankCode: string; currency: string }) =>
  request<{ recipient_code: string }>("/transferrecipient", {
    method: "POST",
    body: JSON.stringify({ type: "nuban", name: i.name, account_number: i.accountNumber, bank_code: i.bankCode, currency: i.currency }),
  });

export const initiateTransfer = (i: { amountMinor: number; recipientCode: string; reference: string; reason: string; currency: string }) =>
  request<PaystackTransfer>("/transfer", {
    method: "POST",
    body: JSON.stringify({ source: "balance", amount: i.amountMinor, recipient: i.recipientCode, reference: i.reference, reason: i.reason, currency: i.currency }),
  });

export const verifyTransfer = (reference: string) =>
  request<PaystackTransfer>(`/transfer/verify/${encodeURIComponent(reference)}`);
