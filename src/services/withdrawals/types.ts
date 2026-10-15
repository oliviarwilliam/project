export type WithdrawalStatus = "pending" | "approved" | "processing" | "paid" | "rejected" | "failed" | "cancelled";

export interface Eligibility {
  currency: string;
  wallet_balance: number;
  total_profit_earned: number;
  profit_reserved: number;
  available_profit: number;
  min_amount: number;
  fee_percent: number;
  cooldown_days: number;
  last_request_at: string | null;
  next_eligible_at: string | null;
  can_request: boolean;
  blocked_by: string | null;
  qualified_referrals: number;
  required_referrals: number;
}

export interface WithdrawalRow {
  id: string;
  user_id: string;
  wallet_id: string;
  amount: number | string;
  fee: number | string;
  net_amount: number | string;
  method: string;
  destination: Record<string, unknown>;
  status: WithdrawalStatus;
  rejection_reason: string | null;
  external_reference: string | null;
  reviewed_at: string | null;
  processed_at: string | null;
  created_at: string;
}

export interface Withdrawal {
  id: string;
  amount: number;
  fee: number;
  netAmount: number;
  method: string;
  status: WithdrawalStatus;
  rejectionReason: string | null;
  reviewedAt: string | null;
  processedAt: string | null;
  createdAt: string;
}

export interface AdminWithdrawal extends Withdrawal {
  currency: string;
  userId: string;
  userEmail: string | null;
  destination: Record<string, unknown>;
  externalReference: string | null;
}

export const STATUSES: readonly WithdrawalStatus[] = ["pending", "approved", "processing", "paid", "rejected", "failed", "cancelled"];
