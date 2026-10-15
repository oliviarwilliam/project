import { redirect } from "next/navigation";
import { PageHeader } from "@/components/dashboard/ui";
import { ProfileForm } from "@/components/profile/profile-form";
import { getProfile } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Profile" };

export default async function ProfilePage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login?next=/profile");

  const profile = await getProfile(supabase, data.user.id);
  if (!profile) redirect("/login");

  return (
    <div className="max-w-2xl">
      <PageHeader title="Your profile" subtitle="Personal details and bank account for withdrawals." />
      <ProfileForm
        profile={profile}
        emailVerified={Boolean(data.user.email_confirmed_at)}
        phoneVerified={Boolean(data.user.phone_confirmed_at)}
      />
    </div>
  );
}
