import type { WalletTransaction } from "@/services/wallet";

export interface Overview {
  currency: string;
  currencies: string[];
  users: { total: number; active: number; suspended: number; new_7d: number };
  wallet_balance: number;
  packages: { active: number; invested: number };
  withdrawals: { pending_count: number; pending_amount: number; approved_count: number; approved_amount: number };
  flows_30d: { deposits: number; withdrawals: number; profit: number; purchases: number };
}

export interface FinancialDay {
  day: string;
  deposits: number;
  withdrawals: number;
  purchases: number;
  profit: number;
  refunds: number;
}

export interface Financials {
  currency: string;
  days: number;
  series: FinancialDay[];
  totals: Omit<FinancialDay, "day"> & { net: number };
}

export interface UserListItem {
  id: string;
  email: string;
  full_name: string | null;
  status: "active" | "suspended" | "closed";
  created_at: string;
  currency: string | null;
  balance: number | null;
  active_packages: number;
  is_admin: boolean;
}

export interface UserDetail {
  user: {
    id: string; email: string; full_name: string | null; phone: string | null;
    status: "active" | "suspended" | "closed"; date_of_birth: string | null;
    guardian_consent_at: string | null; created_at: string; bank_name: string | null; account_last4: string | null;
  };
  is_admin: boolean;
  wallets: { id: string; currency: string; balance: number }[];
  totals: { deposits: number; withdrawals: number; profit: number; purchases: number };
  active_packages: number;
}

export interface AuditEntry {
  id: string;
  action: string;
  entityTable: string;
  entityId: string | null;
  actorType: string;
  actorLabel: string;
  oldData: unknown;
  newData: unknown;
  createdAt: string;
}

export type { WalletTransaction };
