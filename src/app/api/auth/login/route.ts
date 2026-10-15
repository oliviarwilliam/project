import { fail, limited, ok, parse } from "@/lib/api/handler";
import { auditRequest, maskEmail } from "@/lib/security/audit";
import { createClient } from "@/lib/supabase/server";
import { schemas } from "@/lib/validation";

export async function POST(request: Request) {
  const blocked = await limited(request, { name: "login", limit: 10, windowSec: 600 });
  if (blocked) return blocked;

  const parsed = await parse(request, schemas.login);
  if ("response" in parsed) return parsed.response;
  const { email, password } = parsed.values;

  // A second limit per account slows down guessing from many addresses.
  const byAccount = await limited(request, { name: "login-account", limit: 8, windowSec: 900 }, email.toLowerCase());
  if (byAccount) return byAccount;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (!error) {
    await auditRequest(request, { actorUserId: data.user?.id ?? null, action: "auth.login", entityTable: "users" });
    return ok();
  }

  await auditRequest(request, { action: "auth.login_failed", data: { email: maskEmail(email), reason: error.code ?? "invalid_credentials" } });

  if (error.code === "email_not_confirmed") {
    return fail("Verify your email before logging in. Check your inbox for the link.", 403, { code: "email_not_confirmed" });
  }
  if (error.status === 429) return fail("Too many attempts. Wait a few minutes and try again.", 429);
  return fail("Incorrect email or password.", 401);
}
