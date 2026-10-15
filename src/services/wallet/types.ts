export type TxnType = "deposit" | "withdrawal" | "package_purchase" | "earning" | "refund" | "adjustment";
export type Direction = "credit" | "debit";

export interface Wallet {
  id: string;
  user_id: string;
  currency: string;
  balance: number;
  created_at: string;
  updated_at: string;
}

export interface WalletTransaction {
  id: string;
  wallet_id: string;
  user_id: string;
  type: TxnType;
  direction: Direction;
  amount: number;
  balance_after: number;
  reference_type: string | null;
  reference_id: string | null;
  description: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface WalletSummary {
  total_credits: number;
  total_debits: number;
  by_type: Record<string, number>;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface Reconciliation {
  wallet_id: string;
  balance: number;
  ledger_balance: number;
  is_balanced: boolean;
}

export const TXN_TYPES: readonly TxnType[] = [
  "deposit", "withdrawal", "package_purchase", "earning", "refund", "adjustment",
];
