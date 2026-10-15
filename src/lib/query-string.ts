// Builds /path?a=1&b=2 and skips empty values. Used for filters and paging links.
export function href(path: string, params: Record<string, string | number | null | undefined>): string {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== "") q.set(key, String(value));
  }
  const text = q.toString();
  return text ? `${path}?${text}` : path;
}
