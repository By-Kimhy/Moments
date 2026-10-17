import { randomUUID } from "node:crypto";
import sharp from "sharp";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { prisma } from "../src/db.js";
import { app, hostWithEvent, joinDesk } from "./helpers.js";

type Gift = { id: string; amount: number; currency: string; status: string; recordedBy: string | null; voidedAt: string | null; guestName: string };

async function giftDesk() {
  const host = await hostWithEvent();
  const base = `/api/events/${host.event.id}`;
  await host.agent.patch(base).send({ status: "PUBLISHED" }).expect(200);
  const { body } = await host.agent.post(`${base}/guests`).send({ name: "សុខ ដារ៉ា", side: "GROOM", group: "គ្រួសារ" }).expect(201);
  const helper = await joinDesk(host.event.helperCode, "បងស្រី នារី");
  return { ...host, base, helper, guest: body.guest as { id: string; inviteToken: string } };
}

const cash = (guestId: string, amount: number, currency = "USD") => ({ guestId, amount, currency, method: "CASH", clientId: randomUUID() });

describe("recording gifts", () => {
  it("records a desk gift once per clientId and shows it on the desk and in the totals", async () => {
    const { helper, agent, base, guest } = await giftDesk();
    const body = cash(guest.id, 5000);
    const res = await helper.agent.post(`${base}/gifts`).send(body).expect(201);
    expect(res.body.gift).toMatchObject({ amount: 5000, currency: "USD", status: "CONFIRMED", source: "DESK", recordedBy: "បងស្រី នារី", guestName: "សុខ ដារ៉ា", side: "GROOM" });
    expect((await helper.agent.post(`${base}/gifts`).send(body).expect(200)).body.duplicate).toBe(true);
    await helper.agent.post(`${base}/gifts`).send(cash(guest.id, 200000, "KHR")).expect(201);

    const desk = await helper.agent.get(`${base}/desk/guests`).expect(200);
    expect(desk.body.guests[0].gifts).toHaveLength(2);

    const all = await agent.get(`${base}/gifts`).expect(200);
    expect(all.body.gifts).toHaveLength(2);
    expect(all.body.totals.total).toEqual({ USD: 5000, KHR: 200000 });
    expect(all.body.totals.bySide.GROOM).toEqual({ USD: 5000, KHR: 200000 });
  });

  it("accepts a giver who isn't on the list, and validates amounts", async () => {
    const { helper, base } = await giftDesk();
    const res = await helper.agent.post(`${base}/gifts`).send({ giverName: "ភ្ញៀវខាងក្រៅ", amount: 2000, currency: "USD", clientId: randomUUID() }).expect(201);
    expect(res.body.gift).toMatchObject({ guestId: null, guestName: "ភ្ញៀវខាងក្រៅ" });

    const bad = await helper.agent.post(`${base}/gifts`).send({ amount: 10.5, currency: "EUR", clientId: randomUUID() }).expect(400);
    expect(Object.keys(bad.body.fieldErrors)).toEqual(expect.arrayContaining(["amount", "currency"]));
    await helper.agent.post(`${base}/gifts`).send({ giverName: "x", amount: 10_000_001, currency: "USD", clientId: randomUUID() }).expect(400);
    await helper.agent.post(`${base}/gifts`).send({ amount: 100, currency: "USD", clientId: randomUUID() }).expect(400);
  });

  it("links a gift to a walk-in added offline, by the walk-in's clientId", async () => {
    const { helper, base } = await giftDesk();
    const guestClientId = randomUUID();
    await helper.agent.post(`${base}/desk/walk-ins`).send({ name: "Walk-in", peopleCount: 1, clientId: guestClientId }).expect(201);
    const res = await helper.agent.post(`${base}/gifts`).send({ guestClientId, amount: 3000, currency: "USD", clientId: randomUUID() }).expect(201);
    expect(res.body.gift.guestName).toBe("Walk-in");
    await helper.agent.post(`${base}/gifts`).send({ guestClientId: randomUUID(), amount: 3000, currency: "USD", clientId: randomUUID() }).expect(404);
  });

  it("keeps gifts to the event's own guests", async () => {
    const { helper, base } = await giftDesk();
    const other = await giftDesk();
    await helper.agent.post(`${base}/gifts`).send(cash(other.guest.id, 1000)).expect(404);
    await other.helper.agent.get(`${base}/gifts`).expect(404);
  });
});

describe("helpers and their gifts", () => {
  it("see only their own entries, with their cash-box total", async () => {
    const { helper, agent, base, event, guest } = await giftDesk();
    const second = await joinDesk(event.helperCode, "Second helper");
    await helper.agent.post(`${base}/gifts`).send(cash(guest.id, 5000)).expect(201);
    await second.agent.post(`${base}/gifts`).send(cash(guest.id, 7000)).expect(201);
    await agent.post(`${base}/gifts`).send(cash(guest.id, 1000)).expect(201);

    const mine = await helper.agent.get(`${base}/gifts`).expect(200);
    expect(mine.body.gifts.map((g: Gift) => g.amount)).toEqual([5000]);
    expect(mine.body.totals.total.USD).toBe(5000);
    expect((await agent.get(`${base}/gifts`)).body.totals.total.USD).toBe(13000);
  });

  it("can correct or cancel their own gifts but not other people's", async () => {
    const { helper, agent, base, event, guest } = await giftDesk();
    const second = await joinDesk(event.helperCode, "Second helper");
    const mine = (await helper.agent.post(`${base}/gifts`).send(cash(guest.id, 5000)).expect(201)).body.gift as Gift;
    const theirs = (await second.agent.post(`${base}/gifts`).send(cash(guest.id, 7000)).expect(201)).body.gift as Gift;

    await helper.agent.patch(`${base}/gifts/${mine.id}`).send({ amount: 6000 }).expect(200);
    await helper.agent.patch(`${base}/gifts/${theirs.id}`).send({ amount: 1 }).expect(403);
    await helper.agent.post(`${base}/gifts/${theirs.id}/void`).send({ reason: "x" }).expect(403);
    // Owners can change any gift.
    await agent.patch(`${base}/gifts/${theirs.id}`).send({ amount: 7500 }).expect(200);
  });
});

describe("corrections are never silent", () => {
  it("logs every edit and void with before and after, and keeps voided gifts out of totals", async () => {
    const { helper, agent, base, guest } = await giftDesk();
    const gift = (await helper.agent.post(`${base}/gifts`).send(cash(guest.id, 5000)).expect(201)).body.gift as Gift;
    await helper.agent.patch(`${base}/gifts/${gift.id}`).send({ amount: 50000, currency: "KHR" }).expect(200);
    await helper.agent.post(`${base}/gifts/${gift.id}/void`).send({ reason: "" }).expect(400);
    const voided = await helper.agent.post(`${base}/gifts/${gift.id}/void`).send({ reason: "Entered twice" }).expect(200);
    expect(voided.body.gift).toMatchObject({ voidReason: "Entered twice", voidedBy: "បងស្រី នារី" });
    await helper.agent.patch(`${base}/gifts/${gift.id}`).send({ amount: 1 }).expect(409);

    const list = await agent.get(`${base}/gifts`).expect(200);
    expect(list.body.totals.total).toEqual({ USD: 0, KHR: 0 });
    expect((await agent.get(`${base}/gifts?status=VOIDED`)).body.gifts).toHaveLength(1);

    const history = await agent.get(`${base}/gifts/${gift.id}/history`).expect(200);
    expect(history.body.history.map((h: { action: string }) => h.action)).toEqual(["create", "update", "void"]);
    expect(history.body.history[1]).toMatchObject({ by: "បងស្រី នារី", before: { amount: 5000, currency: "USD" }, after: { amount: 50000, currency: "KHR" } });
    await helper.agent.get(`${base}/gifts/${gift.id}/history`).expect(403);
  });

  it("has no delete route", async () => {
    const { agent, base, guest } = await giftDesk();
    const gift = (await agent.post(`${base}/gifts`).send(cash(guest.id, 5000)).expect(201)).body.gift as Gift;
    await agent.delete(`${base}/gifts/${gift.id}`).expect(404);
    expect(await prisma.gift.count({ where: { id: gift.id } })).toBe(1);
  });
});

describe("KHQR gifts from guests", () => {
  async function withKhqr() {
    const desk = await giftDesk();
    const qr = await sharp({ create: { width: 200, height: 200, channels: 3, background: "#000" } }).png().toBuffer();
    await desk.agent.put(`${desk.base}/khqr`).attach("image", qr, "qr.png").expect(200);
    return desk;
  }

  it("wait for a host to confirm, then count; rejected ones never count", async () => {
    const { agent, base, guest } = await withKhqr();
    const url = `/api/invitations/${guest.inviteToken}/gift`;
    const sent = await request(app).post(url).send({ amount: 10000, currency: "USD", note: "សូមជូនពរ" }).expect(201);
    expect(sent.body.gifts).toEqual([expect.objectContaining({ amount: 10000, status: "PENDING" })]);
    await request(app).post(url).send({ amount: 400000, currency: "KHR" }).expect(201);

    let list = await agent.get(`${base}/gifts?status=PENDING`).expect(200);
    expect(list.body.gifts).toHaveLength(2);
    expect(list.body.totals).toMatchObject({ total: { USD: 0, KHR: 0 }, pending: { USD: 10000, KHR: 400000 }, pendingCount: 2 });

    const [khr, usd] = list.body.gifts as Gift[];
    const confirmed = await agent.post(`${base}/gifts/${usd.id}/confirm`).expect(200);
    expect(confirmed.body.gift).toMatchObject({ status: "CONFIRMED", method: "KHQR", source: "GUEST" });
    await agent.post(`${base}/gifts/${usd.id}/confirm`).expect(409);
    await agent.post(`${base}/gifts/${khr.id}/reject`).expect(200);

    list = await agent.get(`${base}/gifts`).expect(200);
    expect(list.body.totals).toMatchObject({ total: { USD: 10000, KHR: 0 }, pendingCount: 0 });
    const payment = await prisma.payment.findFirst({ where: { reference: usd.id } });
    expect(payment).toMatchObject({ provider: "manual", status: "PAID", amount: 10000 });

    const invite = await request(app).get(`/api/invitations/${guest.inviteToken}`).expect(200);
    expect(invite.body.gifts.map((g: Gift) => g.status)).toEqual(["CONFIRMED", "REJECTED"]);
  });

  it("only hosts confirm, and guests can't send without a KHQR or too often", async () => {
    const { helper, base, guest } = await withKhqr();
    await request(app).post(`/api/invitations/${guest.inviteToken}/gift`).send({ amount: 0, currency: "USD" }).expect(400);
    const sent = await request(app).post(`/api/invitations/${guest.inviteToken}/gift`).send({ amount: 500, currency: "USD" }).expect(201);
    const pending = await prisma.gift.findFirstOrThrow({ where: { id: sent.body.gifts[0].id } });
    await helper.agent.post(`${base}/gifts/${pending.id}/confirm`).expect(403);
    for (let i = 0; i < 4; i++) await request(app).post(`/api/invitations/${guest.inviteToken}/gift`).send({ amount: 500, currency: "USD" }).expect(201);
    await request(app).post(`/api/invitations/${guest.inviteToken}/gift`).send({ amount: 500, currency: "USD" }).expect(429);

    const noQr = await giftDesk();
    await request(app).post(`/api/invitations/${noQr.guest.inviteToken}/gift`).send({ amount: 500, currency: "USD" }).expect(409);
  });
});
