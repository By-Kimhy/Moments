import { randomUUID } from "node:crypto";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { prisma } from "../src/db.js";
import { renderThankYou } from "../src/lib/thank-you.js";
import { app, hostWithEvent, randomPhone } from "./helpers.js";

type Row = { id: string; name: string; text: string; gift: string; shared: { status: string } | null };

/** A wedding that started yesterday: one guest came and gave, one came, one said no. */
async function afterWedding() {
  const host = await hostWithEvent(undefined, "PREMIUM");
  const base = `/api/events/${host.event.id}`;
  await host.agent.patch(base).send({ status: "PUBLISHED", groomNameKm: "ដារ៉ា", brideNameKm: "សុភា", groomNameEn: "Dara", brideNameEn: "Sophea" }).expect(200);
  const add = async (name: string, nameAlt: string, phone: string | null) =>
    (await host.agent.post(`${base}/guests`).send({ name, nameAlt, phone }).expect(201)).body.guest as { id: string; inviteToken: string; phone: string };
  const gaveGuest = await add("សុខ បូរ៉ា", "Sok Bora", randomPhone());
  const cameGuest = await add("ចាន់ នារី", "Chan Neary", randomPhone());
  const noPhone = await add("លី ស្រីនាង", "Ly Sreyneang", null);
  const declined = await add("ហេង វិចិត្រ", "Heng Vichet", randomPhone());
  await request(app).post(`/api/invitations/${declined.inviteToken}/rsvp`).send({ status: "DECLINED" }).expect(200);
  await host.agent.post(`${base}/checkins`).send({ guestId: gaveGuest.id, peopleCount: 2 }).expect(201);
  await host.agent.post(`${base}/checkins`).send({ guestId: cameGuest.id, peopleCount: 1 }).expect(201);
  await host.agent.post(`${base}/gifts`).send({ guestId: gaveGuest.id, amount: 5000, currency: "USD", clientId: randomUUID() }).expect(201);
  await host.agent.post(`${base}/gifts`).send({ guestId: gaveGuest.id, amount: 100000, currency: "KHR", clientId: randomUUID() }).expect(201);
  await prisma.event.update({ where: { id: host.event.id }, data: { startsAt: new Date(Date.now() - 24 * 3600_000) } });
  return { ...host, base, gaveGuest, cameGuest, noPhone, declined };
}

describe("thank-you text", () => {
  it("fills in the guest, their gift and the couple", () => {
    expect(renderThankYou("អរគុណ {name} សម្រាប់ {gift}។ — {couple}", { name: "បូរ៉ា", gift: "$50.00", couple: "ដារ៉ា និង សុភា", link: "" })).toBe(
      "អរគុណ បូរ៉ា សម្រាប់ $50.00។ — ដារ៉ា និង សុភា",
    );
  });
});

describe("thank-you messages", () => {
  it("lists who to thank by audience, with each guest's own text", async () => {
    const { agent, base, gaveGuest } = await afterWedding();
    const all = (await agent.get(`${base}/thank-you`).expect(200)).body;
    expect(all.counts).toEqual({ ALL: 3, ATTENDED: 2, GAVE: 1 }); // the guest who said no isn't thanked
    const row = all.guests.find((g: Row) => g.id === gaveGuest.id);
    expect(row.text).toContain("សុខ បូរ៉ា");
    expect(row.text).toContain("ដារ៉ា និង សុភា");
    expect(row.gift).toBe("$៥០.០០ + ១០០,០០០៛");

    await agent.put(`${base}/thank-you/settings`).send({ thankYouEn: "Thank you {name} for {gift}! {couple}" }).expect(204);
    const en = (await agent.get(`${base}/thank-you?audience=GAVE&language=EN`).expect(200)).body;
    expect(en.guests.map((g: Row) => g.text)).toEqual(["Thank you Sok Bora for $50.00 + 100,000៛! Dara & Sophea"]);
  });

  it("records thank-yous shared by hand", async () => {
    const { agent, base, noPhone } = await afterWedding();
    await agent.post(`${base}/thank-you/${noPhone.id}/shared`).send({ language: "KM" }).expect(204);
    const list = (await agent.get(`${base}/thank-you`).expect(200)).body;
    expect(list.guests.find((g: Row) => g.id === noPhone.id).shared.status).toBe("SENT");
    expect(list.sent.SHARE).toBe(1);
  });

  it("has no SMS sending", async () => {
    const host = await hostWithEvent(undefined, "PREMIUM");
    await host.agent.post(`/api/events/${host.event.id}/thank-you/send`).send({}).expect(404);
  });

  it("turns the invitation into a thank-you card after the wedding", async () => {
    const { gaveGuest, event } = await afterWedding();
    const page = (await request(app).get(`/api/invitations/${gaveGuest.inviteToken}`).expect(200)).body;
    expect(page.thankYou.km).toContain("សុខ បូរ៉ា");
    expect(page.thankYou.en).toContain("Sok Bora");

    await prisma.event.update({ where: { id: event.id }, data: { startsAt: new Date(Date.now() + 24 * 3600_000) } });
    expect((await request(app).get(`/api/invitations/${gaveGuest.inviteToken}`)).body.thankYou).toBeNull();
  });
});
