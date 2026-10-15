import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { AUTH_ONLY_ROUTES, PROTECTED_ROUTES } from "@/data/routes";

const matches = (path: string, routes: readonly string[]) =>
  routes.some((route) => path === route || path.startsWith(`${route}/`));

// extraHeaders are added to the request the pages see (the CSP nonce travels this way).
export async function updateSession(request: NextRequest, extraHeaders: Record<string, string> = {}) {
  const next = () => {
    const headers = new Headers(request.headers);
    for (const [key, value] of Object.entries(extraHeaders)) headers.set(key, value);
    return NextResponse.next({ request: { headers } });
  };
  let response = next();

  const supabase = createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(list: { name: string; value: string; options: CookieOptions }[]) {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = next();
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // getUser() validates the token with Supabase. Do not swap it for getSession().
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  const path = request.nextUrl.pathname;

  // API routes answer with JSON errors themselves. The session is still refreshed above.
  if (path.startsWith("/api/")) return response;

  if (!user && matches(path, PROTECTED_ROUTES)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(path)}`;
    return NextResponse.redirect(url);
  }

  if (user && matches(path, AUTH_ONLY_ROUTES)) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}
