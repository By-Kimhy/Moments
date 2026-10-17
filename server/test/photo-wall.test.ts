import sharp from "sharp";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { prisma } from "../src/db.js";
import { photoWallOpen } from "../src/lib/photo-wall.js";
import { app, hostWithEvent } from "./helpers.js";

const jpeg = () => sharp({ create: { width: 600, height: 400, channels: 3, background: "#2e86de" } }).jpeg().toBuffer();

/** A published Premium wedding happening now, with one guest. */
async function wedding(plan: "FREE" | "PREMIUM" = "PREMIUM") {
  const host = await hostWithEvent("Host", plan);
  const base = `/api/events/${host.event.id}`;
  await prisma.event.update({ where: { id: host.event.id }, data: { status: "PUBLISHED", startsAt: new Date(Date.now() - 3600_000) } });
  const guest = (await host.agent.post(`${base}/guests`).send({ name: "Bopha", side: "BRIDE", invitedCount: 1 }).expect(201)).body.guest;
  return { host, base, token: guest.inviteToken as string };
}

describe("photo wall", () => {
  it("opens 12 hours before the start and closes a week after", () => {
    const start = new Date("2026-12-20T00:00:00Z");
    const at = (h: number) => photoWallOpen({ status: "PUBLISHED", startsAt: start }, new Date(start.getTime() + h * 3600_000));
    expect([at(-13), at(-11), at(24 * 7 - 1), at(24 * 7 + 1)]).toEqual([false, true, true, false]);
    expect(photoWallOpen({ status: "ARCHIVED", startsAt: start }, start)).toBe(false);
  });

  it("takes guests' photos and shows them to every guest; hosts can hide or delete them", async () => {
    const { host, base, token } = await wedding();
    expect((await request(app).get(`/api/invitations/${token}`).expect(200)).body.event.photoWall).toBe(true);
    const sent = await request(app).post(`/api/invitations/${token}/photos`).attach("photos", await jpeg(), "a.jpg").attach("photos", await jpeg(), "b.jpg").expect(201);
    expect(sent.body.photos).toHaveLength(2);
    expect(sent.body.photos[0]).toMatchObject({ by: "Bopha" });

    const wall = (await request(app).get(`/api/invitations/${token}/photos`).expect(200)).body;
    expect(wall.photos).toHaveLength(2);
    await request(app).get(`/api/files/${wall.photos[0].key}`).expect(200);

    const hostWall = (await host.agent.get(`${base}/photo-wall`).expect(200)).body;
    await host.agent.post(`${base}/photo-wall/${hostWall.photos[0].id}/hide`).expect(204);
    expect((await request(app).get(`/api/invitations/${token}/photos`)).body.photos).toHaveLength(1);
    await host.agent.delete(`${base}/photo-wall/${hostWall.photos[1].id}`).expect(204);
    expect((await host.agent.get(`${base}/photo-wall`)).body.photos).toHaveLength(1);
  });

  it("is Premium, and closed outside its hours", async () => {
    const free = await wedding("FREE");
    expect((await request(app).get(`/api/invitations/${free.token}`)).body.event.photoWall).toBe(false);
    await request(app).post(`/api/invitations/${free.token}/photos`).attach("photos", await jpeg(), "a.jpg").expect(409);
    await free.host.agent.get(`${free.base}/photo-wall`).expect(402);

    const { host, token } = await wedding();
    await prisma.event.update({ where: { id: host.event.id }, data: { startsAt: new Date(Date.now() + 3 * 86_400_000) } });
    await request(app).post(`/api/invitations/${token}/photos`).attach("photos", await jpeg(), "a.jpg").expect(409);
  });
});
