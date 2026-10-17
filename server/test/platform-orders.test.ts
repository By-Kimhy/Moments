import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { prisma } from "../src/db.js";
import { addMonths } from "../src/lib/plans.js";
import { sampleEvent, signIn } from "./helpers.js";

async function admin() {
  const a = await signIn("Platform Admin");
  await prisma.user.update({ where: { id: a.user.id }, data: { isAdmin: true } });
  return a;
}

const day = 86_400_000;

describe("addMonths", () => {
  it("keeps the day, or the month's last day", () => {
    expect(addMonths(new Date("2026-01-31T10:00:00Z"), 1).toISOString()).toBe("2026-02-28T10:00:00.000Z");
    expect(addMonths(new Date("2026-03-15T00:00:00Z"), 12).toISOString()).toBe("2027-03-15T00:00:00.000Z");
  });
});

describe("featured vendors", () => {
  it("pay for days at the top of the directory, adding on to a running placement", async () => {
    const owner = await signIn("Vendor");
    const vendor = (await owner.agent.post("/api/vendors/mine").send({ name: "Featured Co", category: "MC", province: "kep", descriptionKm: "x", phone: "012 000 111" }).expect(201)).body.vendor;
    const base = `/api/vendors/mine/${vendor.id}/featured`;
    // Not before it is published.
    expect((await owner.agent.get(base).expect(200)).body).toMatchObject({ canBuy: false, featuredUntil: null });
    await owner.agent.post(`${base}/orders`).send({ days: 30 }).expect(409);
    await owner.agent.post(`/api/vendors/mine/${vendor.id}/photos`).attach("photos", await sharp({ create: { width: 10, height: 10, channels: 3, background: "#000" } }).jpeg().toBuffer(), "a.jpg");
    await owner.agent.post(`/api/vendors/mine/${vendor.id}/submit`).expect(200);
    const a = await admin();
    await a.agent.post(`/api/admin/vendors/${vendor.id}/approve`).expect(200);

    await owner.agent.post(`${base}/orders`).send({ days: 7 }).expect(400);
    const order = (await owner.agent.post(`${base}/orders`).send({ days: 30 }).expect(201)).body.order;
    expect(order).toMatchObject({ purpose: "VENDOR_FEATURED", units: 30, amount: 1500, status: "PENDING" });
    const queue = (await a.agent.get("/api/admin/plan-orders").expect(200)).body.orders;
    expect(queue.find((o: { id: string }) => o.id === order.id)).toMatchObject({ target: { titleKm: "Featured Co" }, payer: { name: "Vendor" } });
    await a.agent.post(`/api/admin/plan-orders/${order.id}/confirm`).expect(200);
    const first = new Date((await owner.agent.get(base)).body.featuredUntil).getTime();
    expect(Math.abs(first - (Date.now() + 30 * day))).toBeLessThan(60_000);

    const more = (await owner.agent.post(`${base}/orders`).send({ days: 90 }).expect(201)).body.order;
    await a.agent.post(`/api/admin/plan-orders/${more.id}/confirm`).expect(200);
    const second = new Date((await owner.agent.get(base)).body.featuredUntil).getTime();
    expect(second - first).toBe(90 * day);
    expect(await prisma.payment.count({ where: { reference: { in: [`plan:${order.id}`, `plan:${more.id}`] }, eventId: null } })).toBe(2);

    // Other people can't buy for this vendor.
    const stranger = await signIn();
    await stranger.agent.post(`${base}/orders`).send({ days: 30 }).expect(404);
  });
});

describe("planner subscriptions", () => {
  it("start with a trial, stop new client events when it ends, and renew by month", async () => {
    const owner = await signIn("Planner");
    const org = (await owner.agent.post("/api/organizations").send({ name: "Golden Day" }).expect(201)).body.organization;
    const base = `/api/organizations/${org.id}`;
    const sub = (await owner.agent.get(`${base}/subscription`).expect(200)).body;
    expect(sub.active).toBe(true);
    expect(Math.abs(new Date(sub.paidUntil).getTime() - (Date.now() + 30 * day))).toBeLessThan(60_000);
    await owner.agent.post(`${base}/events`).send(sampleEvent).expect(201);

    await prisma.organization.update({ where: { id: org.id }, data: { paidUntil: new Date(Date.now() - day) } });
    const ended = await owner.agent.post(`${base}/events`).set("Accept-Language", "km").send(sampleEvent).expect(402);
    expect(ended.body.error).toContain("ការជាវ");

    const order = (await owner.agent.post(`${base}/subscription/orders`).send({ months: 12 }).expect(201)).body.order;
    expect(order).toMatchObject({ purpose: "PLANNER_SUBSCRIPTION", units: 12, amount: 30000 });
    const a = await admin();
    await a.agent.post(`/api/admin/plan-orders/${order.id}/confirm`).expect(200);
    const renewed = (await owner.agent.get(`${base}/subscription`)).body;
    expect(renewed.active).toBe(true);
    expect(new Date(renewed.paidUntil).getTime()).toBeGreaterThan(Date.now() + 360 * day);
    await owner.agent.post(`${base}/events`).send(sampleEvent).expect(201);
  });

  it("is bought by the organization's owners", async () => {
    const owner = await signIn("Planner");
    const org = (await owner.agent.post("/api/organizations").send({ name: "Org" }).expect(201)).body.organization;
    const staffPhone = `0${Math.floor(70000000 + Math.random() * 9999999)}`;
    await owner.agent.post(`/api/organizations/${org.id}/members`).send({ phone: staffPhone, name: "Staff" }).expect(201);
    const staff = await signIn("Staff", staffPhone);
    await staff.agent.get(`/api/organizations/${org.id}/subscription`).expect(200);
    await staff.agent.post(`/api/organizations/${org.id}/subscription/orders`).send({ months: 1 }).expect(403);
  });
});
