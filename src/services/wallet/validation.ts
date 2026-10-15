import { WalletError } from "./errors";
import { TXN_TYPES, type Direction, type TxnType } from "./types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY = /^[A-Za-z0-9._:-]{8,128}$/;
const MAX_AMOUNT = 1_000_000;

const invalid = (message: string) => new WalletError("VALIDATION_ERROR", message);

export function parseUuid(value: unknown, field: string): string {
  if (typeof value !== "string" || !UUID.test(value)) throw invalid(`${field} must be a valid id.`);
  return value;
}

export function parseAmount(value: unknown): number {
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0 || n > MAX_AMOUNT) {
    throw new WalletError("INVALID_AMOUNT");
  }
  if (Math.round(n * 100) / 100 !== n) throw new WalletError("INVALID_AMOUNT");
  return n;
}

export function parseCurrency(value: unknown): string {
  if (typeof value !== "string" || value.trim().toUpperCase() !== "NGN") throw invalid("Only Nigerian naira (NGN) is supported.");
  return "NGN";
}

export function parseText(value: unknown, field: string, min: number, max: number): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (text.length < min || text.length > max) throw invalid(`${field} must be ${min} to ${max} characters.`);
  return text;
}

export function parseDirection(value: unknown): Direction {
  if (value !== "credit" && value !== "debit") throw invalid("direction must be credit or debit.");
  return value;
}

export function parseTxnType(value: unknown): TxnType | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !TXN_TYPES.includes(value as TxnType)) throw invalid("Unknown transaction type.");
  return value as TxnType;
}

export function parseLimit(value: unknown): number {
  if (value === undefined || value === null || value === "") return 20;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 100) throw invalid("limit must be between 1 and 100.");
  return n;
}

export function parseIdempotencyKey(value: string | null): string {
  if (!value) throw new WalletError("IDEMPOTENCY_KEY_REQUIRED");
  if (!KEY.test(value)) throw invalid("Idempotency-Key must be 8 to 128 letters, numbers or . _ : -");
  return value;
}

export function parseDestination(value: unknown): Record<string, unknown> {
  const ok = value !== null && typeof value === "object" && !Array.isArray(value);
  if (!ok || Object.keys(value as object).length === 0) throw invalid("destination is required.");
  if (JSON.stringify(value).length > 2000) throw invalid("destination is too large.");
  return value as Record<string, unknown>;
}

// Cursors are opaque to clients.
export function encodeCursor(createdAt: string, id: string): string {
  return Buffer.from(JSON.stringify({ c: createdAt, i: id })).toString("base64url");
}

export function decodeCursor(cursor: string): { createdAt: string; id: string } {
  try {
    const { c, i } = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (typeof c !== "string" || Number.isNaN(Date.parse(c))) throw new Error();
    return { createdAt: c, id: parseUuid(i, "cursor") };
  } catch {
    throw invalid("cursor is not valid.");
  }
}
