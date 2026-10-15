export type PaymentStatus = "pending" | "success" | "failed" | "abandoned";

export interface Payment {
  id: string;
  user_id: string;
  wallet_id: string;
  reference: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  wallet_txn_id: string | null;
  paid_at: string | null;
}

export interface FundingResult {
  reference: string;
  status: PaymentStatus;
  amount: number;
  currency: string;
  credited: boolean; // true only on the call that actually added the money
}
