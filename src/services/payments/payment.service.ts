import { env } from "@/lib/env";
import { fundingConfig } from "@/lib/payments/config";
import { WalletError } from "@/services/wallet/errors";
import { parseAmount, parseCurrency } from "@/services/wallet/validation";
import * as paystack from "./paystack.client";
import * as repo from "./payment.repository";
import type { FundingResult, Payment } from "./types";

const MAX_ATTEMPTS = 5; // per member, per window
const ATTEMPT_WINDOW_MS = 10 * 60 * 1000;
const REFERENCE = /^[A-Za-z0-9_.-]{8,100}$/;

const summarize = (p: Payment, credited: boolean): FundingResult => ({
  reference: p.reference, status: p.status, amount: p.amount, currency: p.currency.trim(), credited,
});

// Steps 1 to 3: validate, save a pending payment, ask Paystack for a checkout link.
export async function startFunding(
  user: { id: string; email: string | undefined },
  input: { amount: unknown; currency?: unknown },
) {
  if (!user.email) throw new WalletError("VALIDATION_ERROR", "Add an email to your account before funding.");

  const amount = parseAmount(input.amount);
  const wallet = await repo.findWallet(user.id, input.currency ? parseCurrency(input.currency) : undefined);
  if (!wallet) throw new WalletError("WALLET_NOT_FOUND");

  const currency = wallet.currency.trim();
  const limits = fundingConfig(currency);
  if (!limits) throw new WalletError("UNSUPPORTED_CURRENCY");
  if (amount < limits.min || amount > limits.max) {
    throw new WalletError("AMOUNT_OUT_OF_RANGE", `Enter an amount between ${limits.min} and ${limits.max} ${currency}.`);
  }

  const since = new Date(Date.now() - ATTEMPT_WINDOW_MS).toISOString();
  if ((await repo.countAttemptsSince(user.id, since)) >= MAX_ATTEMPTS) throw new WalletError("TOO_MANY_ATTEMPTS");

  const reference = `tv_${crypto.randomUUID().replaceAll("-", "")}`;
  const payment = await repo.insertPayment({ userId: user.id, walletId: wallet.id, reference, amount, currency });

  try {
    const checkout = await paystack.initializeTransaction({
      email: user.email,
      amountMinor: Math.round(amount * 100),
      currency,
      reference,
      callbackUrl: `${env.siteUrl}/wallet/fund/callback`,
      metadata: { user_id: user.id, purpose: "wallet_funding" },
    });
    await repo.saveCheckout(payment.id, checkout.authorization_url, checkout.access_code);
    return { reference, authorizationUrl: checkout.authorization_url };
  } catch (error) {
    await repo.markStatus(reference, "failed", "INIT_FAILED").catch(() => undefined);
    throw error;
  }
}

// Steps 4 to 7: ask Paystack for the truth, then credit the wallet exactly once.
// Used by the callback page and by the webhook, so both paths behave the same.
export async function verifyFunding(userId: string | null, referenceInput: unknown): Promise<FundingResult> {
  if (typeof referenceInput !== "string" || !REFERENCE.test(referenceInput)) {
    throw new WalletError("VALIDATION_ERROR", "reference is not valid.");
  }
  const reference = referenceInput;

  const payment = await repo.findByReference(reference);
  if (!payment || (userId !== null && payment.user_id !== userId)) throw new WalletError("PAYMENT_NOT_FOUND");
  if (payment.status === "success") return summarize(payment, false);

  const tx = await paystack.verifyTransaction(reference);
  if (!tx) return summarize(payment, false); // checkout was never opened
  if (tx.reference !== reference) throw new WalletError("PAYMENT_GATEWAY_ERROR");

  if (tx.status === "success") {
    const result = await repo.complete({
      reference,
      amount: tx.amount / 100,
      currency: tx.currency,
      providerId: String(tx.id),
      channel: tx.channel,
      paidAt: tx.paid_at,
      gatewayResponse: tx.gateway_response,
    });
    if (result.reason === "AMOUNT_MISMATCH") throw new WalletError("PAYMENT_AMOUNT_MISMATCH");
    return summarize(result.payment, result.credited);
  }

  if (tx.status === "failed" || tx.status === "abandoned") {
    await repo.markStatus(reference, tx.status, tx.gateway_response);
    return { ...summarize(payment, false), status: tx.status };
  }

  return summarize(payment, false); // still in progress
}

// Called after the webhook signature has been verified.
export async function handleWebhookEvent(event: unknown) {
  const body = event as { event?: unknown; data?: { reference?: unknown } } | null;
  if (body?.event !== "charge.success") return { ignored: true };

  const reference = body.data?.reference;
  if (typeof reference !== "string" || !(await repo.findByReference(reference))) {
    return { ignored: true }; // not one of our payments
  }

  try {
    const result = await verifyFunding(null, reference);
    return { reference, status: result.status, credited: result.credited };
  } catch (error) {
    // A mismatch will never fix itself. Acknowledge it so Paystack stops retrying.
    if (error instanceof WalletError && error.code === "PAYMENT_AMOUNT_MISMATCH") return { reference, flagged: true };
    throw error;
  }
}
