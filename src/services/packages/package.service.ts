import { WalletError } from "@/services/wallet/errors";
import { parseUuid } from "@/services/wallet/validation";
import { toRecord } from "./package.mapper";
import * as repo from "./package.repository";
import type { PackageRecord } from "./types";
import { assertViable, parseCreate, parseUpdate } from "./validation";

// ---- Public: active packages only, without owner counts ----
export async function listActive(): Promise<Omit<PackageRecord, "activeSubscribers" | "totalInvested">[]> {
  return (await repo.listActive()).map((row) => {
    const { activeSubscribers: _a, totalInvested: _t, ...publicFields } = toRecord(row);
    return publicFields;
  });
}

// ---- Admin. Callers must check the admin first. ----
export async function adminList(): Promise<PackageRecord[]> {
  return (await repo.listAdmin()).map(toRecord);
}

export async function adminGet(id: unknown): Promise<PackageRecord> {
  const row = await repo.findAdmin(parseUuid(id, "id"));
  if (!row) throw new WalletError("PACKAGE_NOT_FOUND");
  return toRecord(row);
}

export async function create(adminId: string, body: Record<string, unknown>): Promise<PackageRecord> {
  return toRecord(await repo.create(adminId, parseCreate(body)));
}

export async function update(adminId: string, id: unknown, body: Record<string, unknown>): Promise<PackageRecord> {
  const packageId = parseUuid(id, "id");
  const { changes, price, percent } = parseUpdate(body);

  // An edit may change only the price or only the rate, so check the combined result.
  if (price !== undefined || percent !== undefined) {
    const current = await adminGet(packageId);
    assertViable(price ?? current.price, percent ?? current.dailyProfitPercent);
  }
  return toRecord(await repo.update(adminId, packageId, changes));
}

// Disabling stops new purchases. Members who own it keep earning.
export const disable = async (adminId: string, id: unknown) => toRecord(await repo.setStatus(adminId, parseUuid(id, "id"), "archived"));
export const enable = async (adminId: string, id: unknown) => toRecord(await repo.setStatus(adminId, parseUuid(id, "id"), "active"));

// Soft delete. The database refuses while members still have it running.
export const remove = async (adminId: string, id: unknown) => toRecord(await repo.remove(adminId, parseUuid(id, "id")));
