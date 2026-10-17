import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { prisma } from "../src/db.js";
import { tokenHash } from "../src/routes/checkins.js";
import { hostWithEvent, joinDesk } from "./helpers.js";

type DeskGuest = { id: string; name: string; tokenHash: string; checkin: null | { peopleCount: number; checkedInBy: string } };

async function eventWithGuests() {
  const host = await hostWithEvent();
  const base = `/api/events/${host.event.id}`;
  const a = await host.agent.post(`${base}/guests`).send({ name: "សុខ ដារ៉ា", invitedCount: 3 }).expect(201);
  const b = await host.agent.post(`${base}/guests`).send({ name: "ចាន់ សុភា", invitedCount: 2 }).expect(201);
  await host.agent.post(`/api/invitations/${b.body.guest.inviteToken}/rsvp`).send({ status: "ATTENDING" });
  const helper = await joinDesk(host.event.helperCode, "បងស្រី នារី");
  return { ...host, base, helper, guestA: a.body.guest, guestB: b.body.guest };
}

describe("desk guest list", () => {
  it("gives helpers every guest with a hash of the invitation token, never the token", async () => {
    const { helper, base, guestA } = await eventWithGuests();
    const res = await helper.agent.get(`${base}/desk/guests`).expect(200);
    expect(res.body.guests).toHaveLength(2);
    const a = res.body.guests.find((g: DeskGuest) => g.id === guestA.id);
    expect(a.tokenHash).toBe(tokenHash(guestA.inviteToken));
    expect(JSON.stringify(res.body)).not.toContain(guestA.inviteToken);
    expect(res.body.stats).toMatchObject({ checkedInGuests: 0, invitedGuests: 2, invitedPeople: 5 });
  });

  it("is closed to other events' helpers and to hosts of other events", async () => {
    const { base } = await eventWithGuests();
    const other = await hostWithEvent();
    const otherHelper = await joinDesk(other.event.helperCode);
    await otherHelper.agent.get(`${base}/desk/guests`).expect(404);
    await other.agent.get(`${base}/desk/guests`).expect(404);
  });
});

describe("check-in", () => {
  it("checks a guest in once, counts people, and reports who did it", async () => {
    const { helper, agent, base, guestA, event } = await eventWithGuests();
    const clientId = randomUUID();
    const res = await helper.agent.post(`${base}/checkins`).send({ guestId: guestA.id, peopleCount: 2, clientId }).expect(201);
    expect(res.body.guest.checkin).toMatchObject({ peopleCount: 2, checkedInBy: "បងស្រី នារី" });

    // Same request again (retry or offline replay): no second record.
    const again = await helper.agent.post(`${base}/checkins`).send({ guestId: guestA.id, peopleCount: 2, clientId }).expect(200);
    expect(again.body.duplicate).toBe(true);

    // Another phone checks the same guest: refused, with who did it.
    const other = await agent.post(`${base}/checkins`).set("Accept-Language", "km").send({ guestId: guestA.id, peopleCount: 1, clientId: randomUUID() }).expect(409);
    expect(other.body.error).toBe("បានចុះឈ្មោះចូលរួចហើយ។");
    expect(other.body.guest.checkin.checkedInBy).toBe("បងស្រី នារី");

    const stats = await agent.get(`${base}/desk/stats`).expect(200);
    expect(stats.body.stats).toMatchObject({ checkedInGuests: 1, checkedInPeople: 2, expectedPeople: 2 });
    expect(stats.body.stats.recent[0]).toMatchObject({ name: "សុខ ដារ៉ា", peopleCount: 2 });

    const list = await agent.get(`${base}/guests`).expect(200);
    expect(list.body.guests.find((g: { id: string }) => g.id === guestA.id).checkedIn).toBe(true);
    expect(await prisma.auditLog.count({ where: { eventId: event.id, entity: "checkin", action: "create" } })).toBe(1);
  });

  it("can be undone, and logs the undo", async () => {
    const { helper, base, guestA, event } = await eventWithGuests();
    await helper.agent.post(`${base}/checkins`).send({ guestId: guestA.id, peopleCount: 1 }).expect(201);
    const undone = await helper.agent.delete(`${base}/checkins/${guestA.id}`).expect(200);
    expect(undone.body.guest.checkin).toBeNull();
    expect(await prisma.auditLog.count({ where: { eventId: event.id, entity: "checkin", action: "delete" } })).toBe(1);
    await helper.agent.post(`${base}/checkins`).send({ guestId: guestA.id, peopleCount: 3 }).expect(201);
  });

  it("keeps device time for offline check-ins, within limits", async () => {
    const { helper, base, guestA, guestB } = await eventWithGuests();
    const earlier = new Date(Date.now() - 30 * 60_000).toISOString();
    const res = await helper.agent.post(`${base}/checkins`).send({ guestId: guestA.id, peopleCount: 1, checkedInAt: earlier }).expect(201);
    expect(new Date(res.body.guest.checkin.checkedInAt).toISOString()).toBe(earlier);
    await helper.agent.post(`${base}/checkins`).send({ guestId: guestB.id, peopleCount: 1, checkedInAt: "2001-01-01T00:00:00Z" }).expect(400);
  });

  it("validates and keeps to the event's own guests", async () => {
    const { helper, base } = await eventWithGuests();
    const other = await hostWithEvent();
    const { body } = await other.agent.post(`/api/events/${other.event.id}/guests`).send({ name: "Elsewhere" }).expect(201);
    await helper.agent.post(`${base}/checkins`).send({ guestId: body.guest.id, peopleCount: 1 }).expect(404);
    const bad = await helper.agent.post(`${base}/checkins`).send({ guestId: "x", peopleCount: 0 }).expect(400);
    expect(Object.keys(bad.body.fieldErrors)).toEqual(expect.arrayContaining(["guestId", "peopleCount"]));
  });
});

describe("walk-ins", () => {
  it("adds and checks in a guest who wasn't on the list, once per clientId", async () => {
    const { helper, agent, base, event } = await eventWithGuests();
    const clientId = randomUUID();
    const res = await helper.agent.post(`${base}/desk/walk-ins`).send({ name: "ម៉ៅ សំណាង", side: "GROOM", peopleCount: 2, clientId }).expect(201);
    expect(res.body.guest).toMatchObject({ name: "ម៉ៅ សំណាង", walkIn: true, checkin: { peopleCount: 2 } });
    await helper.agent.post(`${base}/desk/walk-ins`).send({ name: "ម៉ៅ សំណាង", side: "GROOM", peopleCount: 2, clientId }).expect(200);

    const stats = (await agent.get(`${base}/desk/stats`)).body.stats;
    expect(stats).toMatchObject({ walkIns: 1, checkedInPeople: 2, invitedGuests: 2 });
    expect(await prisma.auditLog.count({ where: { eventId: event.id, entity: "guest", action: "walk_in" } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { eventId: event.id, entity: "checkin", action: "create" } })).toBe(1);
  });
});
