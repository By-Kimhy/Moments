// The platform admin's numbers: users, events, vendors, and income from plans and ticket fees.
// Months are counted in Phnom Penh time.
import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";

const TZ = "Asia/Phnom_Penh";
export const STATS_MONTHS = 12;

type MonthRow = { month: string; count: bigint };
type MoneyRow = { month: string; currency: "USD" | "KHR"; amount: bigint };

/** The last `STATS_MONTHS` months as "YYYY-MM", oldest first. */
export function monthKeys(now = new Date()) {
  const local = new Date(now.getTime() + 7 * 3600_000);
  return Array.from({ length: STATS_MONTHS }, (_, i) => {
    const d = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() - (STATS_MONTHS - 1 - i), 1));
    return d.toISOString().slice(0, 7);
  });
}

const since = () => {
  const [first] = monthKeys();
  // The first day of the oldest month, at midnight in Phnom Penh.
  return new Date(`${first}-01T00:00:00+07:00`);
};

async function countByMonth(table: "User" | "Event", column = "createdAt") {
  const rows = await prisma.$queryRaw<MonthRow[]>(
    Prisma.sql`SELECT to_char(date_trunc('month', ${Prisma.raw(`"${column}"`)} AT TIME ZONE 'UTC' AT TIME ZONE ${TZ}), 'YYYY-MM') AS month, count(*) AS count
               FROM ${Prisma.raw(`"${table}"`)} WHERE ${Prisma.raw(`"${column}"`)} >= ${since()} GROUP BY 1`,
  );
  return new Map(rows.map((r) => [r.month, Number(r.count)]));
}

export async function adminStats() {
  const now = new Date();
  const months = monthKeys(now);
  const in30 = new Date(now.getTime() + 30 * 86_400_000);
  const ago30 = new Date(now.getTime() - 30 * 86_400_000);

  const [users, newUsers, eventsByType, eventsByPlan, upcoming, vendorsByStatus, enquiries30, usersByMonth, eventsByMonth, planIncome, ticketFees, orgs] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: ago30 } } }),
    prisma.event.groupBy({ by: ["type"], _count: { _all: true } }),
    prisma.event.groupBy({ by: ["plan"], where: { type: "WEDDING", organizationId: null }, _count: { _all: true } }),
    prisma.event.count({ where: { startsAt: { gte: now, lte: in30 }, status: "PUBLISHED" } }),
    prisma.vendor.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.vendorEnquiry.count({ where: { createdAt: { gte: ago30 } } }),
    countByMonth("User"),
    countByMonth("Event"),
    // Money paid to the platform (plans, featured vendors, planner subscriptions).
    prisma.$queryRaw<MoneyRow[]>(
      Prisma.sql`SELECT to_char(date_trunc('month', "paidAt" AT TIME ZONE 'UTC' AT TIME ZONE ${TZ}), 'YYYY-MM') AS month, currency, sum(amount) AS amount
                 FROM "PlanOrder" WHERE status = 'PAID' AND "paidAt" >= ${since()} GROUP BY 1, 2`,
    ),
    prisma.$queryRaw<MoneyRow[]>(
      Prisma.sql`SELECT to_char(date_trunc('month', "paidAt" AT TIME ZONE 'UTC' AT TIME ZONE ${TZ}), 'YYYY-MM') AS month, currency, sum(fee) AS amount
                 FROM "Order" WHERE status = 'PAID' AND "paidAt" >= ${since()} GROUP BY 1, 2`,
    ),
    prisma.organization.count(),
  ]);

  const money = (rows: MoneyRow[], month: string) => ({
    USD: Number(rows.find((r) => r.month === month && r.currency === "USD")?.amount ?? 0),
    KHR: Number(rows.find((r) => r.month === month && r.currency === "KHR")?.amount ?? 0),
  });
  const series = months.map((month) => ({
    month,
    users: usersByMonth.get(month) ?? 0,
    events: eventsByMonth.get(month) ?? 0,
    plans: money(planIncome, month),
    ticketFees: money(ticketFees, month),
  }));
  const total = (key: "plans" | "ticketFees") => ({
    USD: series.reduce((s, m) => s + m[key].USD, 0),
    KHR: series.reduce((s, m) => s + m[key].KHR, 0),
  });
  const count = <K extends string>(rows: ({ _count: { _all: number } } & Record<string, unknown>)[], key: string) =>
    Object.fromEntries(rows.map((r) => [r[key] as K, r._count._all])) as Partial<Record<K, number>>;

  return {
    users: { total: users, last30Days: newUsers },
    events: {
      byType: count<"WEDDING" | "TICKETED">(eventsByType, "type"),
      weddingsByPlan: count<"FREE" | "STANDARD" | "PREMIUM">(eventsByPlan, "plan"),
      upcoming30Days: upcoming,
    },
    organizations: orgs,
    vendors: { byStatus: count<"DRAFT" | "PENDING_REVIEW" | "PUBLISHED" | "SUSPENDED">(vendorsByStatus, "status"), enquiries30Days: enquiries30 },
    income: { plans: total("plans"), ticketFees: total("ticketFees") },
    months: series,
  };
}
