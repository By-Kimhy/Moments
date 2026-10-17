import { describe, expect, it } from "vitest";
import { prisma } from "../src/db.js";
import { monthKeys } from "../src/lib/admin-stats.js";
import { hostWithEvent, signIn } from "./helpers.js";

async function admin() {
  const a = await signIn("Platform Admin");
  await prisma.user.update({ where: { id: a.user.id }, data: { isAdmin: true } });
  return a;
}

describe("admin dashboard", () => {
  it("counts months in Phnom Penh time, oldest first", () => {
    // 17:30 UTC on 31 January is already 1 February in Phnom Penh.
    const keys = monthKeys(new Date("2026-01-31T17:30:00Z"));
    expect(keys).toHaveLength(12);
    expect(keys.at(-1)).toBe("2026-02");
    expect(keys[0]).toBe("2025-03");
  });

  it("adds a confirmed plan payment to this month's income", async () => {
    const a = await admin();
    const month = monthKeys().at(-1)!;
    const before = (await a.agent.get("/api/admin/stats").expect(200)).body;
    const thisMonth = (s: { months: { month: string; plans: { USD: number } }[] }) => s.months.find((m) => m.month === month)!.plans.USD;

    const host = await hostWithEvent();
    const order = (await host.agent.post(`/api/events/${host.event.id}/plan/orders`).send({ plan: "STANDARD" }).expect(201)).body.order;
    await a.agent.post(`/api/admin/plan-orders/${order.id}/confirm`).expect(200);

    const after = (await a.agent.get("/api/admin/stats").expect(200)).body;
    expect(thisMonth(after) - thisMonth(before)).toBe(2000);
    expect(after.income.plans.USD - before.income.plans.USD).toBe(2000);
    expect(after.users.total).toBeGreaterThan(before.users.total);
    expect(after.events.weddingsByPlan.STANDARD).toBe((before.events.weddingsByPlan.STANDARD ?? 0) + 1);
  });

  it("is for platform admins only", async () => {
    const someone = await signIn();
    await someone.agent.get("/api/admin/stats").expect(404);
  });
});
