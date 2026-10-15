import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { fromDbError } from "@/services/wallet/errors";

export async function getReferralSummary(userId: string) {
  const db = createAdminClient();
  const [userResult, referralResult, settingResult] = await Promise.all([
    db.from("users").select("referral_code").eq("id", userId).maybeSingle(),
    db.from("referrals").select("status, reward_amount").eq("referrer_id", userId),
    db.from("settings").select("value").eq("key", "referral_reward_amount").is("deleted_at", null).maybeSingle(),
  ]);
  if (userResult.error) throw fromDbError(userResult.error);
  if (referralResult.error) throw fromDbError(referralResult.error);
  if (settingResult.error) throw fromDbError(settingResult.error);
  const referrals = referralResult.data ?? [];
  const qualified = referrals.filter((r) => r.status === "qualified");
  return {
    referralCode: userResult.data?.referral_code as string | undefined,
    total: referrals.length,
    qualified: qualified.length,
    pending: referrals.length - qualified.length,
    earned: qualified.reduce((sum, r) => sum + Number(r.reward_amount), 0),
    rewardAmount: Number(settingResult.data?.value ?? 1000),
  };
}
