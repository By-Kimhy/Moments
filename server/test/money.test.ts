import { describe, expect, it } from "vitest";
import { type GiftForTotals, giftTotals } from "../src/lib/gifts.js";
import { formatAmount, parseAmount } from "../src/lib/money.js";

describe("parseAmount", () => {
  it.each([
    ["50", "USD", 5000],
    ["50.5", "USD", 5050],
    ["$1,200.00", "USD", 120000],
    ["0.99", "USD", 99],
    ["100000", "KHR", 100000],
    ["100,000៛", "KHR", 100000],
    ["១០០ ០០០", "KHR", 100000],
  ] as const)("%s %s → %d", (input, currency, expected) => {
    expect(parseAmount(input, currency)).toBe(expected);
  });

  it.each([
    ["", "USD"],
    ["abc", "USD"],
    ["0", "USD"],
    ["-5", "USD"],
    ["1.234", "USD"],
    ["100000.01", "USD"],
    ["1000.5", "KHR"],
    ["0", "KHR"],
    ["500000000", "KHR"],
  ] as const)("rejects %j %s", (input, currency) => {
    expect(parseAmount(input, currency)).toBeNull();
  });

  it("never goes through floating point", () => {
    expect(parseAmount("0.29", "USD")).toBe(29); // 0.29 * 100 = 28.999999999999996
    expect(parseAmount("1.15", "USD")).toBe(115);
  });
});

describe("formatAmount", () => {
  it("formats both currencies, optionally with Khmer digits", () => {
    expect(formatAmount(120050, "USD")).toBe("$1,200.50");
    expect(formatAmount(200000, "KHR")).toBe("200,000៛");
    expect(formatAmount(5000, "USD", true)).toBe("$៥០.០០");
  });
});

describe("giftTotals", () => {
  const gift = (overrides: Partial<GiftForTotals>): GiftForTotals => ({
    amount: 5000,
    currency: "USD",
    method: "CASH",
    status: "CONFIRMED",
    voidedAt: null,
    guest: { side: "GROOM", group: "Family" },
    ...overrides,
  });

  it("adds confirmed gifts per currency and keeps pending, voided and rejected out", () => {
    const totals = giftTotals([
      gift({}),
      gift({ amount: 10000, guest: { side: "BRIDE", group: "Friends" } }),
      gift({ amount: 200000, currency: "KHR", method: "KHQR" }),
      gift({ amount: 999999, voidedAt: new Date() }),
      gift({ amount: 3000, status: "PENDING", method: "KHQR" }),
      gift({ amount: 777, status: "REJECTED" }),
      gift({ amount: 2500, guest: null }),
    ]);
    expect(totals.total).toEqual({ USD: 17500, KHR: 200000 });
    expect(totals.count).toBe(4);
    expect(totals.pending).toEqual({ USD: 3000, KHR: 0 });
    expect(totals.pendingCount).toBe(1);
    expect(totals.byMethod).toEqual({ CASH: { USD: 17500, KHR: 0 }, KHQR: { USD: 0, KHR: 200000 } });
    expect(totals.bySide.GROOM).toEqual({ USD: 5000, KHR: 200000 });
    expect(totals.bySide.BRIDE).toEqual({ USD: 10000, KHR: 0 });
    expect(totals.bySide.NONE).toEqual({ USD: 2500, KHR: 0 });
    expect(totals.byGroup.map((g) => [g.group, g.count])).toEqual([
      ["Friends", 1],
      ["Family", 2],
      ["", 1],
    ]);
  });

  it("is all zeros with no gifts", () => {
    expect(giftTotals([]).total).toEqual({ USD: 0, KHR: 0 });
  });
});
