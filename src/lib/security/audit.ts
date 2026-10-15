import "server-only";
import { clientIp } from "@/lib/api/rate-limit";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

export const maskEmail = (email: string) => `${email.split("@")[0]?.slice(0, 1) ?? ""}***@${email.split("@")[1] ?? ""}`;

// Writes an audit entry with the caller's IP and browser. Never throws: a failed audit write is
// logged and must not break the request it describes.
export async function auditRequest(
  request: Request,
  event: { actorUserId?: string | null; action: string; entityTable?: string; entityId?: string | null; data?: Record<string, unknown> },
) {
  try {
    await createAdminClient().rpc("audit_request", {
      p_actor_user_id: event.actorUserId ?? null,
      p_action: event.action,
      p_entity_table: event.entityTable ?? "auth",
      p_entity_id: event.entityId ?? event.actorUserId ?? null,
      p_data: event.data ?? {},
      p_ip: clientIp(request.headers),
      p_user_agent: request.headers.get("user-agent"),
    });
  } catch (e) {
    logger.error("audit.request_failed", { action: event.action, message: String(e) });
  }
}
