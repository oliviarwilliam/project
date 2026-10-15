import type { SupabaseClient } from "@supabase/supabase-js";

export type Profile = {
  id: string;
  email: string;
  fullName: string | null;
  dateOfBirth: string | null;
  phone: string | null;
  avatarUrl: string | null;
  bankName: string | null;
  accountNumber: string | null;
  accountName: string | null;
};

const COLUMNS = "id, email, full_name, date_of_birth, phone, avatar_url, bank_name, account_number, account_name";

export async function getProfile(supabase: SupabaseClient, userId: string): Promise<Profile | null> {
  const { data } = await supabase.from("users").select(COLUMNS).eq("id", userId).is("deleted_at", null).maybeSingle();
  if (!data) return null;

  return {
    id: data.id,
    email: data.email,
    fullName: data.full_name,
    dateOfBirth: data.date_of_birth,
    phone: data.phone,
    avatarUrl: data.avatar_url,
    bankName: data.bank_name,
    accountNumber: data.account_number,
    accountName: data.account_name,
  };
}
