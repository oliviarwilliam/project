import { serverEnv } from "@/lib/env.server";
import { logger } from "@/lib/logger";
import { WalletError } from "@/services/wallet/errors";
import { parseUuid } from "@/services/wallet/validation";
import * as withdrawals from "@/services/withdrawals";
import * as paystack from "./paystack.client";
import * as repo from "./transfer.repository";
import type { TransferRow, TransferStatus, TransferSummary, WithdrawalContext } from "./types";

// Flow: admin approves, recipient is created, transfer is started, the status is updated
// (webhook, or verify as a backup), and the member is notified. The notify and status steps
// live in the database function transfer_complete so they are saved together.

const SUPPORTED_CURRENCIES = new Set(["NGN"]); // recipients are created as Nigerian bank accounts
const FAILED = new Set(["failed", "abandoned", "blocked", "rejected"]);
const PERMANENT = /(invalid|not found|does not exist|could not resolve|unable to resolve|blocked|inactive|dormant|closed|name mismatch|not supported)/i;

// Insufficient balance, bank downtime and similar are worth retrying. Bad details and key problems are not.
const isRetryable = (message: string, httpStatus = 0) => httpStatus !== 401 && httpStatus !== 403 && !PERMANENT.test(message);

const summary = (t: TransferRow, status?: TransferStatus, reason?: string | null, retryAfter?: string | null): TransferSummary => ({
  withdrawalId: t.withdrawal_id, attempt: t.attempt, status: status ?? t.status, reference: t.reference,
  reason: reason ?? t.failure_reason, retryAfter: retryAfter ?? t.retry_after,
});

async function fail(t: TransferRow, reason: string, retryable: boolean, outcome: "failed" | "reversed" = "failed"): Promise<TransferSummary> {
  const r = await repo.complete(t.reference, outcome, null, reason, retryable);
  logger.warn("transfer.failed", { reference: t.reference, attempt: t.attempt, reason, retryable, final: r.final });
  return summary(t, outcome, reason, r.retry_after ?? null);
}

// ---- Bank and recipient ----

const clean = (s: string) =>
  s.toLowerCase().replace(/&/g, " and ").replace(/\b(plc|ltd|limited|bank|of|nigeria|microfinance|mfb)\b/g, " ").replace(/[^a-z0-9]/g, "");
const ALIAS: Record<string, string> = { gt: "guarantytrust", gtb: "guarantytrust", gtco: "guarantytrust", uba: "unitedforafrica", fcmb: "firstcitymonument" };

function matchBank(banks: paystack.Bank[], name: string): string | null {
  const raw = clean(name);
  const target = ALIAS[raw] ?? raw;
  if (!target) return null;
  const exact = banks.filter((b) => clean(b.name) === target);
  if (exact.length === 1) return exact[0]?.code ?? null;
  if (exact.length > 1 || target.length < 4) return null;
  const partial = banks.filter((b) => clean(b.name).includes(target) || target.includes(clean(b.name)));
  return partial.length === 1 ? (partial[0]?.code ?? null) : null;
}

type Recipient = { ok: true; code: string } | { ok: false; message: string; retryable: boolean };
const bad = (message: string, retryable: boolean): Recipient => ({ ok: false, message, retryable });

async function ensureRecipient(ctx: WithdrawalContext): Promise<Recipient> {
  const d = ctx.destination;
  const accountNumber = String(d.account_number ?? "").trim();
  const accountName = String(d.account_name ?? "").trim();
  const bankName = d.bank_name ? String(d.bank_name) : null;
  if (!/^\d{10}$/.test(accountNumber) || !accountName) return bad("The bank details are incomplete. The account number needs 10 digits and an account name.", false);

  let bankCode = typeof d.bank_code === "string" ? d.bank_code : null;
  if (!bankCode) {
    const banks = await paystack.listBanks();
    if (!banks.ok) return bad(banks.message, banks.kind === "unknown");
    bankCode = matchBank(banks.data, bankName ?? "");
    if (!bankCode) return bad(`Bank not recognised: "${bankName ?? ""}". Ask the member to correct it, or pay manually.`, false);
  }

  const saved = await repo.findRecipient(ctx.user_id, bankCode, accountNumber, ctx.currency);
  if (saved) return { ok: true, code: saved };

  const created = await paystack.createRecipient({ name: accountName, accountNumber, bankCode, currency: ctx.currency });
  if (!created.ok) return bad(created.message, created.kind === "unknown" ? true : isRetryable(created.message, created.status));

  await repo.saveRecipient({ userId: ctx.user_id, bankCode, bankName, accountNumber, accountName, currency: ctx.currency, recipientCode: created.data.recipient_code });
  return { ok: true, code: created.data.recipient_code };
}

// ---- Acting on what Paystack says ----

async function settle(t: TransferRow, recipientCode: string | null, p: paystack.PaystackTransfer): Promise<TransferSummary> {
  const s = String(p.status).toLowerCase();

  if (s === "success") {
    await repo.complete(t.reference, "success", p.transfer_code ?? null, null, true);
    logger.info("transfer.succeeded", { reference: t.reference });
    return summary(t, "success");
  }
  if (s === "reversed") return fail(t, "Paystack reversed the transfer.", true, "reversed");
  if (FAILED.has(s)) return fail(t, `Paystack reported the transfer as ${s}.`, s !== "blocked" && s !== "rejected");
  if (s === "otp") {
    return fail(t, "Paystack wants an OTP for this transfer. Turn off transfer OTP in your Paystack settings, then send it again.", false);
  }

  await repo.markSent(t.id, recipientCode, p.transfer_code ?? null, s); // pending, processing, received
  return summary(t, "pending");
}

async function sendAttempt(ctx: WithdrawalContext, t: TransferRow): Promise<TransferSummary> {
  const recipient = await ensureRecipient(ctx);
  if (!recipient.ok) return fail(t, recipient.message, recipient.retryable);
  await repo.setRecipient(t.id, recipient.code);

  // The reference is fixed for this attempt, so sending twice can never pay twice.
  const res = await paystack.initiateTransfer({
    amountMinor: Math.round(Number(t.amount) * 100), recipientCode: recipient.code,
    reference: t.reference, reason: "TeenVest withdrawal", currency: ctx.currency,
  });
  if (res.ok) return settle(t, recipient.code, res.data);
  if (res.kind === "rejected") return fail(t, res.message, isRetryable(res.message, res.status));

  // Timeout or server error: it may have gone through. Ask Paystack before deciding anything.
  const check = await paystack.verifyTransfer(t.reference);
  if (check.ok) return settle(t, recipient.code, check.data);
  logger.warn("transfer.unconfirmed", { reference: t.reference, message: res.message });
  return summary(t, "queued"); // the scheduled job resumes it
}

// ---- Start a transfer (approval, manual button, or retry) ----

export async function startTransfer(
  withdrawalId: unknown,
  opts: { adminId: string | null; trigger: "approval" | "manual" | "retry" },
): Promise<TransferSummary> {
  // Kill switch. With PAYSTACK_TRANSFERS_ENABLED not "true", no new money leaves through Paystack.
  // Transfers already in flight still get settled by the webhook and the job.
  if (!serverEnv.transfersEnabled) throw new WalletError("TRANSFERS_DISABLED");

  const id = parseUuid(withdrawalId, "id");
  const ctx = await repo.withdrawalContext(id);
  if (!ctx) throw new WalletError("WITHDRAWAL_NOT_FOUND");
  if (!SUPPORTED_CURRENCIES.has(ctx.currency)) {
    throw new WalletError("TRANSFERS_DISABLED", `Automatic transfers are not available for ${ctx.currency}. Pay this withdrawal manually and mark it paid.`);
  }

  const { transfer, existing } = await repo.begin(id, opts.adminId, opts.trigger);
  if (existing) return summary(transfer); // a live attempt already exists

  logger.info("transfer.started", { withdrawalId: id, reference: transfer.reference, attempt: transfer.attempt, trigger: opts.trigger });
  return sendAttempt(ctx, transfer);
}

export const sendNow = (adminId: string, withdrawalId: unknown) => startTransfer(withdrawalId, { adminId, trigger: "manual" });

// Step 1 and 2 together. The approval stands even if the transfer cannot start.
export async function approveAndPay(adminId: string, withdrawalId: unknown) {
  const withdrawal = await withdrawals.approve(adminId, withdrawalId);

  try {
    const transfer = await startTransfer(withdrawal.id, { adminId, trigger: "approval" });
    return { withdrawal, transfer };
  } catch (e) {
    const known = e instanceof WalletError ? e : null;
    if (!known) logger.error("transfer.start_crashed", { withdrawalId: withdrawal.id, message: String(e) });
    return { withdrawal, transfer: { error: known?.message ?? "The transfer could not be started. Use Send transfer to try again.", code: known?.code ?? "INTERNAL_ERROR" } };
  }
}

// ---- Webhook: transfer.success, transfer.failed, transfer.reversed ----

const EVENTS: Record<string, "success" | "failed" | "reversed"> = {
  "transfer.success": "success", "transfer.failed": "failed", "transfer.reversed": "reversed",
};

export async function handleWebhookEvent(event: unknown) {
  const body = event as { event?: string; data?: Record<string, any> } | null;
  const outcome = body?.event ? EVENTS[body.event] : undefined;
  if (!outcome) return { ignored: true };

  const data = body?.data ?? {};
  const reference = typeof data.reference === "string" ? data.reference : null;
  if (!reference || !(await repo.findByReference(reference))) return { ignored: true }; // not one of ours

  const reason = outcome === "success" ? null
    : String(data.gateway_response ?? data.failures?.message ?? data.message ?? `Paystack reported the transfer as ${outcome}.`);
  const result = await repo.complete(reference, outcome, typeof data.transfer_code === "string" ? data.transfer_code : null, reason, outcome === "success" ? true : isRetryable(reason ?? ""));

  logger.info("transfer.webhook", { reference, event: body?.event, status: result.status, final: result.final, replayed: result.replayed });
  return { reference, ...result };
}

// ---- Scheduled job: resume stuck attempts, verify missing webhooks, retry failures ----

export async function runTransferJobs(limit = 25) {
  const items = await repo.workQueue(limit);
  const stats = { retried: 0, resumed: 0, verified: 0, errors: 0 };

  for (const item of items) {
    try {
      if (item.kind === "retry") {
        await startTransfer(item.withdrawal_id, { adminId: null, trigger: "retry" });
        stats.retried++;
        continue;
      }

      const t = item.transfer_id ? await repo.findById(item.transfer_id) : null;
      const ctx = t ? await repo.withdrawalContext(t.withdrawal_id) : null;
      if (!t || !ctx) continue;

      const check = await paystack.verifyTransfer(t.reference);
      if (check.ok) {
        await settle(t, t.recipient_code, check.data);
      } else if (check.kind === "not_found") {
        // Paystack never saw it. Safe to send again with the same reference.
        if (item.kind === "resume") await sendAttempt(ctx, t);
        else await repo.complete(t.reference, "failed", null, "Paystack has no record of this transfer.", true);
      } else {
        continue; // Paystack is unreachable. Try again on the next run.
      }
      stats[item.kind === "resume" ? "resumed" : "verified"]++;
    } catch (e) {
      stats.errors++;
      logger.error("transfer.job_item_failed", { kind: item.kind, withdrawalId: item.withdrawal_id, message: String(e) });
    }
  }

  logger.info("transfer.job_finished", { found: items.length, ...stats });
  return { found: items.length, ...stats };
}

// ---- Reads for the admin screens ----

export const latestTransfers = (withdrawalIds: string[]) => repo.latestFor(withdrawalIds);

export async function listAttempts(withdrawalId: unknown) {
  const rows = await repo.listForWithdrawal(parseUuid(withdrawalId, "id"));
  return rows.map((t) => ({
    attempt: t.attempt, status: t.status, reference: t.reference, transferCode: t.transfer_code,
    amount: Number(t.amount), currency: t.currency.trim(), reason: t.failure_reason,
    retryable: t.retryable, retryAfter: t.retry_after, trigger: t.trigger,
    createdAt: t.created_at, completedAt: t.completed_at,
  }));
}
