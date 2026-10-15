import { limited, fail, ok, parse, requireUser, signedOut } from "@/lib/api/handler";
import { schemas } from "@/lib/validation";

export async function POST(request: Request) {
  const blocked = await limited(request, { name: "phone-verify", limit: 10, windowSec: 3600 });
  if (blocked) return blocked;

  const { supabase, user } = await requireUser();
  if (!user) return signedOut();

  const parsed = await parse(request, schemas.phoneVerify);
  if ("response" in parsed) return parsed.response;
  const { phone, code } = parsed.values;

  const { error } = await supabase.auth.verifyOtp({ phone, token: code, type: "phone_change" });
  if (error) {
    return fail("That code is wrong or has expired.", 400, { errors: { code: "That code is wrong or has expired." } });
  }

  return ok();
}
