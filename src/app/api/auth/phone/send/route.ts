import { limited, fail, ok, parse, requireUser, signedOut } from "@/lib/api/handler";
import { schemas } from "@/lib/validation";

export async function POST(request: Request) {
  const blocked = await limited(request, { name: "phone-send", limit: 5, windowSec: 3600 });
  if (blocked) return blocked;

  const { supabase, user } = await requireUser();
  if (!user) return signedOut();

  const parsed = await parse(request, schemas.phoneSend);
  if ("response" in parsed) return parsed.response;

  // Supabase texts a 6 digit code to the new number.
  const { error } = await supabase.auth.updateUser({ phone: parsed.values.phone });
  if (error?.status === 429) return fail("Wait a minute before asking for another code.", 429);
  if (error) return fail("We could not send a code to that number. Check it and try again.", 400);

  return ok();
}
