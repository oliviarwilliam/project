import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { fromDbError } from "@/services/wallet/errors";

export async function getReferralSummary(userId: string) {
  const db = createAdminClient();
  const [userResult, referralResult, settingResult] = await Promise.all([
    db.from("users").select("referral_code").eq("id", userId).maybeSingle(),
    db.from("referrals").select("status, reward_amount").eq("referrer_id", userId),
    db.from("settings").select("key, value").in("key", ["referral_reward_amount", "required_funded_referrals"]).is("deleted_at", null),
  ]);
  if (userResult.error) throw fromDbError(userResult.error);
  if (referralResult.error) throw fromDbError(referralResult.error);
  if (settingResult.error) throw fromDbError(settingResult.error);
  const settings = new Map((settingResult.data ?? []).map((setting) => [setting.key as string, setting.value]));
  const referrals = referralResult.data ?? [];
  const qualified = referrals.filter((r) => r.status === "qualified");
  return {
    referralCode: userResult.data?.referral_code as string | undefined,
    total: referrals.length,
    qualified: qualified.length,
    pending: referrals.length - qualified.length,
    earned: qualified.reduce((sum, r) => sum + Number(r.reward_amount), 0),
    rewardAmount: Number(settings.get("referral_reward_amount") ?? 1000),
    requiredFundedReferrals: Number(settings.get("required_funded_referrals") ?? 10),
  };
}
