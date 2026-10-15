// Browser helper for the admin API. Throws an Error with a readable message.
export async function adminRequest<T = unknown>(url: string, method: "POST" | "PATCH" | "DELETE", body?: object, idempotencyKey?: string): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { "content-type": "application/json", ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error?.message ?? "Something went wrong. Please try again.");
  return json.data as T;
}
