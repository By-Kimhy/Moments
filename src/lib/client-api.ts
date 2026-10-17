// Browser-side calls to the API (through the /api rewrite, so the session and desk cookies go
// along). Used by the guest desk, which must keep working without page reloads.
export class ClientApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body: Record<string, unknown>,
  ) {
    super(message);
  }
}

const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const revive = (_key: string, value: unknown) => (typeof value === "string" && ISO_DATETIME.test(value) ? new Date(value) : value);

export async function clientApi<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: init.method ?? "GET",
    headers: {
      Accept: "application/json",
      "Accept-Language": document.documentElement.lang === "en" ? "en" : "km",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  const text = await res.text();
  const data = text ? JSON.parse(text, revive) : {};
  if (!res.ok) throw new ClientApiError(res.status, data.error ?? `Request failed (${res.status})`, data);
  return data as T;
}

/** First 20 hex characters of SHA-256, matching the API's tokenHash(). */
export async function hashToken(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("").slice(0, 20);
}

/** The invitation token in a scanned QR: the whole invitation URL, or the bare token. */
export function tokenFromQr(text: string) {
  const match = text.match(/\/i\/([\w-]{16,32})(?:[?#/]|$)/) ?? text.trim().match(/^([\w-]{16,32})$/);
  return match?.[1] ?? null;
}
