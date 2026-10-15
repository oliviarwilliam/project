import "server-only";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

// Getters so a missing secret only fails the route that needs it.
export const serverEnv = {
  get serviceRoleKey() { return required("SUPABASE_SERVICE_ROLE_KEY"); },
  get cronSecret() { return required("CRON_SECRET"); },
  get paystackSecretKey() { return required("PAYSTACK_SECRET_KEY"); },
  // Paying withdrawals through Paystack is opt in. Off means admins pay manually.
  get transfersEnabled() { return process.env.PAYSTACK_TRANSFERS_ENABLED === "true"; },
};
