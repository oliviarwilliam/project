export type AdminRole = "super_admin" | "admin" | "finance" | "support";

export const ALL_ADMIN_ROLES: readonly AdminRole[] = ["super_admin", "admin", "finance", "support"];
export const MANAGE_ROLES: readonly AdminRole[] = ["super_admin", "admin"];
export const FINANCE_ROLES: readonly AdminRole[] = ["super_admin", "admin", "finance"];
export const USER_ROLES: readonly AdminRole[] = ["super_admin", "admin", "support"];
