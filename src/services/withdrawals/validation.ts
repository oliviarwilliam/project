import { WalletError } from "@/services/wallet/errors";
import { parseAmount, parseText } from "@/services/wallet/validation";
import { STATUSES, type WithdrawalStatus } from "./types";

const invalid = (message: string) => new WalletError("VALIDATION_ERROR", message);

export function parseStatusFilter(value: unknown): WithdrawalStatus | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !STATUSES.includes(value as WithdrawalStatus)) throw invalid("Unknown status.");
  return value as WithdrawalStatus;
}

export const parseReason = (value: unknown) => parseText(value, "reason", 5, 300);

export function parseReference(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  return parseText(value, "reference", 3, 100);
}

// Admin editable settings. Ranges match the database function.
export function parseSettings(body: Record<string, unknown>): { key: string; value: number | boolean }[] {
  const out: { key: string; value: number | boolean }[] = [];

  if (body.minWithdrawalAmount !== undefined) {
    const n = Number(body.minWithdrawalAmount);
    if (!Number.isFinite(n) || n < 5000) throw invalid("Minimum withdrawal cannot be set below 5000 NGN.");
    out.push({ key: "min_withdrawal_amount", value: n === 0 ? 0 : parseAmount(n) });
  }
  if (body.withdrawalCooldownDays !== undefined) {
    const n = Number(body.withdrawalCooldownDays);
    if (!Number.isInteger(n) || n < 0 || n > 90) throw invalid("withdrawalCooldownDays must be a whole number from 0 to 90.");
    out.push({ key: "withdrawal_cooldown_days", value: n });
  }
  if (body.withdrawalFeePercent !== undefined) {
    const n = Number(body.withdrawalFeePercent);
    if (!Number.isFinite(n) || n < 0 || n > 50 || Math.round(n * 100) / 100 !== n) throw invalid("withdrawalFeePercent must be from 0 to 50 with at most two decimals.");
    out.push({ key: "withdrawal_fee_percent", value: n });
  }
  if (body.referralRewardAmount !== undefined) {
    const n = Number(body.referralRewardAmount);
    if (!Number.isFinite(n) || n < 0) throw invalid("referralRewardAmount must be 0 or more.");
    out.push({ key: "referral_reward_amount", value: n === 0 ? 0 : parseAmount(n) });
  }
  if (body.maintenanceMode !== undefined) {
    if (typeof body.maintenanceMode !== "boolean") throw invalid("maintenanceMode must be true or false.");
    out.push({ key: "maintenance_mode", value: body.maintenanceMode });
  }
  if (out.length === 0) throw invalid("Nothing to update.");
  return out;
}
