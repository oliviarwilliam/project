import Link from "next/link";
import { PackageForm } from "@/components/admin/package-form";
import { PageHeader } from "@/components/dashboard/ui";
import { requireAdminPage } from "@/lib/admin";

export const metadata = { title: "Admin: New package" };

export default async function NewPackagePage() {
  await requireAdminPage();
  return (
    <>
      <PageHeader title="New package" action={<Link href="/admin/packages" className="text-sm font-medium text-brand">Back to packages</Link>} />
      <PackageForm mode="create" />
    </>
  );
}
