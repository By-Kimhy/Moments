import { randomUUID } from "node:crypto";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { prisma } from "../src/db.js";
import { app, hostWithEvent, randomPhone, sampleEvent, signIn } from "./helpers.js";

async function planner() {
  const owner = await signIn("Planner Owner");
  const org = (await owner.agent.post("/api/organizations").send({ name: "Golden Day Weddings", brandColor: "#b8860b" }).expect(201)).body.organization as { id: string };
  return { owner, org, base: `/api/organizations/${org.id}` };
}

describe("planner organizations", () => {
  it("creates an organization and adds staff by phone", async () => {
    const { owner, base } = await planner();
    const staffPhone = randomPhone();
    await owner.agent.post(`${base}/members`).send({ phone: staffPhone, name: "Staff One" }).expect(201);
    await owner.agent.post(`${base}/members`).send({ phone: staffPhone, name: "again" }).expect(409);
    const detail = (await owner.agent.get(base).expect(200)).body;
    expect(detail.members.map((m: { name: string; role: string }) => [m.name, m.role])).toEqual([
      ["Planner Owner", "OWNER"],
      ["Staff One", "STAFF"],
    ]);
    const staff = await signIn(undefined, staffPhone);
    const mine = (await staff.agent.get("/api/organizations").expect(200)).body.organizations;
    expect(mine).toEqual([expect.objectContaining({ name: "Golden Day Weddings", role: "STAFF" })]);
    // Staff can't manage the organization.
    await staff.agent.patch(base).send({ name: "x" }).expect(403);
    await staff.agent.post(`${base}/members`).send({ phone: randomPhone(), name: "x" }).expect(403);
  });

  it("creates client events that all staff can run, and the client co-hosts", async () => {
    const { owner, base } = await planner();
    const staffPhone = randomPhone();
    await owner.agent.post(`${base}/members`).send({ phone: staffPhone, name: "Staff" }).expect(201);
    const clientPhone = randomPhone();
    const event = (await owner.agent.post(`${base}/events`).send({ ...sampleEvent, clientName: "Sophea", clientPhone }).expect(201)).body.event as { id: string };

    // Staff reach it without being added to it; their actions carry their name.
    const staff = await signIn("Staff", staffPhone);
    await staff.agent.patch(`/api/events/${event.id}`).send({ venueKm: "ភ្នំពេញ" }).expect(200);
    const log = await prisma.auditLog.findFirst({ where: { eventId: event.id, action: "update" }, include: { actor: true } });
    expect(log?.actor?.displayName).toBe("Staff");
    expect((await staff.agent.get("/api/events")).body.events.map((e: { id: string }) => e.id)).toContain(event.id);

    // The client signs in with their number and sees their wedding.
    const client = await signIn(undefined, clientPhone);
    await client.agent.get(`/api/events/${event.id}`).expect(200);

    // Others can't.
    const stranger = await signIn();
    await stranger.agent.get(`/api/events/${event.id}`).expect(404);
    await stranger.agent.get(`${base}/events`).expect(404);
  });

  it("ends staff access to every event when they leave the organization", async () => {
    const { owner, base } = await planner();
    const staffPhone = randomPhone();
    const added = (await owner.agent.post(`${base}/members`).send({ phone: staffPhone, name: "Leaving" }).expect(201)).body.member;
    const event = (await owner.agent.post(`${base}/events`).send(sampleEvent).expect(201)).body.event;
    const staff = await signIn(undefined, staffPhone);
    await staff.agent.get(`/api/events/${event.id}`).expect(200);
    // A host can't remove planner staff from one event; it's done in the organization.
    const members = (await owner.agent.get(`/api/events/${event.id}/members`)).body.members;
    const staffMember = members.find((m: { displayName: string }) => m.displayName === "Leaving");
    expect(staffMember.viaOrganization).toBe(true);
    await owner.agent.delete(`/api/events/${event.id}/members/${staffMember.id}`).expect(409);

    await owner.agent.delete(`${base}/members/${added.id}`).expect(204);
    await staff.agent.get(`/api/events/${event.id}`).expect(404);
    expect((await staff.agent.get("/api/events")).body.events).toEqual([]);
  });

  it("keeps at least one owner", async () => {
    const { owner, base } = await planner();
    const me = (await owner.agent.get(base)).body.members[0];
    await owner.agent.delete(`${base}/members/${me.id}`).expect(409);
  });

  it("shows every event's numbers on the dashboard, upcoming first", async () => {
    const { owner, base } = await planner();
    const soon = (await owner.agent.post(`${base}/events`).send({ ...sampleEvent, titleKm: "Soon", startsAt: new Date(Date.now() + 7 * 86_400_000).toISOString() }).expect(201)).body.event;
    await owner.agent.post(`${base}/events`).send({ ...sampleEvent, titleKm: "Past", startsAt: new Date(Date.now() - 30 * 86_400_000).toISOString() }).expect(201);
    const ev = `/api/events/${soon.id}`;
    const g1 = (await owner.agent.post(`${ev}/guests`).send({ name: "A", invitedCount: 2 }).expect(201)).body.guest;
    await owner.agent.post(`${ev}/guests`).send({ name: "B" }).expect(201);
    await owner.agent.patch(ev).send({ status: "PUBLISHED" }).expect(200);
    await request(app).post(`/api/invitations/${g1.inviteToken}/rsvp`).send({ status: "ATTENDING" }).expect(200);
    await owner.agent.post(`${ev}/checkins`).send({ guestId: g1.id, peopleCount: 2 }).expect(201);
    await owner.agent.post(`${ev}/gifts`).send({ guestId: g1.id, amount: 5000, currency: "USD", clientId: randomUUID() }).expect(201);

    const dash = (await owner.agent.get(`${base}/events`).expect(200)).body;
    expect(dash.upcoming.map((e: { titleKm: string }) => e.titleKm)).toEqual(["Soon"]);
    expect(dash.past.map((e: { titleKm: string }) => e.titleKm)).toEqual(["Past"]);
    expect(dash.upcoming[0]).toMatchObject({ guests: 2, replyRate: 50, attendingPeople: 2, arrivedPeople: 2, giftTotal: { USD: 5000, KHR: 0 } });
  });

  it("moves a host's own event into the organization and brands the invitation", async () => {
    const { owner, base, org } = await planner();
    const host = await hostWithEvent();
    // Not their event: refused.
    await owner.agent.post(`${base}/events/${host.event.id}/attach`).expect(404);

    const own = (await owner.agent.post("/api/events").send(sampleEvent).expect(201)).body.event;
    await owner.agent.post(`${base}/events/${own.id}/attach`).expect(204);
    await owner.agent.patch(`/api/events/${own.id}`).send({ status: "PUBLISHED" }).expect(200);
    const guest = (await owner.agent.post(`/api/events/${own.id}/guests`).send({ name: "G" }).expect(201)).body.guest;
    const page = (await request(app).get(`/api/invitations/${guest.inviteToken}`).expect(200)).body;
    expect(page.event.planner).toEqual({ name: "Golden Day Weddings", brandColor: "#b8860b", logoKey: null });
    expect(org.id).toBeTruthy();
  });
});
