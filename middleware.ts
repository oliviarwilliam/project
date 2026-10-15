import type { NextRequest } from "next/server";
import { buildCsp, cspHeaderName } from "@/lib/security/csp";
import { csrfBlocked } from "@/lib/security/csrf";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  // 1. Requests that change data must come from our own site.
  const blocked = csrfBlocked(request);
  if (blocked) return blocked;

  // 2. A fresh nonce per request lets Next.js and next-themes run their inline scripts under a strict CSP.
  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp(nonce);
  const header = cspHeaderName();

  // 3. Refresh the session and protect pages.
  const response = await updateSession(request, { "x-nonce": nonce, [header.toLowerCase()]: csp });
  response.headers.set(header, csp);
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/webhooks|api/cron|api/health|api/csp-report|sw.js|offline.html|manifest.webmanifest|robots.txt|sitemap.xml|icons/|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)",
  ],
};
