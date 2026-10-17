import request from "supertest";
import { describe, expect, it } from "vitest";
import { prisma } from "../src/db.js";
import { app, hostWithEvent, randomPhone, sampleEvent, signIn } from "./helpers.js";

describe("deleting an account", () => {
  it("wipes the person's details, ends their sessions, and archives events only they ran", async () => {
    const host = await hostWithEvent("Dara");
    const shared = (await host.agent.post("/api/events").send(sampleEvent).expect(201)).body.event;
    const cohostPhone = randomPhone();
    await host.agent.post(`/api/events/${shared.id}/cohosts`).send({ phone: cohostPhone, name: "Sophea" }).expect(201);
    await prisma.vendor.create({ data: { ownerId: host.user.id, slug: `del-${Date.now()}`, name: "Dara Photo", category: "PHOTOGRAPHY", province: "kep", status: "PUBLISHED" } });

    await host.agent.post("/api/auth/me/delete").send({ confirm: "yes" }).expect(400);
    const res = await host.agent.post("/api/auth/me/delete").send({ confirm: "DELETE" }).expect(200);
    expect(res.body).toEqual({ archivedEvents: 1 });
    await host.agent.get("/api/auth/me").expect(401);
    await request(app).get("/api/auth/me").set("Authorization", `Bearer ${host.token}`).expect(401);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: host.user.id } });
    expect(user).toMatchObject({ name: "Deleted user", phone: null, telegramId: null });
    expect((await prisma.event.findUniqueOrThrow({ where: { id: host.event.id } })).status).toBe("ARCHIVED");
    expect((await prisma.event.findUniqueOrThrow({ where: { id: shared.id } })).status).toBe("DRAFT");
    expect(await prisma.vendor.count({ where: { ownerId: host.user.id, status: "PUBLISHED" } })).toBe(0);

    // The co-host still runs the shared event; the same Telegram later starts a fresh account.
    const cohost = await signIn("Sophea", cohostPhone);
    await cohost.agent.get(`/api/events/${shared.id}`).expect(200);
    const again = await signIn("Dara", host.phone, host.telegramId);
    expect(again.user.id).not.toBe(host.user.id);
    await again.agent.get(`/api/events/${host.event.id}`).expect(404);
  });

  it("asks the last owner of an organization with staff to hand it over first", async () => {
    const owner = await signIn("Planner");
    const org = (await owner.agent.post("/api/organizations").send({ name: "Golden Day" }).expect(201)).body.organization;
    const staffPhone = randomPhone();
    await owner.agent.post(`/api/organizations/${org.id}/members`).send({ phone: staffPhone, name: "Staff" }).expect(201);
    const res = await owner.agent.post("/api/auth/me/delete").set("Accept-Language", "km").send({ confirm: "DELETE" }).expect(409);
    expect(res.body.error).toBe("សូមដាក់អ្នកផ្សេងជាម្ចាស់ Golden Day ជាមុនសិន។");
    await owner.agent.get("/api/auth/me").expect(200);
  });
});
