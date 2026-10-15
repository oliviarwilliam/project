// Browser helper for the wallet API. Throws an Error with a readable message.
export async function postWallet<T = unknown>(url: string, body: object, idempotencyKey: string): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": idempotencyKey },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error?.message ?? "Something went wrong. Please try again.");
  return json.data as T;
}
