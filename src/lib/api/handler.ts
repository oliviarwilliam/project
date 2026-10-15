import { NextResponse } from "next/server";
import { readBody } from "@/lib/api/body";
import { checkRate, type RateRule } from "@/lib/api/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { collect, validate, type Errors, type Rule } from "@/lib/validation";

export const ok = (data: Record<string, unknown> = {}, status = 200) =>
  NextResponse.json({ ok: true, ...data }, { status });

export const fail = (message: string, status = 400, extra: { errors?: Errors; code?: string } = {}) =>
  NextResponse.json({ ok: false, message, ...extra }, { status });

/** Read the JSON body and validate it. Returns either clean values or a ready error response. */
export async function parse<K extends string>(request: Request, schema: Record<K, Rule>) {
  const read = await readBody(request);
  if (!read.ok) {
    if (read.code === "UNSUPPORTED_MEDIA_TYPE") return { response: fail("Send the request as JSON.", 415) };
    if (read.code === "PAYLOAD_TOO_LARGE") return { response: fail("That request is too large.", 413) };
    return { response: fail("Send a JSON body.", 400) };
  }
  const body = read.body;
  if (!body || typeof body !== "object") return { response: fail("Send a JSON body.", 400) };

  const values = collect(body as Record<string, unknown>, Object.keys(schema)) as Record<K, string>;
  const errors = validate(values, schema);
  if (errors) return { response: fail("Check the highlighted fields.", 422, { errors }) };

  return { values };
}

export async function requireUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return { supabase, user: data.user };
}

export const signedOut = () => fail("Log in to continue.", 401);

/** Returns a 429 response when the caller is over the limit, otherwise null. */
export async function limited(request: Request, rule: RateRule, extraKey?: string) {
  const verdict = await checkRate(request.headers, rule, extraKey);
  if (verdict.allowed) return null;
  return NextResponse.json(
    { ok: false, message: "Too many attempts. Wait a few minutes and try again.", code: "rate_limited" },
    { status: 429, headers: verdict.headers },
  );
}
