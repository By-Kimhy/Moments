// Bakong Open API: asks whether a KHQR was paid, by the MD5 of its string. Set BAKONG_TOKEN (from
// the NBC's Bakong API registration) and the platform's BAKONG_ACCOUNT_ID to turn it on.
import { config } from "../config.js";

export type BakongPayment = { hash: string; amount: number; currency: "USD" | "KHR"; fromAccountId: string | null };

export interface BakongClient {
  /** The payment for this QR, or null if it hasn't been paid (yet). */
  checkByMd5(md5: string): Promise<BakongPayment | null>;
}

export class HttpBakongClient implements BakongClient {
  constructor(
    private token: string,
    private apiBase: string,
  ) {}

  async checkByMd5(md5: string) {
    const res = await fetch(`${this.apiBase}/v1/check_transaction_by_md5`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.token}` },
      body: JSON.stringify({ md5 }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Bakong check failed: ${res.status}`);
    const data = (await res.json()) as {
      responseCode: number;
      data?: { hash: string; amount: number; currency: string; fromAccountId?: string } | null;
    };
    // responseCode 0 with data: found. Anything else: not paid yet.
    if (data.responseCode !== 0 || !data.data) return null;
    const currency = data.data.currency === "KHR" ? "KHR" : "USD";
    return {
      hash: data.data.hash,
      currency,
      amount: currency === "USD" ? Math.round(data.data.amount * 100) : Math.round(data.data.amount),
      fromAccountId: data.data.fromAccountId ?? null,
    } satisfies BakongPayment;
  }
}

let client: BakongClient | null | undefined;

export function bakong(): BakongClient | null {
  if (client === undefined) {
    const token = config.bakongToken();
    client = token && config.bakongAccountId() ? new HttpBakongClient(token, config.bakongApiBase()) : null;
  }
  return client;
}

/** Tests swap in a fake (or null to turn it off). */
export function setBakongClient(next: BakongClient | null) {
  client = next;
}
