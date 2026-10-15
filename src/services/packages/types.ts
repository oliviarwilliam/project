import type { PackageStatus } from "@/lib/packages";

export type { PackageStatus };

// A row from `packages`, or from the `package_stats` view (which adds the last two fields).
export interface PackageRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  price: number | string;
  currency: string;
  return_rate: number | string;
  payout_interval_days: number;
  duration_days: number;
  max_per_user: number | null;
  sort_order: number;
  status: PackageStatus;
  created_at: string;
  updated_at: string;
  active_subscribers?: number | null;
  total_invested?: number | string | null;
}

export interface PackageRecord {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  dailyProfitPercent: number;
  dailyProfitAmount: number;
  durationDays: number;
  totalReturnAmount: number;
  totalReturnPercent: number;
  status: PackageStatus;
  maxPerUser: number | null;
  sortOrder: number;
  activeSubscribers: number;
  totalInvested: number;
  createdAt: string;
  updatedAt: string;
}

export interface NewPackage {
  name: string;
  price: number;
  dailyProfitPercent: number;
  durationDays: number;
  status: PackageStatus;
  description: string | null;
  currency: string;
  maxPerUser: number | null;
  sortOrder: number | null; // null lets the database place it last
}
