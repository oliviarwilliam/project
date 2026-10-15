import type { ReactNode } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { ALL_ADMIN_ROLES } from "@/lib/admin-roles";
import { requireAdminPage } from "@/lib/admin";

// Checked here for direct visits, and again in each page because layouts are not
// re-run on every client side navigation.
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const admin = await requireAdminPage(ALL_ADMIN_ROLES);
  return <AdminShell role={admin.role}>{children}</AdminShell>;
}
