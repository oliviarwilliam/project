import type { Errors } from "@/lib/validation";

export type ApiResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; message: string; errors?: Errors; code?: string };

export async function sendJson(url: string, body?: unknown, method = "POST"): Promise<ApiResult> {
  try {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok && json.ok) return { ok: true, data: json };
    return {
      ok: false,
      message: json.message ?? "Something went wrong. Try again.",
      errors: json.errors,
      code: json.code,
    };
  } catch {
    return { ok: false, message: "Network error. Check your connection and try again." };
  }
}
