import "server-only";
import { redirect } from "next/navigation";
import { findAdmin } from "@/lib/api/auth";
import { MANAGE_ROLES, type AdminRole } from "@/lib/admin-roles";
import { createClient } from "@/lib/supabase/server";

// Call at the top of every admin page. Layouts are not re-checked on every navigation.
// Not signed in: login. Not an admin: member dashboard. Admin without this role: admin home.
export async function requireAdminPage(allowed: readonly AdminRole[] = MANAGE_ROLES) {
  const { data } = await (await createClient()).auth.getUser();
  if (!data.user) redirect("/login?next=/admin");

  const admin = await findAdmin(data.user.id);
  if (!admin) redirect("/dashboard");
  if (!allowed.includes(admin.role)) redirect("/admin");
  return admin;
}
