// Runs once when the server starts. A wrong configuration stops the deploy instead of failing later.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const prod = process.env.NODE_ENV === "production";
  const problems: string[] = [];
  const warnings: string[] = [];

  const need = (name: string, minLength = 1) => {
    const value = process.env[name];
    if (!value || value.length < minLength) problems.push(minLength > 1 ? `${name} is missing or shorter than ${minLength} characters` : `${name} is missing`);
    return value;
  };

  need("NEXT_PUBLIC_SUPABASE_URL");
  need("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  need("SUPABASE_SERVICE_ROLE_KEY");
  need("PAYSTACK_SECRET_KEY");
  need("CRON_SECRET", 32);
  const site = need("NEXT_PUBLIC_SITE_URL");

  if (prod && site && !site.startsWith("https://")) problems.push("NEXT_PUBLIC_SITE_URL must start with https:// in production");
  if (prod && process.env.PAYSTACK_SECRET_KEY?.startsWith("sk_test")) warnings.push("PAYSTACK_SECRET_KEY is a test key");
  if (prod && process.env.CSP_MODE !== "enforce") warnings.push("CSP_MODE is not enforce. The policy is only reporting.");
  if (prod && process.env.RATE_LIMIT_DISABLED === "true") problems.push("RATE_LIMIT_DISABLED must not be set in production");

  for (const message of warnings) console.warn(JSON.stringify({ level: "warn", event: "config.warning", message }));
  if (problems.length > 0) {
    const message = `Invalid configuration: ${problems.join("; ")}`;
    if (prod) throw new Error(message);
    console.warn(JSON.stringify({ level: "warn", event: "config.invalid", message }));
  }
}
