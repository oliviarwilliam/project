export interface EarningRow {
  id: string;
  user_package_id: string;
  amount: number;
  period_start: string;
  period_end: string;
  status: string;
  credited_txn_id: string | null;
  credited_at: string | null;
}

export interface Earning {
  id: string;
  userPackageId: string;
  amount: number;
  periodStart: string;
  periodEnd: string;
  creditedAt: string | null;
  transactionId: string | null;
}

export interface EarningsSummary {
  total_credited: number;
  today: number;
  last_7_days: number;
  payouts: number;
}

export type RunTrigger = "http" | "manual";

export interface RunSummary {
  skipped?: boolean;
  reason?: string;
  run_id?: string;
  status?: "success" | "partial" | "failed";
  packages_due?: number;
  credited?: number;
  failed?: number;
  completed?: number;
  swept?: number;
  total_amount?: number;
  errors?: { user_package_id: string; error: string }[];
}
