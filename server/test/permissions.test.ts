import request from "supertest";
import { describe, expect, it } from "vitest";
import { prisma } from "../src/db.js";
import { app, hostWithEvent, joinDesk, randomIp, randomPhone, signIn } from "./helpers.js";

describe("event access", () => {
  it("lets the host create, read and update their event, with an audit trail", async () => {
    const { agent, event } = await hostWithEvent();
    expect(event.helperCode).toMatch(/^\d{6}$/);

    const list = await agent.get("/api/events").expect(200);
    expect(list.body.events.map((e: { id: string }) => e.id)).toContain(event.id);

    const updated = await agent.patch(`/api/events/${event.id}`).send({ venueKm: "ភ្នំពេញ", status: "PUBLISHED" }).expect(200);
    expect(updated.body.event).toMatchObject({ venueKm: "ភ្នំពេញ", status: "PUBLISHED" });

    const logs = await prisma.auditLog.findMany({ where: { eventId: event.id }, orderBy: { createdAt: "asc" } });
    expect(logs.map((l) => l.action)).toEqual(["create", "update"]);
  });

  it("validates event fields", async () => {
    const { agent } = await signIn();
    const res = await agent
      .post("/api/events")
      .send({ titleKm: "", startsAt: "not a date", mapUrl: "javascript:alert(1)", schedule: [{ time: "25:00", titleKm: "x" }] });
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.fieldErrors)).toEqual(expect.arrayContaining(["titleKm", "startsAt", "mapUrl", "schedule"]));
  });

  it("hides one host's event from another host and from signed-out visitors", async () => {
    const { event } = await hostWithEvent();
    const other = await signIn();
    await other.agent.get(`/api/events/${event.id}`).expect(404);
    await other.agent.patch(`/api/events/${event.id}`).send({ titleKm: "hacked" }).expect(404);
    await other.agent.get(`/api/events/${event.id}/members`).expect(404);
    await request(app).get(`/api/events/${event.id}`).expect(401);
    await other.agent.get("/api/events/not-a-uuid").expect(404);

    const list = await other.agent.get("/api/events").expect(200);
    expect(list.body.events).toEqual([]);
  });

  it("adds a co-host by phone, who then has full host access, and can remove them", async () => {
    const { agent, event } = await hostWithEvent();
    const phone = randomPhone();
    const added = await agent.post(`/api/events/${event.id}/cohosts`).send({ phone, name: "ចាន់ សុភា" }).expect(201);
    await agent.post(`/api/events/${event.id}/cohosts`).send({ phone, name: "again" }).expect(409);

    // The co-host signs in later with the same number and already sees the event.
    const cohost = await signIn(undefined, phone);
    await cohost.agent.get(`/api/events/${event.id}`).expect(200);
    await cohost.agent.patch(`/api/events/${event.id}`).send({ venueEn: "Phnom Penh" }).expect(200);
    const list = await cohost.agent.get("/api/events").expect(200);
    expect(list.body.events).toHaveLength(1);

    await agent.delete(`/api/events/${event.id}/members/${added.body.member.id}`).expect(204);
    await cohost.agent.get(`/api/events/${event.id}`).expect(404);
  });

  it("never removes the person who created the event", async () => {
    const { agent, event, phone } = await hostWithEvent();
    const cohostPhone = randomPhone();
    await agent.post(`/api/events/${event.id}/cohosts`).send({ phone: cohostPhone, name: "Co-host" }).expect(201);
    const cohost = await signIn(undefined, cohostPhone);
    const members = await cohost.agent.get(`/api/events/${event.id}/members`).expect(200);
    const creator = members.body.members.find((m: { phone: string }) => m.phone === phone);
    expect(creator.isCreator).toBe(true);
    await cohost.agent.delete(`/api/events/${event.id}/members/${creator.id}`).expect(409);
  });
});

describe("helpers", () => {
  it("join with the helper code and see only the desk view of that one event", async () => {
    const { event } = await hostWithEvent();
    const helper = await joinDesk(event.helperCode, "បងស្រី");

    const me = await helper.agent.get("/api/desk/me").expect(200);
    expect(me.body).toMatchObject({ helper: { displayName: "បងស្រី" }, event: { id: event.id } });

    const view = await helper.agent.get(`/api/events/${event.id}`).expect(200);
    expect(view.body.role).toBe("HELPER");
    expect(view.body.event.helperCode).toBeUndefined();

    // Host-only actions are refused.
    await helper.agent.patch(`/api/events/${event.id}`).send({ titleKm: "x" }).expect(403);
    await helper.agent.get(`/api/events/${event.id}/members`).expect(403);
    await helper.agent.post(`/api/events/${event.id}/helper-code`).expect(403);
    await helper.agent.post(`/api/events/${event.id}/cohosts`).send({ phone: randomPhone(), name: "x" }).expect(403);
    await helper.agent.get("/api/events").expect(401);

    // The desk token works as a header too, and only for its own event.
    await request(app).get(`/api/events/${event.id}`).set("X-Desk-Token", helper.token).expect(200);
    const other = await hostWithEvent();
    await helper.agent.get(`/api/events/${other.event.id}`).expect(404);
  });

  it("lose access when the host removes them, and can't join with an old code", async () => {
    const { agent, event } = await hostWithEvent();
    const helper = await joinDesk(event.helperCode);
    await agent.delete(`/api/events/${event.id}/members/${helper.memberId}`).expect(204);
    await helper.agent.get(`/api/events/${event.id}`).expect(401);
    await helper.agent.get("/api/desk/me").expect(401);

    const rotated = await agent.post(`/api/events/${event.id}/helper-code`).expect(200);
    expect(rotated.body.helperCode).not.toBe(event.helperCode);
    const old = await request(app).post("/api/desk/join").set("X-Forwarded-For", randomIp()).send({ code: event.helperCode, name: "x" });
    // The old code may by chance belong to another event now; it must not reach this one.
    if (old.status === 201) expect(old.body.event.id).not.toBe(event.id);
    else expect(old.status).toBe(400);
    await joinDesk(rotated.body.helperCode);
  });

  it("can't guess codes quickly", async () => {
    const ip = randomIp();
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      const res = await request(app).post("/api/desk/join").set("X-Forwarded-For", ip).send({ code: "000000", name: "x" });
      statuses.push(res.status);
    }
    expect(statuses.at(-1)).toBe(429);
  });

  it("are refused for archived events", async () => {
    const { agent, event } = await hostWithEvent();
    await agent.patch(`/api/events/${event.id}`).send({ status: "ARCHIVED" }).expect(200);
    const res = await request(app).post("/api/desk/join").set("X-Forwarded-For", randomIp()).send({ code: event.helperCode, name: "x" });
    expect(res.status).toBe(400);
  });
});


describe("templates", () => {
  it("lists active templates to anyone, and events only accept those", async () => {
    const res = await request(app).get("/api/templates").expect(200);
    const slugs = res.body.templates.map((t: { slug: string }) => t.slug);
    expect(slugs).toEqual(expect.arrayContaining(["minimal", "modern", "traditional"]));

    const { agent, event } = await hostWithEvent();
    const traditional = res.body.templates.find((t: { slug: string }) => t.slug === "traditional");
    await agent.patch(`/api/events/${event.id}`).send({ templateId: traditional.id }).expect(200);
    await agent.patch(`/api/events/${event.id}`).send({ templateId: "00000000-0000-4000-8000-000000000000" }).expect(400);
  });
});
