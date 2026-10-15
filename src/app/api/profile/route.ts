import { limited, fail, ok, parse, requireUser, signedOut } from "@/lib/api/handler";
import { getProfile } from "@/lib/profile";
import { auditRequest } from "@/lib/security/audit";
import { schemas } from "@/lib/validation";

export async function GET() {
  const { supabase, user } = await requireUser();
  if (!user) return signedOut();

  const profile = await getProfile(supabase, user.id);
  if (!profile) return fail("Profile not found.", 404);

  return ok({
    profile,
    emailVerified: Boolean(user.email_confirmed_at),
    phoneVerified: Boolean(user.phone_confirmed_at),
  });
}

export async function PATCH(request: Request) {
  const blocked = await limited(request, { name: "profile", limit: 30, windowSec: 3600 });
  if (blocked) return blocked;

  const { supabase, user } = await requireUser();
  if (!user) return signedOut();

  const parsed = await parse(request, schemas.profile);
  if ("response" in parsed) return parsed.response;
  const { fullName, dateOfBirth, bankName, accountNumber, accountName } = parsed.values;

  const { error } = await supabase
    .from("users")
    .update({
      full_name: fullName,
      date_of_birth: dateOfBirth || null,
      bank_name: bankName || null,
      account_number: accountNumber || null,
      account_name: accountName || null,
    })
    .eq("id", user.id);
  if (error) return fail("We could not save your profile. Try again.", 500);

  await auditRequest(request, { actorUserId: user.id, action: "profile.updated", entityTable: "users", data: { bank_details_set: Boolean(accountNumber) } });
  const profile = await getProfile(supabase, user.id);
  return ok({ profile });
}
