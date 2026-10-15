export type BodyResult =
  | { ok: true; body: unknown }
  | { ok: false; code: "UNSUPPORTED_MEDIA_TYPE" | "PAYLOAD_TOO_LARGE" | "VALIDATION_ERROR" };

const MAX_BYTES = 64 * 1024;

// One safe way to read a JSON body: it must say it is JSON, stay small, and parse.
// Requiring the JSON content type also stops plain HTML forms from posting to the API.
export async function readBody(request: Request, maxBytes = MAX_BYTES): Promise<BodyResult> {
  if (!/^application\/json\b/i.test(request.headers.get("content-type") ?? "")) return { ok: false, code: "UNSUPPORTED_MEDIA_TYPE" };
  if (Number(request.headers.get("content-length") ?? 0) > maxBytes) return { ok: false, code: "PAYLOAD_TOO_LARGE" };

  const text = await request.text();
  if (text.length > maxBytes) return { ok: false, code: "PAYLOAD_TOO_LARGE" };
  try {
    return { ok: true, body: JSON.parse(text) };
  } catch {
    return { ok: false, code: "VALIDATION_ERROR" };
  }
}
