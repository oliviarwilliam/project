import { env } from "@/lib/env";
import { limited, fail, ok, parse } from "@/lib/api/handler";
import { createClient } from "@/lib/supabase/server";
import { schemas } from "@/lib/validation";

export async function POST(request: Request) {
  const blocked = await limited(request, { name: "forgot", limit: 5, windowSec: 3600 });
  if (blocked) return blocked;

  const parsed = await parse(request, schemas.forgotPassword);
  if ("response" in parsed) return parsed.response;

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.values.email, {
    redirectTo: `${env.siteUrl}/auth/callback?next=/reset-password`,
  });
  if (error?.status === 429) return fail("Too many requests. Wait a few minutes and try again.", 429);

  // Same reply whether or not the email has an account.
  return ok();
}
