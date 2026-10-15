import { createAdminClient } from "@/lib/supabase/admin";
import { fromDbError } from "@/services/wallet/errors";
import type { TransferRow, WithdrawalContext, WorkItem } from "./types";

// Service role only. The database functions do the state changes inside transactions.
const db = () => createAdminClient();
const COLUMNS = "id, withdrawal_id, attempt, reference, recipient_code, transfer_code, amount, currency, status, failure_reason, retryable, retry_after, trigger, created_at, sent_at, completed_at";

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db().rpc(name, args);
  if (error) throw fromDbError(error);
  return data as T;
}

export const begin = (withdrawalId: string, adminId: string | null, trigger: string) =>
  rpc<{ transfer: TransferRow; existing: boolean }>("transfer_begin", { p_withdrawal_id: withdrawalId, p_admin_id: adminId, p_trigger: trigger });

export const markSent = (transferId: string, recipientCode: string | null, transferCode: string | null, paystackStatus: string) =>
  rpc("transfer_mark_sent", { p_transfer_id: transferId, p_recipient_code: recipientCode, p_transfer_code: transferCode, p_paystack_status: paystackStatus });

export const complete = (reference: string, outcome: "success" | "failed" | "reversed", transferCode: string | null, reason: string | null, retryable: boolean) =>
  rpc<{ status: string; final?: boolean; retry_after?: string | null; replayed?: boolean }>("transfer_complete", {
    p_reference: reference, p_outcome: outcome, p_transfer_code: transferCode, p_reason: reason, p_retryable: retryable,
  });

export const workQueue = (limit: number) => rpc<WorkItem[]>("transfer_work_queue", { p_limit: limit });

export async function findByReference(reference: string): Promise<TransferRow | null> {
  const { data, error } = await db().from("withdrawal_transfers").select(COLUMNS).eq("reference", reference).maybeSingle();
  if (error) throw fromDbError(error);
  return data as TransferRow | null;
}

export async function findById(id: string): Promise<TransferRow | null> {
  const { data, error } = await db().from("withdrawal_transfers").select(COLUMNS).eq("id", id).maybeSingle();
  if (error) throw fromDbError(error);
  return data as TransferRow | null;
}

export async function listForWithdrawal(withdrawalId: string): Promise<TransferRow[]> {
  const { data, error } = await db().from("withdrawal_transfers").select(COLUMNS).eq("withdrawal_id", withdrawalId).order("attempt");
  if (error) throw fromDbError(error);
  return (data ?? []) as TransferRow[];
}

export async function latestFor(withdrawalIds: string[]): Promise<Map<string, TransferRow>> {
  if (withdrawalIds.length === 0) return new Map();
  const { data, error } = await db().from("withdrawal_transfers").select(COLUMNS).in("withdrawal_id", withdrawalIds).order("attempt");
  if (error) throw fromDbError(error);
  // Rows are ordered by attempt, so the last one written for each withdrawal is the newest.
  return new Map(((data ?? []) as TransferRow[]).map((t) => [t.withdrawal_id, t]));
}

export async function setRecipient(transferId: string, recipientCode: string) {
  const { error } = await db().from("withdrawal_transfers").update({ recipient_code: recipientCode }).eq("id", transferId);
  if (error) throw fromDbError(error);
}

export async function withdrawalContext(id: string): Promise<WithdrawalContext | null> {
  const { data, error } = await db().from("withdrawals").select("id, user_id, status, destination, net_amount, wallets(currency)").eq("id", id).is("deleted_at", null).maybeSingle();
  if (error) throw fromDbError(error);
  if (!data) return null;
  const wallet = data.wallets as unknown as { currency: string } | { currency: string }[] | null;
  const currency = String((Array.isArray(wallet) ? wallet[0]?.currency : wallet?.currency) ?? "").trim();
  return { id: data.id, user_id: data.user_id, status: data.status, destination: data.destination ?? {}, net_amount: Number(data.net_amount), currency };
}

export async function findRecipient(userId: string, bankCode: string, accountNumber: string, currency: string): Promise<string | null> {
  const { data, error } = await db().from("transfer_recipients").select("recipient_code")
    .eq("user_id", userId).eq("bank_code", bankCode).eq("account_number", accountNumber).eq("currency", currency).maybeSingle();
  if (error) throw fromDbError(error);
  return data?.recipient_code ?? null;
}

export async function saveRecipient(r: { userId: string; bankCode: string; bankName: string | null; accountNumber: string; accountName: string; currency: string; recipientCode: string }) {
  const { error } = await db().from("transfer_recipients").upsert(
    { user_id: r.userId, bank_code: r.bankCode, bank_name: r.bankName, account_number: r.accountNumber, account_name: r.accountName, currency: r.currency, recipient_code: r.recipientCode },
    { onConflict: "user_id,bank_code,account_number,currency", ignoreDuplicates: true },
  );
  if (error) throw fromDbError(error);
}
