// Gift totals. Only confirmed, not-voided gifts count; pending KHQR gifts a guest says they
// sent are counted separately until a host confirms the money arrived.
import type { Currency, GiftMethod, GiftStatus, Side } from "@prisma/client";

export type GiftForTotals = {
  amount: number;
  currency: Currency;
  method: GiftMethod;
  status: GiftStatus;
  voidedAt: Date | null;
  guest: { side: Side; group: string | null } | null;
};

export type Money = { USD: number; KHR: number };
const zero = (): Money => ({ USD: 0, KHR: 0 });

export type GiftTotals = {
  total: Money;
  count: number;
  pending: Money;
  pendingCount: number;
  byMethod: Record<GiftMethod, Money>;
  bySide: Record<Side | "NONE", Money>;
  byGroup: { group: string; total: Money; count: number }[];
};

export function giftTotals(gifts: GiftForTotals[]): GiftTotals {
  const totals: GiftTotals = {
    total: zero(),
    count: 0,
    pending: zero(),
    pendingCount: 0,
    byMethod: { CASH: zero(), KHQR: zero() },
    bySide: { BRIDE: zero(), GROOM: zero(), BOTH: zero(), NONE: zero() },
    byGroup: [],
  };
  const groups = new Map<string, { total: Money; count: number }>();
  for (const gift of gifts) {
    if (gift.voidedAt || gift.status === "REJECTED") continue;
    if (gift.status === "PENDING") {
      totals.pending[gift.currency] += gift.amount;
      totals.pendingCount++;
      continue;
    }
    totals.total[gift.currency] += gift.amount;
    totals.count++;
    totals.byMethod[gift.method][gift.currency] += gift.amount;
    totals.bySide[gift.guest?.side ?? "NONE"][gift.currency] += gift.amount;
    const name = gift.guest?.group ?? "";
    const group = groups.get(name) ?? { total: zero(), count: 0 };
    group.total[gift.currency] += gift.amount;
    group.count++;
    groups.set(name, group);
  }
  totals.byGroup = [...groups.entries()]
    .map(([group, g]) => ({ group, ...g }))
    .sort((a, b) => b.total.USD - a.total.USD || b.total.KHR - a.total.KHR);
  return totals;
}
