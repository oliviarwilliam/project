import { env } from "@/lib/env";

// Content Security Policy with a per request nonce. Next.js reads the nonce from the request
// header and adds it to its own scripts. 'strict-dynamic' lets those scripts load their chunks.
export function buildCsp(nonce: string): string {
  const prod = process.env.NODE_ENV === "production";
  const supabase = new URL(env.supabaseUrl).origin;

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(prod ? [] : ["'unsafe-eval'"])],
    "style-src": ["'self'", "'unsafe-inline'"], // React inline style attributes
    "img-src": ["'self'", "data:", "blob:", supabase], // avatars live in Supabase storage
    "font-src": ["'self'"],
    "connect-src": ["'self'", supabase, supabase.replace("https://", "wss://")],
    "manifest-src": ["'self'"],
    "worker-src": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
    "report-uri": ["/api/csp-report"],
    ...(prod ? { "upgrade-insecure-requests": [] } : {}),
  };

  return Object.entries(directives).map(([k, v]) => [k, ...v].join(" ")).join("; ");
}

// Start in report only mode, check the browser console and /api/csp-report logs, then set CSP_MODE=enforce.
export const cspHeaderName = () =>
  process.env.CSP_MODE === "enforce" ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only";
