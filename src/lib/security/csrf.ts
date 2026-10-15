import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";

// Cookies are sent automatically, so a hostile site could make a signed in member's browser
// call this API. Browsers always add an Origin header to cross site POST requests, so every
// request that changes data must come from our own origin.
const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);
const EXEMPT = new Set(["/api/csp-report"]); // sent by the browser itself

function allowedOrigins(request: NextRequest): Set<string> {
  const set = new Set<string>([request.nextUrl.origin]);
  try { set.add(new URL(env.siteUrl).origin); } catch { /* ignored */ }
  for (const o of (process.env.ALLOWED_ORIGINS ?? "").split(",")) if (o.trim()) set.add(o.trim());
  return set;
}

const deny = () =>
  NextResponse.json({ error: { code: "CSRF_BLOCKED", message: "This request was blocked for your safety." } }, { status: 403 });

export function csrfBlocked(request: NextRequest): NextResponse | null {
  if (SAFE.has(request.method) || EXEMPT.has(request.nextUrl.pathname)) return null;

  const allowed = allowedOrigins(request);
  const origin = request.headers.get("origin");
  if (origin) return allowed.has(origin) ? null : deny();

  const referer = request.headers.get("referer");
  if (referer) {
    try { return allowed.has(new URL(referer).origin) ? null : deny(); } catch { return deny(); }
  }

  // No Origin and no Referer: not a normal browser request. Only allow it without cookies.
  return request.cookies.size > 0 ? deny() : null;
}
