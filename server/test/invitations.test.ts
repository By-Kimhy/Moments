import request from "supertest";
import { describe, expect, it } from "vitest";
import { prisma } from "../src/db.js";
import { app, hostWithEvent, randomIp } from "./helpers.js";

/** A published event with one guest invited for `invitedCount` people. */
async function invited(invitedCount = 3) {
  const host = await hostWithEvent();
  await host.agent.patch(`/api/events/${host.event.id}`).send({ status: "PUBLISHED" }).expect(200);
  const { body } = await host.agent.post(`/api/events/${host.event.id}/guests`).send({ name: "សុខ ដារ៉ា", invitedCount }).expect(201);
  return { ...host, guest: body.guest as { id: string; inviteToken: string } };
}

describe("public invitation", () => {
  it("shows the event and guest without login, and hides host-only fields", async () => {
    const { guest, event } = await invited();
    const res = await request(app).get(`/api/invitations/${guest.inviteToken}`).expect(200);
    expect(res.body.event).toMatchObject({ id: event.id, titleKm: "ពិធីមង្គលការ", rsvpOpen: true });
    expect(res.body.event.template.style).toBe("TRADITIONAL"); // default when none chosen
    expect(res.body.event.helperCode).toBeUndefined();
    expect(res.body.guest).toEqual(expect.objectContaining({ name: "សុខ ដារ៉ា", invitedCount: 3, rsvpStatus: "PENDING" }));
    expect(res.body.guest.phone).toBeUndefined();
    expect(res.body.inviteUrl).toBe(`http://localhost:3000/i/${guest.inviteToken}`);
  });

  it("hides drafts from guests but not from the hosts", async () => {
    const host = await hostWithEvent();
    const { body } = await host.agent.post(`/api/events/${host.event.id}/guests`).send({ name: "Guest" }).expect(201);
    await request(app).get(`/api/invitations/${body.guest.inviteToken}`).expect(404);
    await host.agent.get(`/api/invitations/${body.guest.inviteToken}`).expect(200);
    const preview = await host.agent.get(`/api/events/${host.event.id}/preview`).expect(200);
    expect(preview.body.event.id).toBe(host.event.id);
  });

  it("returns 404 for unknown or malformed links", async () => {
    await request(app).get("/api/invitations/AAAAAAAAAAAAAAAAAAAAAA").expect(404);
    await request(app).get("/api/invitations/..%2Fx").expect(404);
  });

  it("records the first open, but not a host's preview", async () => {
    const { guest, agent } = await invited();
    await agent.post(`/api/invitations/${guest.inviteToken}/open`).expect(204);
    expect((await prisma.guest.findUniqueOrThrow({ where: { id: guest.id } })).openedAt).toBeNull();

    await request(app).post(`/api/invitations/${guest.inviteToken}/open`).expect(204);
    const first = (await prisma.guest.findUniqueOrThrow({ where: { id: guest.id } })).openedAt;
    expect(first).toBeInstanceOf(Date);
    await request(app).post(`/api/invitations/${guest.inviteToken}/open`).expect(204);
    expect((await prisma.guest.findUniqueOrThrow({ where: { id: guest.id } })).openedAt).toEqual(first);
  });

  it("serves the guest's check-in QR code", async () => {
    const { guest } = await invited();
    const res = await request(app).get(`/api/invitations/${guest.inviteToken}/qr.svg`).buffer(true).expect(200);
    expect(res.headers["content-type"]).toContain("image/svg+xml");
    expect(String(res.body)).toContain("<svg");
  });
});

describe("RSVP", () => {
  it("accepts a reply, lets the guest change it, and shows it to the host", async () => {
    const { guest, agent, event } = await invited(3);
    const url = `/api/invitations/${guest.inviteToken}/rsvp`;
    const yes = await request(app).post(url).send({ status: "ATTENDING", count: 2, message: "សូមអបអរសាទរ!" }).expect(200);
    expect(yes.body.guest).toMatchObject({ rsvpStatus: "ATTENDING", rsvpCount: 2, rsvpMessage: "សូមអបអរសាទរ!" });

    const list = await agent.get(`/api/events/${event.id}/guests`).expect(200);
    expect(list.body.summary).toMatchObject({ attending: 1, attendingPeople: 2, opened: 1 });

    const no = await request(app).post(url).send({ status: "DECLINED" }).expect(200);
    expect(no.body.guest).toMatchObject({ rsvpStatus: "DECLINED", rsvpCount: 0, rsvpMessage: null });

    const logs = await prisma.auditLog.findMany({ where: { entityId: guest.id, action: "rsvp" }, orderBy: { createdAt: "asc" } });
    expect(logs.map((l) => (l.after as { rsvpStatus: string }).rsvpStatus)).toEqual(["ATTENDING", "DECLINED"]);
    expect(logs[0].actorId).toBeNull();
  });

  it("defaults to the full party, and refuses more people than invited", async () => {
    const { guest } = await invited(2);
    const url = `/api/invitations/${guest.inviteToken}/rsvp`;
    expect((await request(app).post(url).send({ status: "ATTENDING" }).expect(200)).body.guest.rsvpCount).toBe(2);
    const tooMany = await request(app).post(url).set("Accept-Language", "km").send({ status: "ATTENDING", count: 3 }).expect(400);
    expect(tooMany.body.fieldErrors.count).toEqual(["លិខិតអញ្ជើញនេះសម្រាប់មនុស្សយ៉ាងច្រើន ២ នាក់។"]);
    await request(app).post(url).send({ status: "MAYBE" }).expect(400);
  });

  it("closes once the event has started or is archived", async () => {
    const { guest, agent, event } = await invited();
    const url = `/api/invitations/${guest.inviteToken}/rsvp`;
    await agent.patch(`/api/events/${event.id}`).send({ startsAt: "2020-01-01T00:00:00Z" }).expect(200);
    await request(app).post(url).send({ status: "ATTENDING" }).expect(409);
    const view = await request(app).get(`/api/invitations/${guest.inviteToken}`).expect(200);
    expect(view.body.event.rsvpOpen).toBe(false);

    await agent.patch(`/api/events/${event.id}`).send({ startsAt: "2030-01-01T00:00:00Z", status: "ARCHIVED" }).expect(200);
    await request(app).post(url).send({ status: "ATTENDING" }).expect(409);
  });

  it("limits how often one link can reply", async () => {
    const { guest } = await invited();
    const url = `/api/invitations/${guest.inviteToken}/rsvp`;
    for (let i = 0; i < 20; i++) await request(app).post(url).set("X-Forwarded-For", randomIp()).send({ status: "DECLINED" }).expect(200);
    await request(app).post(url).send({ status: "DECLINED" }).expect(429);
  });
});
