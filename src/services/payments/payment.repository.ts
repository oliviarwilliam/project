import { createAdminClient } from "@/lib/supabase/admin";
import { fromDbError } from "@/services/wallet/errors";
import type { Payment, PaymentStatus } from "./types";

// Payment rows are written with the service role. Members can only read their own.
const db = () => createAdminClient();
const COLUMNS = "id, user_id, wallet_id, reference, amount, currency, status, wallet_txn_id, paid_at";

export async function findWallet(userId: string, currency?: string) {
  let query = db().from("wallets").select("id, currency").eq("user_id", userId).is("deleted_at", null).order("created_at").limit(1);
  if (currency) query = query.eq("currency", currency);
  const { data, error } = await query.maybeSingle();
  if (error) throw fromDbError(error);
  return data as { id: string; currency: string } | null;
}

export async function countAttemptsSince(userId: string, sinceIso: string): Promise<number> {
  const { count, error } = await db()
    .from("payments").select("id", { count: "exact", head: true })
    .eq("user_id", userId).gte("created_at", sinceIso);
  if (error) throw fromDbError(error);
  return count ?? 0;
}

export async function insertPayment(row: {
  userId: string; walletId: string; reference: string; amount: number; currency: string;
}): Promise<Payment> {
  const { data, error } = await db()
    .from("payments")
    .insert({ user_id: row.userId, wallet_id: row.walletId, reference: row.reference, amount: row.amount, currency: row.currency })
    .select(COLUMNS).single();
  if (error) throw fromDbError(error);
  return data as Payment;
}

export async function findByReference(reference: string): Promise<Payment | null> {
  const { data, error } = await db().from("payments").select(COLUMNS).eq("reference", reference).maybeSingle();
  if (error) throw fromDbError(error);
  return data as Payment | null;
}

export async function saveCheckout(id: string, authorizationUrl: string, accessCode: string) {
  const { error } = await db().from("payments").update({ authorization_url: authorizationUrl, access_code: accessCode }).eq("id", id);
  if (error) throw fromDbError(error);
}

// Only moves a payment that is still pending, so it can never undo a success.
export async function markStatus(reference: string, status: PaymentStatus, reason: string | null) {
  const { error } = await db()
    .from("payments")
    .update({ status, gateway_response: reason, failure_reason: status === "failed" ? reason : null })
    .eq("reference", reference).eq("status", "pending");
  if (error) throw fromDbError(error);
}

export async function complete(args: {
  reference: string; amount: number; currency: string; providerId: string;
  channel: string | null; paidAt: string | null; gatewayResponse: string | null;
}) {
  const { data, error } = await db().rpc("payment_complete", {
    p_reference: args.reference, p_amount: args.amount, p_currency: args.currency,
    p_provider_id: args.providerId, p_channel: args.channel, p_paid_at: args.paidAt,
    p_gateway_response: args.gatewayResponse,
  });
  if (error) throw fromDbError(error);
  return data as { payment: Payment; credited: boolean; reason?: string };
}
