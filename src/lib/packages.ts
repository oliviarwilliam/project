export type PackageStatus = "draft" | "active" | "archived"; // archived is shown as "Disabled"

export const STATUS_LABEL: Record<PackageStatus, string> = {
  draft: "Draft",
  active: "Active",
  archived: "Disabled",
};
