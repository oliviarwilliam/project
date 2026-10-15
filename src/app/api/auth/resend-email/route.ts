import { env } from "@/lib/env";
import { limited, fail, ok, parse } from "@/lib/api/handler";
import { createClient } from "@/lib/supabase/server";
import { schemas } from "@/lib/validation";

export async function POST(request: Request) {
  const blocked = await limited(request, { name: "resend", limit: 5, windowSec: 3600 });
  if (blocked) return blocked;

  const parsed = await parse(request, schemas.resendEmail);
  if ("response" in parsed) return parsed.response;

  const supabase = await createClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: parsed.values.email,
    options: { emailRedirectTo: `${env.siteUrl}/auth/callback?next=/dashboard` },
  });
  if (error?.status === 429) return fail("Wait a minute before asking for another email.", 429);

  return ok();
}
