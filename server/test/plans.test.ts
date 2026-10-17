import { randomUUID } from "node:crypto";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { prisma } from "../src/db.js";
import { PLANS, effectivePlan, featuresOf, upgradePrice } from "../src/lib/plans.js";
import { app, hostWithEvent, joinDesk, sampleEvent, signIn } from "./helpers.js";

async function admin() {
  const a = await signIn("Platform Admin");
  await prisma.user.update({ where: { id: a.user.id }, data: { isAdmin: true } });
  return a;
}

const guests = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `Guest ${i + 1}`, side: "BRIDE", invitedCount: 1 }));

describe("plans", () => {
  it("prices upgrades as the difference and gives planners and ticketed events everything", () => {
    expect(upgradePrice("FREE", "STANDARD")).toBe(2000);
    expect(upgradePrice("STANDARD", "PREMIUM")).toBe(3000);
    expect(upgradePrice("PREMIUM", "STANDARD")).toBeNull();
    expect(upgradePrice("STANDARD", "STANDARD")).toBeNull();
    expect(effectivePlan({ plan: "FREE", organizationId: randomUUID(), type: "WEDDING" })).toBe("PLANNER");
    expect(featuresOf({ plan: "FREE", organizationId: null, type: "TICKETED" }).seating).toBe(true);
    expect(featuresOf({ plan: "FREE", organizationId: null, type: "WEDDING" })).toMatchObject({ maxGuests: 100, seating: false, branding: true });
  });

  it("starts new events on the free plan with its limits", async () => {
    const { agent, event, helperCode } = await hostWithEvent().then((h) => ({ ...h, helperCode: h.event.helperCode }));
    const base = `/api/events/${event.id}`;
    const view = (await agent.get(base).expect(200)).body.event;
    expect(view).toMatchObject({ plan: "FREE", effectivePlan: "FREE", features: { maxGuests: 100, allTemplates: false } });

    // Guests: up to 100 (imports included); walk-ins at the desk still get in.
    await agent.post(`${base}/guests/bulk`).send({ guests: guests(99) }).expect(201);
    await agent.post(`${base}/guests/bulk`).send({ guests: guests(2) }).expect(402);
    await agent.post(`${base}/guests`).send({ name: "One more", side: "GROOM", invitedCount: 1 }).expect(201);
    const full = await agent.post(`${base}/guests`).set("Accept-Language", "km").send({ name: "Too many", side: "GROOM", invitedCount: 1 }).expect(402);
    expect(full.body.error).toBe("គម្រោងនេះអនុញ្ញាតភ្ញៀវបានច្រើនបំផុត ១០០ នាក់។ សូមដំឡើងគម្រោង ដើម្បីបន្ថែមទៀត។");
    const helper = await joinDesk(helperCode);
    await helper.agent.post(`${base}/desk/walk-ins`).send({ name: "Walk-in", side: "GROOM", peopleCount: 1, clientId: randomUUID() }).expect(201);

    // Templates: only the traditional one.
    const modern = await prisma.template.findUniqueOrThrow({ where: { slug: "modern" } });
    const traditional = await prisma.template.findUniqueOrThrow({ where: { slug: "traditional" } });
    await agent.patch(base).send({ templateId: modern.id }).expect(402);
    await agent.patch(base).send({ templateId: traditional.id }).expect(200);
    const signedIn = await signIn();
    await signedIn.agent.post("/api/events").send({ ...sampleEvent, templateId: modern.id }).expect(402);

    // Seating and thank-you SMS: Premium. Reading the tables stays open.
    await agent.get(`${base}/seating`).expect(200);
    await agent.post(`${base}/tables`).send({ name: "1" }).expect(402);
    await agent.post(`${base}/thank-you/send`).send({ audience: "ALL", language: "KM" }).expect(402);

    // Invitations carry the Moments credit.
    await agent.patch(base).send({ status: "PUBLISHED" }).expect(200);
    const guest = await prisma.guest.findFirstOrThrow({ where: { eventId: event.id, walkIn: false } });
    expect((await request(app).get(`/api/invitations/${guest.inviteToken}`).expect(200)).body.event.branding).toBe(true);
  });

  it("upgrades after an admin confirms the payment", async () => {
    const { agent, event } = await hostWithEvent();
    const base = `/api/events/${event.id}`;
    const first = (await agent.post(`${base}/plan/orders`).send({ plan: "STANDARD" }).expect(201)).body.order;
    expect(first).toMatchObject({ plan: "STANDARD", amount: 2000, currency: "USD", status: "PENDING" });
    expect(first.reference).toMatch(/^[A-Z2-9]{6}$/);
    // Changing their mind replaces the waiting order.
    const order = (await agent.post(`${base}/plan/orders`).send({ plan: "PREMIUM" }).expect(201)).body.order;
    const page = (await agent.get(`${base}/plan`).expect(200)).body;
    expect(page.pending).toMatchObject({ id: order.id, amount: 5000 });
    expect(page.orders.find((o: { id: string }) => o.id === first.id).status).toBe("CANCELLED");
    expect(page.plans.map((p: { plan: string; upgradePrice: number | null }) => [p.plan, p.upgradePrice])).toEqual([
      ["FREE", null],
      ["STANDARD", 2000],
      ["PREMIUM", 5000],
    ]);

    // Only platform admins confirm, once.
    await agent.post(`/api/admin/plan-orders/${order.id}/confirm`).expect(404);
    const a = await admin();
    const queue = (await a.agent.get("/api/admin/plan-orders").expect(200)).body.orders;
    expect(queue.map((o: { id: string }) => o.id)).toContain(order.id);
    expect(queue.map((o: { id: string }) => o.id)).not.toContain(first.id);
    await a.agent.post(`/api/admin/plan-orders/${first.id}/confirm`).expect(409);
    await a.agent.post(`/api/admin/plan-orders/${order.id}/confirm`).expect(200);
    await a.agent.post(`/api/admin/plan-orders/${order.id}/confirm`).expect(409);

    const after = (await agent.get(base)).body.event;
    expect(after).toMatchObject({ plan: "PREMIUM", features: { seating: true, maxGuests: PLANS.PREMIUM.maxGuests } });
    const payment = await prisma.payment.findFirstOrThrow({ where: { eventId: event.id, reference: `plan:${order.id}` } });
    expect(payment).toMatchObject({ amount: 5000, currency: "USD", status: "PAID" });
    const log = await prisma.auditLog.findFirstOrThrow({ where: { eventId: event.id, action: "plan_upgrade" } });
    expect(log.before).toEqual({ plan: "FREE" });
    await agent.post(`${base}/tables`).send({ name: "1" }).expect(201);
    await agent.post(`${base}/plan/orders`).send({ plan: "STANDARD" }).expect(409);
  });

  it("charges only the difference from Standard to Premium, and the hosts can cancel", async () => {
    const { agent, event } = await hostWithEvent(undefined, "STANDARD");
    const base = `/api/events/${event.id}`;
    const order = (await agent.post(`${base}/plan/orders`).send({ plan: "PREMIUM" }).expect(201)).body.order;
    expect(order.amount).toBe(3000);
    const helper = await joinDesk(event.helperCode);
    await helper.agent.get(`${base}/plan`).expect(403);
    await agent.post(`${base}/plan/orders/${order.id}/cancel`).expect(204);
    await agent.post(`${base}/plan/orders/${order.id}/cancel`).expect(409);
    expect((await agent.get(`${base}/plan`)).body.pending).toBeNull();
  });

  it("doesn't sell plans to planner events", async () => {
    const owner = await signIn("Planner");
    const org = (await owner.agent.post("/api/organizations").send({ name: "Golden Day" }).expect(201)).body.organization;
    const event = (await owner.agent.post(`/api/organizations/${org.id}/events`).send(sampleEvent).expect(201)).body.event;
    expect(event).toMatchObject({ plan: "FREE", effectivePlan: "PLANNER", features: { seating: true } });
    await owner.agent.post(`/api/events/${event.id}/plan/orders`).send({ plan: "PREMIUM" }).expect(409);
  });
});
