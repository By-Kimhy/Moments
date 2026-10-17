import { randomUUID } from "node:crypto";
import sharp from "sharp";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { prisma } from "../src/db.js";
import { drainNotifications } from "../src/jobs/notifications.js";
import { ticketHash } from "../src/lib/orders.js";
import { MockSmsProvider, sms } from "../src/providers/sms.js";
import { app, hostWithEvent, joinDesk, randomIp, randomPhone } from "./helpers.js";

type TicketType = { id: string; name: string; available: number; sold: number; held: number };

/** A published concert with KHQR and two ticket types. */
async function concert(quantity = 3) {
  const host = await hostWithEvent();
  const base = `/api/events/${host.event.id}`;
  const slug = `concert-${randomUUID().slice(0, 8)}`;
  await host.agent.patch(base).send({ type: "TICKETED", slug, status: "PUBLISHED", descriptionKm: "តន្ត្រីខ្មែរ" }).expect(200);
  const qr = await sharp({ create: { width: 50, height: 50, channels: 3, background: "#000" } }).png().toBuffer();
  await host.agent.put(`${base}/khqr`).attach("image", qr, "qr.png").expect(200);
  const vip = (await host.agent.post(`${base}/ticket-types`).send({ name: "VIP", price: 2500, currency: "USD", quantity, maxPerOrder: 4 }).expect(201)).body.ticketType;
  const normal = (await host.agent.post(`${base}/ticket-types`).send({ name: "ធម្មតា", price: 1000, currency: "USD", quantity: 100 }).expect(201)).body.ticketType;
  const riel = (await host.agent.post(`${base}/ticket-types`).send({ name: "Riel", price: 40000, currency: "KHR", quantity: 10 }).expect(201)).body.ticketType;
  return { ...host, base, slug, vip, normal, riel };
}

const buy = (slug: string, items: { ticketTypeId: string; quantity: number }[], phone = randomPhone()) =>
  request(app).post(`/api/public/events/${slug}/orders`).set("X-Forwarded-For", randomIp()).send({ buyerName: "Bora", buyerPhone: phone, items });

describe("public ticket page and orders", () => {
  it("shows the event and what is on sale", async () => {
    const { slug } = await concert();
    const page = (await request(app).get(`/api/public/events/${slug}`).expect(200)).body;
    expect(page.event).toMatchObject({ slug, descriptionKm: "តន្ត្រីខ្មែរ" });
    expect(page.ticketTypes.map((t: TicketType) => [t.name, t.available])).toEqual([
      ["VIP", 3],
      ["ធម្មតា", 100],
      ["Riel", 10],
    ]);
  });

  it("places an order that holds tickets, totals the price and records the fee", async () => {
    const { slug, vip, normal, agent, base } = await concert();
    const res = await buy(slug, [{ ticketTypeId: vip.id, quantity: 2 }, { ticketTypeId: normal.id, quantity: 1 }]).expect(201);
    const order = (await request(app).get(`/api/orders/${res.body.token}`).expect(200)).body;
    expect(order.order).toMatchObject({ status: "PENDING_PAYMENT", total: 6000, currency: "USD", tickets: [] });
    expect(order.order.reference).toMatch(/^[A-Z2-9]{6}$/);
    expect(order.event.khqrImageKey).toBeTruthy();
    const types = (await agent.get(`${base}/ticket-types`)).body.ticketTypes as TicketType[];
    expect(types.find((t) => t.name === "VIP")).toMatchObject({ held: 2, available: 1 });
    expect((await prisma.order.findUniqueOrThrow({ where: { token: res.body.token } })).fee).toBe(240); // 4% of $60
  });

  it("never sells more tickets than there are, even when buyers race", async () => {
    const { slug, vip } = await concert(3);
    const results = await Promise.all(Array.from({ length: 6 }, () => buy(slug, [{ ticketTypeId: vip.id, quantity: 1 }])));
    expect(results.filter((r) => r.status === 201)).toHaveLength(3);
    expect(results.filter((r) => r.status === 409)).toHaveLength(3);
  });

  it("validates orders", async () => {
    const { slug, vip, riel } = await concert();
    await buy(slug, [{ ticketTypeId: vip.id, quantity: 1 }, { ticketTypeId: riel.id, quantity: 1 }]).expect(400); // two currencies
    const tooMany = await buy(slug, [{ ticketTypeId: vip.id, quantity: 5 }]).expect(400);
    expect(tooMany.body.error).toContain("At most 4");
    await buy(slug, [{ ticketTypeId: vip.id, quantity: 0 }]).expect(400);
    await request(app).post(`/api/public/events/${slug}/orders`).send({ buyerName: "", buyerPhone: "1", items: [] }).expect(400);
    await request(app).get("/api/public/events/no-such-event").expect(404);
  });

  it("hides drafts and weddings", async () => {
    const { agent, base, slug } = await concert();
    await agent.patch(base).send({ status: "DRAFT" }).expect(200);
    await request(app).get(`/api/public/events/${slug}`).expect(404);
    const wedding = await hostWithEvent();
    await wedding.agent.patch(`/api/events/${wedding.event.id}`).send({ slug: `wedding-${randomUUID().slice(0, 6)}`, status: "PUBLISHED" }).expect(200);
  });

  it("keeps public links unique", async () => {
    const { slug } = await concert();
    const other = await hostWithEvent();
    await other.agent.patch(`/api/events/${other.event.id}`).send({ slug }).expect(409);
  });
});

describe("payment and tickets", () => {
  it("issues tickets when the organizer confirms payment, and tells the buyer", async () => {
    const { slug, vip, agent, base } = await concert();
    const phone = randomPhone();
    const { token } = (await buy(slug, [{ ticketTypeId: vip.id, quantity: 2 }], phone).expect(201)).body;
    await drainNotifications();
    expect((sms as MockSmsProvider).sent.get(`+855${phone.slice(1)}`)).toContain("KHQR");

    const list = (await agent.get(`${base}/orders?status=PENDING_PAYMENT`).expect(200)).body;
    const order = list.orders[0];
    const confirmed = await agent.post(`${base}/orders/${order.id}/confirm`).expect(200);
    expect(confirmed.body.order.status).toBe("PAID");
    await agent.post(`${base}/orders/${order.id}/confirm`).expect(409);
    await drainNotifications();
    expect((sms as MockSmsProvider).sent.get(`+855${phone.slice(1)}`)).toContain("tickets are ready");

    const page = (await request(app).get(`/api/orders/${token}`).expect(200)).body;
    expect(page.order.status).toBe("PAID");
    expect(page.order.tickets).toHaveLength(2);
    expect(page.event.khqrImageKey).toBeNull();
    const svg = await request(app).get(`/api/orders/${token}/tickets/${page.order.tickets[0].code}/qr.svg`).buffer(true).expect(200);
    expect(String(svg.body)).toContain("<svg");

    const summary = (await agent.get(`${base}/orders`).expect(200)).body.summary;
    expect(summary).toMatchObject({ paidOrders: 1, ticketsSold: 2, revenue: { USD: 5000, KHR: 0 }, fees: { USD: 200, KHR: 0 } });
    const payment = await prisma.payment.findFirst({ where: { reference: `order:${order.id}` } });
    expect(payment).toMatchObject({ status: "PAID", amount: 5000 });
  });

  it("releases tickets when the hold expires, and still accepts a late payment if tickets are left", async () => {
    const { slug, vip, agent, base } = await concert(2);
    const { token } = (await buy(slug, [{ ticketTypeId: vip.id, quantity: 2 }]).expect(201)).body;
    await buy(slug, [{ ticketTypeId: vip.id, quantity: 1 }]).expect(409);
    await prisma.order.update({ where: { token }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await request(app).get(`/api/orders/${token}`)).body.order.status).toBe("EXPIRED");
    const page = (await request(app).get(`/api/public/events/${slug}`)).body;
    expect(page.ticketTypes[0].available).toBe(2);

    const id = (await prisma.order.findUniqueOrThrow({ where: { token } })).id;
    await agent.post(`${base}/orders/${id}/confirm`).expect(200);
    // Now sold out: a second late order can't be confirmed.
    const second = (await buy(slug, [{ ticketTypeId: vip.id, quantity: 1 }]).expect(409));
    expect(second.status).toBe(409);
  });
});

describe("the door", () => {
  async function paidTickets() {
    const c = await concert();
    const { token } = (await buy(c.slug, [{ ticketTypeId: c.vip.id, quantity: 2 }]).expect(201)).body;
    const order = (await c.agent.get(`${c.base}/orders`)).body.orders[0];
    await c.agent.post(`${c.base}/orders/${order.id}/confirm`).expect(200);
    const tickets = (await request(app).get(`/api/orders/${token}`)).body.order.tickets as { code: string }[];
    const helper = await joinDesk(c.event.helperCode, "Door");
    return { ...c, order, tickets, helper };
  }

  it("lets each ticket in once, and answers a replayed scan the same way", async () => {
    const { helper, base, tickets } = await paidTickets();
    const clientId = randomUUID();
    const first = await helper.agent.post(`${base}/door/scan`).send({ code: `MOMENTS-TICKET:${tickets[0].code}`, clientId }).expect(200);
    expect(first.body.ticket).toMatchObject({ type: "VIP", buyerName: "Bora", checkedInBy: "Door" });
    expect((await helper.agent.post(`${base}/door/scan`).send({ code: tickets[0].code, clientId }).expect(200)).body.duplicate).toBe(true);
    const again = await helper.agent.post(`${base}/door/scan`).set("Accept-Language", "km").send({ code: tickets[0].code, clientId: randomUUID() }).expect(409);
    expect(again.body.error).toBe("សំបុត្រនេះត្រូវបានប្រើរួចហើយ។");
    await helper.agent.post(`${base}/door/scan`).send({ code: "not-a-ticket", clientId: randomUUID() }).expect(404);

    let door = (await helper.agent.get(`${base}/door/tickets`).expect(200)).body;
    const second = door.tickets.find((t: { checkedInAt: string | null }) => !t.checkedInAt);
    await helper.agent.post(`${base}/door/admit`).send({ ticketId: second.id, clientId: randomUUID() }).expect(200);
    await helper.agent.post(`${base}/door/admit`).send({ ticketId: second.id, clientId: randomUUID() }).expect(409);
    await helper.agent.post(`/api/events/${(await hostWithEvent()).event.id}/door/admit`).send({ ticketId: second.id, clientId: randomUUID() }).expect(404);
    door = (await helper.agent.get(`${base}/door/tickets`).expect(200)).body;
    expect(door.stats).toEqual({ sold: 2, entered: 2 });
    expect(door.tickets.map((t: { hash: string }) => t.hash).sort()).toEqual(tickets.map((t) => ticketHash(t.code)).sort());
    expect(JSON.stringify(door)).not.toContain(tickets[1].code);
  });

  it("refuses tickets of a cancelled order and of another event", async () => {
    const { helper, agent, base, order, tickets } = await paidTickets();
    await agent.post(`${base}/orders/${order.id}/cancel`).send({ reason: "Refunded" }).expect(200);
    await helper.agent.post(`${base}/door/scan`).send({ code: tickets[0].code, clientId: randomUUID() }).expect(404);
    const other = await paidTickets();
    await helper.agent.post(`${base}/door/scan`).send({ code: other.tickets[0].code, clientId: randomUUID() }).expect(404);
  });

  it("keeps sales management for the organizer", async () => {
    const { helper, base } = await paidTickets();
    await helper.agent.get(`${base}/orders`).expect(403);
    await helper.agent.post(`${base}/ticket-types`).send({ name: "x", price: 1, currency: "USD", quantity: 1 }).expect(403);
    const stranger = await hostWithEvent();
    await stranger.agent.get(`${base}/orders`).expect(404);
  });

  it("won't delete a ticket type that was ordered", async () => {
    const { agent, base, vip, normal } = await paidTickets();
    await agent.delete(`${base}/ticket-types/${vip.id}`).expect(409);
    await agent.delete(`${base}/ticket-types/${normal.id}`).expect(204);
  });
});
