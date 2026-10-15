import { WalletError } from "@/services/wallet/errors";
import { parseAmount, parseCurrency } from "@/services/wallet/validation";
import type { NewPackage, PackageStatus } from "./types";

const invalid = (message: string) => new WalletError("VALIDATION_ERROR", message);
const has = (body: Record<string, unknown>, key: string) => body[key] !== undefined;
const blank = (v: unknown) => v === undefined || v === null || v === "";

function int(value: unknown, field: string, min: number, max: number): number {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isInteger(n) || n < min || n > max) {
    throw invalid(`${field} must be a whole number from ${min} to ${max}.`);
  }
  return n;
}

function name(value: unknown): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (text.length < 2 || text.length > 40) throw invalid("Name must be 2 to 40 characters.");
  return text;
}

function description(value: unknown): string | null {
  if (blank(value)) return null;
  if (typeof value !== "string" || value.trim().length > 300) throw invalid("Description can be up to 300 characters.");
  return value.trim();
}

export function parseStatus(value: unknown): PackageStatus {
  const status = value === "disabled" ? "archived" : value;
  if (status !== "draft" && status !== "active" && status !== "archived") throw invalid("Status must be draft, active or disabled.");
  return status;
}

// Admins type a percent per day: 0.25 means 0.25%.
function dailyPercent(value: unknown): number {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0 || n > 100) throw invalid("Daily profit must be above 0% and at most 100%.");
  if (Math.round(n * 100) / 100 !== n) throw invalid("Daily profit can have at most two decimals.");
  return n;
}

export function assertViable(price: number, percent: number) {
  if (Math.round(price * percent) < 1) throw invalid("Daily profit must be at least 0.01.");
}

export function parseCreate(body: Record<string, unknown>): NewPackage {
  const price = parseAmount(body.price);
  const dailyProfitPercent = dailyPercent(body.dailyProfitPercent);
  assertViable(price, dailyProfitPercent);

  return {
    name: name(body.name),
    price,
    dailyProfitPercent,
    durationDays: int(body.durationDays, "Duration", 1, 3650),
    status: has(body, "status") ? parseStatus(body.status) : "draft",
    description: description(body.description),
    currency: blank(body.currency) ? "NGN" : parseCurrency(body.currency),
    maxPerUser: blank(body.maxPerUser) ? null : int(body.maxPerUser, "Max per member", 1, 100),
    sortOrder: blank(body.sortOrder) ? null : int(body.sortOrder, "Sort order", 0, 100000),
  };
}

// Builds the partial update the database function expects. Currency and slug never change.
export function parseUpdate(body: Record<string, unknown>) {
  const changes: Record<string, unknown> = {};
  let price: number | undefined;
  let percent: number | undefined;

  if (has(body, "name")) changes.name = name(body.name);
  if (has(body, "description")) changes.description = description(body.description);
  if (has(body, "price")) changes.price = price = parseAmount(body.price);
  if (has(body, "dailyProfitPercent")) changes.daily_profit_percent = percent = dailyPercent(body.dailyProfitPercent);
  if (has(body, "durationDays")) changes.duration_days = int(body.durationDays, "Duration", 1, 3650);
  if (has(body, "status")) changes.status = parseStatus(body.status);
  if (has(body, "maxPerUser")) changes.max_per_user = blank(body.maxPerUser) ? null : int(body.maxPerUser, "Max per member", 1, 100);
  if (!blank(body.sortOrder)) changes.sort_order = int(body.sortOrder, "Sort order", 0, 100000);

  if (Object.keys(changes).length === 0) throw invalid("Nothing to update.");
  return { changes, price, percent };
}
