import { limited, fail, ok, parse, requireUser } from "@/lib/api/handler";
import { auditRequest } from "@/lib/security/audit";
import { schemas } from "@/lib/validation";

export async function POST(request: Request) {
  const blocked = await limited(request, { name: "reset", limit: 10, windowSec: 3600 });
  if (blocked) return blocked;

  const { supabase, user } = await requireUser();
  if (!user) return fail("This reset link has expired. Request a new one.", 401);

  const parsed = await parse(request, schemas.resetPassword);
  if ("response" in parsed) return parsed.response;

  const { error } = await supabase.auth.updateUser({ password: parsed.values.password });
  if (error) return fail(error.message, error.status ?? 400, { errors: { password: error.message } });

  // Sign out every other device after a password change.
  await supabase.auth.signOut({ scope: "others" });
  await auditRequest(request, { actorUserId: user.id, action: "auth.password_changed" });
  return ok();
}
