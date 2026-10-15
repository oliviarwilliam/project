// Static checks that fail the build pipeline when a security rule is broken. No dependencies.
// Run: npm run security:check
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const problems = [];
const fail = (msg) => problems.push(msg);

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}
const rel = (p) => relative(root, p).replaceAll("\\", "/");
const read = (p) => readFileSync(p, "utf8");
const src = walk(join(root, "src"));

// 1. Every API route has an access rule.
const PUBLIC_ROUTES = [/\/api\/packages\/route\.ts$/, /\/api\/health\//, /\/api\/csp-report\//, /\/api\/auth\//, /\/auth\/callback\//];
for (const file of src.filter((f) => /\/route\.ts$/.test(rel(f)))) {
  const path = "/" + rel(file), text = read(file);
  if (/\/api\/admin\//.test(path)) {
    if (!/requireAdmin\(\s*[A-Za-z_\[]/.test(text)) fail(`${rel(file)}: admin route must call requireAdmin with a list of roles`);
  } else if (/\/api\/webhooks\//.test(path)) {
    if (!text.includes("hasValidSignature")) fail(`${rel(file)}: webhook must verify the signature`);
  } else if (/\/api\/cron\//.test(path)) {
    if (!text.includes("hasBearer")) fail(`${rel(file)}: cron route must check the bearer secret`);
  } else if (!PUBLIC_ROUTES.some((re) => re.test(path))) {
    if (!/requireUser\(|requireAdmin\(/.test(text)) fail(`${rel(file)}: route is neither public nor protected`);
  }
}

// 2. Auth routes that guess-able targets must be rate limited.
for (const file of src.filter((f) => /\/api\/auth\/(login|register|forgot-password|reset-password|resend-email|phone)/.test(rel(f)))) {
  if (!read(file).includes("limited(")) fail(`${rel(file)}: missing rate limit`);
}

// 3. Browser code must not import server secrets.
for (const file of src.filter((f) => /\.(ts|tsx)$/.test(f))) {
  const text = read(file);
  if (/^\s*["']use client["']/.test(text) && /supabase\/admin|env\.server|server-only|services\//.test(text.replace(/import type[^\n]*\n/g, ""))) {
    fail(`${rel(file)}: client component imports server only code`);
  }
}

// 4. No secret in a NEXT_PUBLIC variable.
const envText = [".env.example", "render.yaml"].filter((f) => existsSync(f)).map((f) => read(f)).join("\n");
for (const m of envText.matchAll(/NEXT_PUBLIC_[A-Z_]+/g)) {
  if (/SECRET|SERVICE|PRIVATE|PASSWORD/.test(m[0])) fail(`${m[0]}: public variables are visible to everyone`);
}

// 5. Database: row level security on every table, and safe SECURITY DEFINER functions.
const sql = walk(join(root, "supabase/migrations")).filter((f) => f.endsWith(".sql")).sort().map(read).join("\n").replace(/[ \t]+/g, " ");
for (const m of sql.matchAll(/create table public\.([a-z_]+)/g)) {
  if (!new RegExp(`alter table public\\.${m[1]} enable row level security`).test(sql)) fail(`table ${m[1]}: row level security is not enabled`);
}
for (const m of sql.matchAll(/create (?:or replace )?function (public\.[a-z_]+)\(([\s\S]*?)\) ?returns([\s\S]*?)(?:as \$\$|as \$[a-z]+\$)/g)) {
  const header = m[3].toLowerCase();
  if (header.includes("security definer") && !header.includes("search_path")) fail(`function ${m[1]}: SECURITY DEFINER without a fixed search_path`);
}

// 6. Core protections are wired in.
const middleware = existsSync("middleware.ts") ? read("middleware.ts") : "";
if (!middleware.includes("csrfBlocked")) fail("middleware.ts: CSRF check is not wired in");
if (!middleware.includes("buildCsp")) fail("middleware.ts: Content Security Policy is not wired in");
if (!existsSync(".gitignore") || !/^\.env/m.test(read(".gitignore"))) fail(".gitignore: .env files must be ignored");
if (existsSync(".env") || existsSync(".env.local")) console.warn("note: a local .env file exists. Make sure it is not committed.");

if (problems.length) {
  console.error(`Security check failed (${problems.length}):`);
  for (const p of problems) console.error(" - " + p);
  process.exit(1);
}
console.log("Security check passed.");
