import request from "supertest";
import { describe, expect, it } from "vitest";
import { prisma } from "../src/db.js";
import { chromiumPath } from "../src/reports/pdf.js";
import { app, hostWithEvent } from "./helpers.js";

async function wedding() {
  const host = await hostWithEvent();
  const base = `/api/events/${host.event.id}`;
  await host.agent.patch(base).send({ status: "PUBLISHED" }).expect(200);
  const guest = (await host.agent.post(`${base}/guests`).send({ name: "Chanthy", side: "GROOM", invitedCount: 1 }).expect(201)).body.guest;
  return { host, base, token: guest.inviteToken as string };
}

describe("wishes", () => {
  it("are written by guests, gathered with reply and gift messages, and hidden by hosts", async () => {
    const { host, base, token } = await wedding();
    await request(app).post(`/api/invitations/${token}/rsvp`).send({ status: "ATTENDING", count: 1, message: "Can't wait!" }).expect(200);
    await request(app).post(`/api/invitations/${token}/wishes`).send({ text: "" }).expect(400);
    await request(app).post(`/api/invitations/${token}/wishes`).send({ text: "សូមឱ្យមានសុភមង្គល" }).expect(201);
    expect((await request(app).get(`/api/invitations/${token}/wishes`).expect(200)).body.wishes).toEqual([expect.objectContaining({ text: "សូមឱ្យមានសុភមង្គល" })]);

    const all = (await host.agent.get(`${base}/wishes`).expect(200)).body.wishes;
    expect(all.map((w: { kind: string; text: string; guest: string }) => [w.kind, w.text, w.guest])).toEqual([
      ["RSVP", "Can't wait!", "Chanthy"],
      ["WISH", "សូមឱ្យមានសុភមង្គល", "Chanthy"],
    ]);
    const wish = all.find((w: { kind: string }) => w.kind === "WISH");
    await host.agent.post(`${base}/wishes/${wish.id}/hide`).expect(204);
    expect((await host.agent.get(`${base}/wishes`)).body.wishes.find((w: { id: string }) => w.id === wish.id).hidden).toBe(true);
  });

  it("allows five per guest, and stops when the event is closed", async () => {
    const { host, token } = await wedding();
    for (let i = 0; i < 5; i++) await request(app).post(`/api/invitations/${token}/wishes`).send({ text: `Wish ${i}` }).expect(201);
    await request(app).post(`/api/invitations/${token}/wishes`).send({ text: "Six" }).expect(400);
    await prisma.event.update({ where: { id: host.event.id }, data: { status: "ARCHIVED" } });
    await prisma.wish.deleteMany({ where: { eventId: host.event.id } });
    await request(app).post(`/api/invitations/${token}/wishes`).send({ text: "Late" }).expect(409);
  });

  it.skipIf(!chromiumPath())("prints the wish book", async () => {
    const { host, base, token } = await wedding();
    await request(app).post(`/api/invitations/${token}/wishes`).send({ text: "Happy forever" }).expect(201);
    const res = await host.agent.get(`${base}/wishes/book.pdf`).buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on("data", (c: Buffer) => chunks.push(c));
      r.on("end", () => cb(null, Buffer.concat(chunks)));
    }).expect(200);
    expect((res.body as Buffer).subarray(0, 5).toString()).toBe("%PDF-");
  });
});
