import { env } from "@/lib/env";
import { limited, fail, ok, parse } from "@/lib/api/handler";
import { createClient } from "@/lib/supabase/server";
import { schemas } from "@/lib/validation";

export async function POST(request: Request) {
  const blocked = await limited(request, { name: "register", limit: 5, windowSec: 3600 });
  if (blocked) return blocked;

  const parsed = await parse(request, schemas.register);
  if ("response" in parsed) return parsed.response;
  const { fullName, email, password, referralCode } = parsed.values;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName, referral_code: referralCode.toUpperCase() },
      emailRedirectTo: `${env.siteUrl}/auth/callback?next=/dashboard`,
    },
  });
  if (error) return fail(error.message, error.status ?? 400);

  // The reply is the same for new and existing emails, so it does not reveal who has an account.
  return ok({ needsVerification: !data.session });
}
