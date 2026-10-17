import request from "supertest";
import { describe, expect, it } from "vitest";
import { prisma } from "../src/db.js";
import { chromiumPath } from "../src/reports/pdf.js";
import { app, hostWithEvent, joinDesk } from "./helpers.js";

type Plan = {
  tables: { id: string; name: string; capacity: number; seatsUsed: number; over: boolean; guests: { id: string; name: string; seats: number }[] }[];
  unassigned: { id: string; seats: number }[];
  summary: { tables: number; capacity: number; seatedPeople: number; unseatedPeople: number; overTables: number };
};

async function wedding() {
  const host = await hostWithEvent(undefined, "PREMIUM");
  const base = `/api/events/${host.event.id}`;
  await host.agent.patch(base).send({ status: "PUBLISHED" }).expect(200);
  const add = async (name: string, side: string, group: string, invitedCount: number) =>
    (await host.agent.post(`${base}/guests`).send({ name, side, group, invitedCount }).expect(201)).body.guest as { id: string; inviteToken: string };
  const guests = {
    familyA: await add("Groom family A", "GROOM", "Family", 6),
    familyB: await add("Groom family B", "GROOM", "Family", 3),
    friend: await add("Bride friend", "BRIDE", "Friends", 2),
    declined: await add("Declined", "BRIDE", "Friends", 4),
  };
  await request(app).post(`/api/invitations/${guests.declined.inviteToken}/rsvp`).send({ status: "DECLINED" }).expect(200);
  return { ...host, base, guests };
}

describe("tables", () => {
  it("adds numbered tables in bulk, renames, resizes and deletes them", async () => {
    const { agent, base } = await wedding();
    let plan = (await agent.post(`${base}/tables/bulk`).send({ count: 3, capacity: 10 }).expect(201)).body as Plan;
    expect(plan.tables.map((t) => t.name)).toEqual(["1", "2", "3"]);
    await agent.post(`${base}/tables`).send({ name: "VIP", capacity: 8 }).expect(201);
    await agent.post(`${base}/tables`).send({ name: "VIP" }).expect(409);
    plan = (await agent.post(`${base}/tables/bulk`).send({ count: 2 }).expect(201)).body;
    expect(plan.tables.map((t) => t.name)).toEqual(["1", "2", "3", "VIP", "4", "5"]);
    expect(plan.summary).toMatchObject({ tables: 6, capacity: 58 });

    const vip = plan.tables.find((t) => t.name === "VIP")!;
    const renamed = await agent.patch(`${base}/tables/${vip.id}`).send({ name: "តុកិត្តិយស", capacity: 12 }).expect(200);
    expect(renamed.body.table).toMatchObject({ name: "តុកិត្តិយស", capacity: 12 });
    await agent.delete(`${base}/tables/${vip.id}`).expect(204);
    await agent.delete(`${base}/tables/${vip.id}`).expect(404);
  });
});

describe("seating guests", () => {
  it("seats and unseats guests, counts seats by reply, and flags full tables", async () => {
    const { agent, base, guests } = await wedding();
    await agent.post(`${base}/tables`).send({ name: "1", capacity: 8 }).expect(201);
    let plan = (await agent.get(`${base}/seating`).expect(200)).body as Plan;
    // The declined guest needs no seat and isn't listed as waiting for one.
    expect(plan.unassigned.map((g) => g.id).sort()).toEqual([guests.familyA.id, guests.familyB.id, guests.friend.id].sort());
    expect(plan.summary.unseatedPeople).toBe(11);

    const t1 = plan.tables[0].id;
    plan = (await agent.post(`${base}/seating/assign`).send({ guestIds: [guests.familyA.id, guests.familyB.id], tableId: t1 }).expect(200)).body;
    expect(plan.tables[0]).toMatchObject({ seatsUsed: 9, over: true });
    expect(plan.summary.overTables).toBe(1);

    plan = (await agent.post(`${base}/seating/assign`).send({ guestIds: [guests.familyB.id], tableId: null }).expect(200)).body;
    expect(plan.tables[0]).toMatchObject({ seatsUsed: 6, over: false });

    // The guest list shows the table, and deleting the table unseats its guests.
    const guest = (await agent.get(`${base}/guests/${guests.familyA.id}`).expect(200)).body.guest;
    expect(guest.tableName).toBe("1");
    await agent.delete(`${base}/tables/${t1}`).expect(204);
    expect((await agent.get(`${base}/guests/${guests.familyA.id}`)).body.guest.tableName).toBeNull();
  });

  it("arranges guests automatically, keeping families together", async () => {
    const { agent, base, guests, event } = await wedding();
    await agent.post(`${base}/tables/bulk`).send({ count: 2, capacity: 9 }).expect(201);
    const result = (await agent.post(`${base}/seating/auto`).send({}).expect(200)).body as Plan & { seated: number; unplaced: number };
    expect(result).toMatchObject({ seated: 3, unplaced: 0 });
    const table = (id: string) => result.tables.find((t) => t.guests.some((g) => g.id === id))?.name;
    expect(table(guests.familyA.id)).toBe("1");
    expect(table(guests.familyB.id)).toBe("1"); // 6 + 3 = 9 seats
    expect(table(guests.friend.id)).toBe("2");
    expect(table(guests.declined.id)).toBeUndefined();
    expect(await prisma.auditLog.count({ where: { eventId: event.id, action: "seat_auto" } })).toBe(1);
  });

  it("finds or creates tables named in an import, and shows the table at the desk and on the invitation", async () => {
    const { agent, base, event } = await wedding();
    await agent.post(`${base}/guests/bulk`).send({ guests: [{ name: "Imported", tableName: "7" }, { name: "Imported 2", tableName: "7" }] }).expect(201);
    const plan = (await agent.get(`${base}/seating`)).body as Plan;
    expect(plan.tables.map((t) => [t.name, t.guests.length])).toEqual([["7", 2]]);

    const helper = await joinDesk(event.helperCode);
    const desk = (await helper.agent.get(`${base}/desk/guests`)).body.guests as { name: string; tableName: string | null }[];
    expect(desk.find((g) => g.name === "Imported")?.tableName).toBe("7");

    const imported = (await agent.get(`${base}/guests?q=Imported`)).body.guests[0];
    const invite = await request(app).get(`/api/invitations/${imported.inviteToken}`).expect(200);
    expect(invite.body.guest.tableName).toBe("7");
  });

  it("is for owners only and stays inside the event", async () => {
    const { base, event, guests } = await wedding();
    const helper = await joinDesk(event.helperCode);
    await helper.agent.get(`${base}/seating`).expect(403);
    await helper.agent.post(`${base}/tables`).send({ name: "x" }).expect(403);
    const other = await hostWithEvent(undefined, "PREMIUM");
    const otherBase = `/api/events/${other.event.id}`;
    const t = (await other.agent.post(`${otherBase}/tables`).send({ name: "1" }).expect(201)).body.table;
    await other.agent.post(`${otherBase}/seating/assign`).send({ guestIds: [guests.friend.id], tableId: t.id }).expect(404);
  });

  it.skipIf(!chromiumPath())("prints the seating plan", async () => {
    const { agent, base } = await wedding();
    await agent.post(`${base}/tables/bulk`).send({ count: 2 }).expect(201);
    await agent.post(`${base}/seating/auto`).send({}).expect(200);
    const res = await agent.get(`${base}/seating/plan.pdf`).buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on("data", (c: Buffer) => chunks.push(c));
      r.on("end", () => cb(null, Buffer.concat(chunks)));
    }).expect(200);
    expect((res.body as Buffer).subarray(0, 5).toString()).toBe("%PDF-");
  });
});
