import type { PackageRecord, PackageRow } from "./types";

const round = (n: number, places: number) => Math.round(n * 10 ** places) / 10 ** places;

export function toRecord(row: PackageRow): PackageRecord {
  const interval = row.payout_interval_days || 1;
  const payouts = Math.floor(row.duration_days / interval);
  const price = Number(row.price);
  const rate = Number(row.return_rate);

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    price,
    currency: row.currency.trim(),
    dailyProfitPercent: round((rate * 100) / interval, 4),
    dailyProfitAmount: round((price * rate) / interval, 2),
    durationDays: row.duration_days,
    totalReturnAmount: round(price * rate * payouts, 2),
    totalReturnPercent: round(rate * 100 * payouts, 2),
    status: row.status,
    maxPerUser: row.max_per_user,
    sortOrder: row.sort_order,
    activeSubscribers: row.active_subscribers ?? 0,
    totalInvested: Number(row.total_invested ?? 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
