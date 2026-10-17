import sharp from "sharp";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { prisma } from "../src/db.js";
import { app, hostWithEvent, joinDesk } from "./helpers.js";

const jpeg = (width = 2400, height = 1600) =>
  sharp({ create: { width, height, channels: 3, background: "#c0392b" } })
    .withExif({ IFD0: { Copyright: "secret-location" } })
    .jpeg()
    .toBuffer();
const png = () => sharp({ create: { width: 300, height: 300, channels: 3, background: "#000" } }).png().toBuffer();

describe("event photos", () => {
  it("uploads, resizes, strips metadata, serves, reorders and removes photos", async () => {
    const { agent, event } = await hostWithEvent();
    const res = await agent
      .post(`/api/events/${event.id}/photos`)
      .attach("photos", await jpeg(), "a.jpg")
      .attach("photos", await jpeg(800, 600), "b.jpg")
      .expect(201);
    const photos = res.body.event.photos as { key: string }[];
    expect(photos).toHaveLength(2);
    expect(photos[0].key).toMatch(new RegExp(`^${event.id}-photo-[\\w-]+\\.webp$`));

    // Served publicly (the invitation shows them), smaller than 1600px, no EXIF left.
    const file = await request(app).get(`/api/files/${photos[0].key}`).buffer(true).expect(200);
    expect(file.headers["content-type"]).toBe("image/webp");
    expect(file.headers["cache-control"]).toContain("immutable");
    const meta = await sharp(file.body as Buffer).metadata();
    expect(meta.width).toBe(1600);
    expect(meta.exif).toBeUndefined();

    const cover = await agent.post(`/api/events/${event.id}/photos/${photos[1].key}/cover`).expect(200);
    expect(cover.body.event.photos.map((p: { key: string }) => p.key)).toEqual([photos[1].key, photos[0].key]);

    await agent.delete(`/api/events/${event.id}/photos/${photos[0].key}`).expect(200);
    await request(app).get(`/api/files/${photos[0].key}`).expect(404);
    const logs = await prisma.auditLog.findMany({ where: { eventId: event.id, action: { in: ["add_photos", "remove_photo"] } } });
    expect(logs).toHaveLength(2);
  });

  it("rejects files that aren't images, and more than 12 photos", async () => {
    const { agent, event } = await hostWithEvent();
    const bad = await agent.post(`/api/events/${event.id}/photos`).attach("photos", Buffer.from("<script>"), "x.jpg");
    expect(bad.status).toBe(400);
    expect(bad.body.error).toMatch(/JPEG, PNG or WebP/);

    const tooMany = agent.post(`/api/events/${event.id}/photos`);
    const img = await jpeg(100, 100);
    for (let i = 0; i < 13; i++) tooMany.attach("photos", img, `${i}.jpg`);
    expect((await tooMany).status).toBe(400);
    await agent.post(`/api/events/${event.id}/photos`).expect(400);
  });

  it("only lets owners change photos and the KHQR", async () => {
    const { event } = await hostWithEvent();
    const helper = await joinDesk(event.helperCode);
    await helper.agent.post(`/api/events/${event.id}/photos`).attach("photos", await jpeg(100, 100), "a.jpg").expect(403);
    await helper.agent.put(`/api/events/${event.id}/khqr`).attach("image", await png(), "qr.png").expect(403);
    const other = await hostWithEvent();
    await other.agent.put(`/api/events/${event.id}/khqr`).attach("image", await png(), "qr.png").expect(404);
  });
});

describe("KHQR image", () => {
  it("stores a lossless PNG, replaces the old one, and logs every change", async () => {
    const { agent, event } = await hostWithEvent();
    const first = await agent.put(`/api/events/${event.id}/khqr`).attach("image", await png(), "qr.png").expect(200);
    const firstKey = first.body.event.khqrImageKey as string;
    expect(firstKey).toMatch(/-khqr-.+\.png$/);
    const file = await request(app).get(`/api/files/${firstKey}`).expect(200);
    expect(file.headers["content-type"]).toBe("image/png");

    const second = await agent.put(`/api/events/${event.id}/khqr`).attach("image", await jpeg(500, 500), "qr.jpg").expect(200);
    expect(second.body.event.khqrImageKey).not.toBe(firstKey);
    await request(app).get(`/api/files/${firstKey}`).expect(404);

    await agent.delete(`/api/events/${event.id}/khqr`).expect(204);
    const logs = await prisma.auditLog.findMany({ where: { eventId: event.id, action: { in: ["set_khqr", "remove_khqr"] } }, orderBy: { createdAt: "asc" } });
    expect(logs.map((l) => l.action)).toEqual(["set_khqr", "set_khqr", "remove_khqr"]);
  });

  it("refuses odd file keys", async () => {
    await request(app).get("/api/files/..%2F..%2Fetc%2Fpasswd").expect(404);
    await request(app).get("/api/files/nothing-here.png").expect(404);
  });
});
