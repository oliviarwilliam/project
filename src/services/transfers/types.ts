export type TransferStatus = "queued" | "pending" | "success" | "failed" | "reversed";

export interface TransferRow {
  id: string;
  withdrawal_id: string;
  attempt: number;
  reference: string;
  recipient_code: string | null;
  transfer_code: string | null;
  amount: number | string;
  currency: string;
  status: TransferStatus;
  failure_reason: string | null;
  retryable: boolean;
  retry_after: string | null;
  trigger: string;
  created_at: string;
  sent_at: string | null;
  completed_at: string | null;
}

export interface TransferSummary {
  withdrawalId: string;
  attempt?: number;
  status: TransferStatus | "skipped";
  reference?: string;
  reason?: string | null;
  retryAfter?: string | null;
}

export interface WorkItem {
  kind: "resume" | "verify" | "retry";
  withdrawal_id: string;
  transfer_id: string | null;
}

export interface WithdrawalContext {
  id: string;
  user_id: string;
  status: string;
  destination: Record<string, unknown>;
  net_amount: number;
  currency: string;
}
