import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/db.js";
import { buildKhqr, crc16, khqrMd5 } from "../src/lib/khqr.js";
import { checkPendingBakongOrders } from "../src/lib/platform-orders.js";
import { type BakongPayment, setBakongClient } from "../src/providers/bakong.js";
import { app, hostWithEvent } from "./helpers.js";
import request from "supertest";

/** Reads the top-level tags of an EMVCo QR string. */
function tags(qr: string) {
  const out: Record<string, string> = {};
  for (let i = 0; i < qr.length; ) {
    const tag = qr.slice(i, i + 2);
    const len = Number(qr.slice(i + 2, i + 4));
    out[tag] = qr.slice(i + 4, i + 4 + len);
    i += 4 + len;
  }
  return out;
}

describe("KHQR", () => {
  it("uses CRC-16/CCITT-FALSE", () => {
    expect(crc16("123456789")).toBe("29B1");
  });

  it("builds a dynamic QR with the account, amount, currency and reference", () => {
    const qr = buildKhqr({ accountId: "moments@aba", merchantName: "Moments", amount: 2000, currency: "USD", billNumber: "AB12CD", now: new Date(1_800_000_000_000) });
    const t = tags(qr);
    expect(t).toMatchObject({ "00": "01", "01": "12", "29": "0011moments@aba", "53": "840", "54": "20.00", "58": "KH", "59": "Moments", "62": "0106AB12CD" });
    expect(t["63"]).toBe(crc16(qr.slice(0, -4)));
    expect(tags(buildKhqr({ accountId: "a@b", merchantName: "សួស្តី", amount: 40000, currency: "KHR", billNumber: "X" }))).toMatchObject({ "53": "116", "54": "40000", "59": "Moments" });
  });
});

describe("Bakong payments", () => {
  const paid = new Map<string, BakongPayment>();
  beforeEach(() => {
    process.env.BAKONG_ACCOUNT_ID = "moments@aba";
    setBakongClient({ checkByMd5: async (md5) => paid.get(md5) ?? null });
  });
  afterEach(() => {
    delete process.env.BAKONG_ACCOUNT_ID;
    setBakongClient(null);
  });

  it("gives each order its own QR and confirms it once the full amount arrives", async () => {
    const { agent, event, user } = await hostWithEvent();
    const order = (await agent.post(`/api/events/${event.id}/plan/orders`).send({ plan: "STANDARD" }).expect(201)).body.order;
    expect(order.khqr).toBe(true);
    const stored = await prisma.planOrder.findUniqueOrThrow({ where: { id: order.id } });
    expect(tags(stored.khqr!)).toMatchObject({ "54": "20.00", "62": `0106${order.reference}` });
    const svg = await request(app).get(`/api/platform/orders/${order.id}/khqr.svg`).expect(200);
    expect(svg.headers["content-type"]).toContain("image/svg+xml");

    // Not paid yet; then too little; then the full amount.
    expect((await agent.post(`/api/platform/orders/${order.id}/check`).expect(200)).body).toEqual({ paid: false });
    paid.set(stored.khqrMd5!, { hash: "h1", amount: 1000, currency: "USD", fromAccountId: "guest@aba" });
    expect((await agent.post(`/api/platform/orders/${order.id}/check`).expect(200)).body).toEqual({ paid: false });
    paid.set(stored.khqrMd5!, { hash: "abc123", amount: 2000, currency: "USD", fromAccountId: "dara@aba" });
    expect((await agent.post(`/api/platform/orders/${order.id}/check`).expect(200)).body).toEqual({ paid: true });

    expect((await agent.get(`/api/events/${event.id}`)).body.event.plan).toBe("STANDARD");
    const payment = await prisma.payment.findFirstOrThrow({ where: { provider: "bakong", reference: "abc123" } });
    expect(payment).toMatchObject({ amount: 2000, eventId: event.id });
    expect((await prisma.planOrder.findUniqueOrThrow({ where: { id: order.id } })).confirmedById).toBeNull();
    // The QR is gone once paid, and checking again changes nothing.
    await request(app).get(`/api/platform/orders/${order.id}/khqr.svg`).expect(404);
    expect((await agent.post(`/api/platform/orders/${order.id}/check`)).body).toEqual({ paid: true });
    expect(await prisma.payment.count({ where: { reference: { in: ["abc123", `plan:${order.id}`] } } })).toBe(1);
    expect(user.id).toBeTruthy();
  });

  it("finds payments in the background", async () => {
    const { agent, event } = await hostWithEvent();
    const order = (await agent.post(`/api/events/${event.id}/plan/orders`).send({ plan: "PREMIUM" }).expect(201)).body.order;
    const { khqrMd5: md5 } = await prisma.planOrder.findUniqueOrThrow({ where: { id: order.id } });
    paid.set(md5!, { hash: `bg-${order.id}`, amount: 5000, currency: "USD", fromAccountId: null });
    await checkPendingBakongOrders();
    expect((await prisma.planOrder.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("PAID");
  });

  it("only lets the payer ask", async () => {
    const { agent, event } = await hostWithEvent();
    const order = (await agent.post(`/api/events/${event.id}/plan/orders`).send({ plan: "STANDARD" }).expect(201)).body.order;
    const other = await hostWithEvent();
    await other.agent.post(`/api/platform/orders/${order.id}/check`).expect(404);
  });
});

describe("without Bakong", () => {
  it("orders have no QR of their own and wait for an admin", async () => {
    const { agent, event } = await hostWithEvent();
    const order = (await agent.post(`/api/events/${event.id}/plan/orders`).send({ plan: "STANDARD" }).expect(201)).body.order;
    expect(order.khqr).toBe(false);
    expect((await agent.post(`/api/platform/orders/${order.id}/check`).expect(200)).body).toEqual({ paid: false });
    expect(khqrMd5("x")).toHaveLength(32);
  });
});
