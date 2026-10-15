import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { WalletError } from "@/services/wallet/errors";

export type AdminRole = "super_admin" | "admin" | "finance" | "support";

export async function requireUser() {
  const db = await createClient();
  const { data } = await db.auth.getUser();
  if (!data.user) throw new WalletError("UNAUTHORIZED");
  return { db, user: data.user };
}

export async function findAdmin(userId: string): Promise<{ adminId: string; role: AdminRole } | null> {
  const { data } = await createAdminClient()
    .from("admin_users")
    .select("id, role")
    .eq("user_id", userId)
    .eq("is_active", true)
    .is("deleted_at", null)
    .maybeSingle();
  return data ? { adminId: data.id as string, role: data.role as AdminRole } : null;
}

export async function requireAdmin(allowed?: readonly AdminRole[]) {
  const { user } = await requireUser();
  const admin = await findAdmin(user.id);
  if (!admin) throw new WalletError("FORBIDDEN");
  if (allowed && !allowed.includes(admin.role)) throw new WalletError("FORBIDDEN");
  return admin;
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function hasBearer(request: Request, secret: string): boolean {
  return safeEqual(request.headers.get("authorization") ?? "", `Bearer ${secret}`);
}

export function hasValidSignature(rawBody: string, signature: string | null, secret: string, algorithm: "sha256" | "sha512" = "sha256"): boolean {
  if (!signature) return false;
  return safeEqual(signature, createHmac(algorithm, secret).update(rawBody).digest("hex"));
}
