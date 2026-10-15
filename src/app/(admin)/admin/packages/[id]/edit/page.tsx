import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/admin";
import { PageHeader } from "@/components/dashboard/ui";
import { PackageForm } from "@/components/admin/package-form";
import * as packages from "@/services/packages";
import { WalletError } from "@/services/wallet";

export const metadata = { title: "Admin: Edit package" };

type Props = { params: Promise<{ id: string }> };

export default async function EditPackagePage({ params }: Props) {
  await requireAdminPage();
  const { id } = await params;

  const pkg = await packages.adminGet(id).catch((error) => {
    if (error instanceof WalletError && ["PACKAGE_NOT_FOUND", "VALIDATION_ERROR"].includes(error.code)) return null;
    throw error;
  });
  if (!pkg) notFound();

  return (
    <>
      <PageHeader title={`Edit ${pkg.name}`} subtitle={pkg.activeSubscribers > 0 ? `${pkg.activeSubscribers} members are using this package. Their terms will not change.` : undefined} />
      <PackageForm
        mode="edit"
        packageId={pkg.id}
        initial={{
          name: pkg.name,
          price: String(pkg.price),
          dailyProfitPercent: String(pkg.dailyProfitPercent),
          durationDays: String(pkg.durationDays),
          status: pkg.status,
          description: pkg.description ?? "",
          maxPerUser: pkg.maxPerUser === null ? "" : String(pkg.maxPerUser),
          sortOrder: String(pkg.sortOrder),
          currency: pkg.currency,
        }}
      />
    </>
  );
}
