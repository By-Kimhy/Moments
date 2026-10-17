// Money is stored as a whole number in the currency's smallest unit: USD in cents, KHR in riel
// (riel has no smaller unit in use). Never floats. Totals are kept per currency, never converted.
// No imports: the web app uses this file too.

export type Currency = "USD" | "KHR";

export const MAX_AMOUNT: Record<Currency, number> = {
  USD: 10_000_000, // $100,000.00
  KHR: 400_000_000, // ៛400,000,000
};

const KHMER_DIGITS = "០១២៣៤៥៦៧៨៩";

/**
 * "50", "50.5", "$1,200.00", "១០០ ០០០", "100000៛" → minor units. Null if it isn't a valid
 * amount for the currency (KHR has no decimals; USD has at most two).
 */
export function parseAmount(input: string, currency: Currency): number | null {
  const text = input
    .replace(/[០-៩]/g, (d) => String(KHMER_DIGITS.indexOf(d)))
    .replace(/[\s,$៛]|usd|khr|riel/gi, "");
  if (currency === "KHR") {
    if (!/^\d+$/.test(text)) return null;
    const riel = Number(text);
    return riel > 0 && riel <= MAX_AMOUNT.KHR ? riel : null;
  }
  const match = text.match(/^(\d+)(?:\.(\d{1,2}))?$/);
  if (!match) return null;
  const cents = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return cents > 0 && cents <= MAX_AMOUNT.USD ? cents : null;
}

/** 5000 USD → "$50.00", 200000 KHR → "200,000៛". */
export function formatAmount(amount: number, currency: Currency, khmerDigits = false) {
  const text =
    currency === "USD"
      ? `$${(amount / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : `${amount.toLocaleString("en-US")}៛`;
  return khmerDigits ? text.replace(/\d/g, (d) => KHMER_DIGITS[Number(d)]) : text;
}
