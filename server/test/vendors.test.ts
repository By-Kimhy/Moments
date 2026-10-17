import { randomBytes } from "node:crypto";
import sharp from "sharp";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { prisma } from "../src/db.js";
import { drainNotifications } from "../src/jobs/notifications.js";
import { type MemoryTelegramClient, telegram } from "../src/providers/telegram.js";
import { app, hostWithEvent, randomPhone, signIn } from "./helpers.js";

const jpeg = () => sharp({ create: { width: 800, height: 600, channels: 3, background: "#8e44ad" } }).jpeg().toBuffer();

async function admin() {
  const a = await signIn("Platform Admin");
  await prisma.user.update({ where: { id: a.user.id }, data: { isAdmin: true } });
  return a;
}

/** A vendor with a complete listing, published by an admin. `tag` keeps directory searches apart. */
async function publishedVendor(name: string, extra: Record<string, unknown> = {}) {
  const owner = await signIn("Vendor Owner");
  const phone = randomPhone();
  const vendor = (
    await owner.agent
      .post("/api/vendors/mine")
      .send({ name, category: "PHOTOGRAPHY", province: "phnom-penh", descriptionKm: "ថតរូបមង្គលការ", phone, priceFrom: 30000, priceCurrency: "USD", ...extra })
      .expect(201)
  ).body.vendor;
  await owner.agent.post(`/api/vendors/mine/${vendor.id}/photos`).attach("photos", await jpeg(), "a.jpg").expect(201);
  await owner.agent.post(`/api/vendors/mine/${vendor.id}/submit`).expect(200);
  const a = await admin();
  await a.agent.post(`/api/admin/vendors/${vendor.id}/approve`).expect(200);
  return { owner, vendor: vendor as { id: string; slug: string }, phone: `+855${phone.slice(1)}` };
}

describe("vendor listings", () => {
  it("goes from draft to review to the public directory", async () => {
    const tag = randomBytes(4).toString("hex");
    const owner = await signIn("Sokha");
    const created = await owner.agent.post("/api/vendors/mine").send({ name: `Golden Photo ${tag}`, category: "PHOTOGRAPHY", province: "siem-reap" }).expect(201);
    const vendor = created.body.vendor;
    expect(vendor).toMatchObject({ status: "DRAFT", slug: `golden-photo-${tag}`, priceCurrency: "USD" });

    // Not public yet, and incomplete listings can't be sent for review.
    await request(app).get(`/api/vendors/${vendor.slug}`).expect(404);
    const incomplete = await owner.agent.post(`/api/vendors/mine/${vendor.id}/submit`).set("Accept-Language", "km").expect(400);
    expect(Object.keys(incomplete.body.fieldErrors).sort()).toEqual(["descriptionKm", "phone", "photos"]);

    await owner.agent.patch(`/api/vendors/mine/${vendor.id}`).send({ descriptionKm: "ថតរូប", telegram: "@golden_photo" }).expect(200);
    await owner.agent.post(`/api/vendors/mine/${vendor.id}/photos`).attach("photos", await jpeg(), "a.jpg").expect(201);
    const sent = await owner.agent.post(`/api/vendors/mine/${vendor.id}/submit`).expect(200);
    expect(sent.body.vendor.status).toBe("PENDING_REVIEW");
    expect(sent.body.vendor.telegram).toBe("golden_photo");

    // Admins see it in the queue; other people can't reach the admin API at all.
    await owner.agent.get("/api/admin/vendors").expect(404);
    const a = await admin();
    const queue = (await a.agent.get("/api/admin/vendors").expect(200)).body;
    expect(queue.vendors.map((v: { id: string }) => v.id)).toContain(vendor.id);
    await a.agent.post(`/api/admin/vendors/${vendor.id}/approve`).expect(200);

    const list = (await request(app).get(`/api/vendors?q=${tag}`).expect(200)).body;
    expect(list.vendors).toEqual([expect.objectContaining({ slug: vendor.slug, name: `Golden Photo ${tag}`, rating: null, featured: false })]);
    expect((await request(app).get(`/api/vendors?q=${tag}&province=phnom-penh`)).body.vendors).toEqual([]);
    const profile = (await request(app).get(`/api/vendors/${vendor.slug}`).expect(200)).body;
    expect(profile.vendor.photos).toHaveLength(1);
    expect(profile.viewer).toBeNull();
    expect(profile.vendor.status).toBeUndefined(); // the public profile has no review details
    expect(profile.vendor.reviewNote).toBeUndefined();

    // Suspended listings leave the directory.
    await a.agent.post(`/api/admin/vendors/${vendor.id}/suspend`).send({ note: "Photos are not yours" }).expect(200);
    await request(app).get(`/api/vendors/${vendor.slug}`).expect(404);
    const mine = (await owner.agent.get("/api/vendors/mine").expect(200)).body.vendors;
    expect(mine[0]).toMatchObject({ status: "SUSPENDED", reviewNote: "Photos are not yours" });
  });

  it("keeps listings to their owner", async () => {
    const { vendor } = await publishedVendor(`Other ${randomBytes(3).toString("hex")}`);
    const stranger = await signIn();
    await stranger.agent.patch(`/api/vendors/mine/${vendor.id}`).send({ name: "Mine now" }).expect(404);
    await stranger.agent.get(`/api/vendors/mine/${vendor.id}/enquiries`).expect(404);
    await stranger.agent.post("/api/vendors/mine").send({ name: "Taken", slug: vendor.slug, category: "MC", province: "kep" }).expect(409);
  });

  it("lists featured vendors first, then by rating", async () => {
    const tag = randomBytes(4).toString("hex");
    const plain = await publishedVendor(`${tag} Plain`);
    const rated = await publishedVendor(`${tag} Rated`);
    const featured = await publishedVendor(`${tag} Featured`);
    const host = await signIn();
    await host.agent.post(`/api/vendors/${rated.vendor.slug}/enquiries`).send({ name: "Dara", phone: randomPhone(), message: "Hi" }).expect(201);
    await host.agent.put(`/api/vendors/${rated.vendor.slug}/reviews`).send({ rating: 4 }).expect(200);
    const a = await admin();
    await a.agent.post(`/api/admin/vendors/${featured.vendor.id}/feature`).send({ days: 30 }).expect(200);
    const list = (await request(app).get(`/api/vendors?q=${tag}`)).body.vendors;
    expect(list.map((v: { slug: string }) => v.slug)).toEqual([featured.vendor.slug, rated.vendor.slug, plain.vendor.slug]);
    expect(list[0].featured).toBe(true);
    expect(list[1]).toMatchObject({ rating: 4, reviewCount: 1 });
  });
});

describe("platform admins", () => {
  it("come from the database flag or ADMIN_PHONES", async () => {
    const phone = randomPhone();
    const before = process.env.ADMIN_PHONES;
    process.env.ADMIN_PHONES = `099 000 001, ${phone}`;
    try {
      const listed = await signIn("Listed Admin", phone);
      expect((await listed.agent.get("/api/auth/me")).body.user.isAdmin).toBe(true);
      await listed.agent.get("/api/admin/vendors").expect(200);
    } finally {
      process.env.ADMIN_PHONES = before;
    }
    const plain = await signIn();
    expect((await plain.agent.get("/api/auth/me")).body.user.isAdmin).toBe(false);
  });
});

describe("enquiries and reviews", () => {
  it("sends an enquiry to the vendor on Telegram and lets the host review", async () => {
    const { owner, vendor } = await publishedVendor(`Enquiry ${randomBytes(3).toString("hex")}`);
    const host = await hostWithEvent("Sophea");

    // No review before an enquiry.
    await host.agent.put(`/api/vendors/${vendor.slug}/reviews`).send({ rating: 5 }).expect(403);
    await request(app).post(`/api/vendors/${vendor.slug}/enquiries`).send({ name: "x", phone: randomPhone(), message: "x" }).expect(401);

    // Only the host's own events can be attached.
    const other = await hostWithEvent();
    await host.agent.post(`/api/vendors/${vendor.slug}/enquiries`).send({ name: "Sophea", phone: randomPhone(), message: "Hi", eventId: other.event.id }).expect(404);
    await host.agent
      .post(`/api/vendors/${vendor.slug}/enquiries`)
      .send({ name: "Sophea", phone: "012 777 888", eventDate: "2026-12-20", message: "Are you free on 20 December?", eventId: host.event.id })
      .expect(201);
    await drainNotifications();
    const alert = (telegram() as MemoryTelegramClient).sent.find((m) => m.chatId === String(owner.telegramId) && m.text.includes("Are you free"));
    expect(alert?.text).toContain("Sophea · +85512777888 · 2026-12-20");

    const inbox = (await owner.agent.get(`/api/vendors/mine/${vendor.id}/enquiries`).expect(200)).body.enquiries;
    expect(inbox).toEqual([expect.objectContaining({ name: "Sophea", phone: "+85512777888", message: "Are you free on 20 December?", read: false })]);
    expect((await owner.agent.get("/api/vendors/mine")).body.vendors[0].unreadEnquiries).toBe(1);
    await owner.agent.post(`/api/vendors/mine/${vendor.id}/enquiries/read`).expect(204);
    expect((await owner.agent.get("/api/vendors/mine")).body.vendors[0].unreadEnquiries).toBe(0);

    // Review, then edit it: still one review.
    expect((await host.agent.get(`/api/vendors/${vendor.slug}`)).body.viewer).toMatchObject({ enquired: true, canReview: true, myReview: null });
    await host.agent.put(`/api/vendors/${vendor.slug}/reviews`).send({ rating: 3, text: "OK" }).expect(200);
    const review = (await host.agent.put(`/api/vendors/${vendor.slug}/reviews`).send({ rating: 5, text: "Beautiful photos" }).expect(200)).body.review;
    await host.agent.put(`/api/vendors/${vendor.slug}/reviews`).send({ rating: 6 }).expect(400);

    // The vendor replies; the owner can't review themselves.
    await owner.agent.put(`/api/vendors/mine/${vendor.id}/reviews/${review.id}/reply`).send({ reply: "Thank you!" }).expect(200);
    await owner.agent.put(`/api/vendors/${vendor.slug}/reviews`).send({ rating: 5 }).expect(403);
    const profile = (await request(app).get(`/api/vendors/${vendor.slug}`)).body;
    expect(profile.vendor).toMatchObject({ rating: 5, reviewCount: 1 });
    expect(profile.reviews).toEqual([expect.objectContaining({ rating: 5, text: "Beautiful photos", reply: "Thank you!", author: "Sophea" })]);

    // Hidden reviews don't count.
    const a = await admin();
    await a.agent.post(`/api/admin/reviews/${review.id}/hide`).expect(204);
    const hidden = (await request(app).get(`/api/vendors/${vendor.slug}`)).body;
    expect(hidden.vendor).toMatchObject({ rating: null, reviewCount: 0 });
    expect(hidden.reviews).toEqual([]);
  });
});

describe("event shortlist", () => {
  it("saves vendors to an event as considering or booked", async () => {
    const { vendor } = await publishedVendor(`Shortlist ${randomBytes(3).toString("hex")}`);
    const host = await hostWithEvent();
    const base = `/api/events/${host.event.id}/vendors`;
    await host.agent.put(`${base}/${vendor.id}`).send({}).expect(200);
    await host.agent.put(`${base}/${vendor.id}`).send({ status: "BOOKED", note: "Deposit paid $100" }).expect(200);
    const list = (await host.agent.get(base).expect(200)).body.vendors;
    expect(list).toEqual([expect.objectContaining({ vendorId: vendor.id, status: "BOOKED", note: "Deposit paid $100", listed: true })]);

    // Other events can't see it; unpublished vendors can't be added.
    const other = await hostWithEvent();
    expect((await other.agent.get(`/api/events/${other.event.id}/vendors`)).body.vendors).toEqual([]);
    const draft = (await other.agent.post("/api/vendors/mine").send({ name: "Draft", category: "MC", province: "kep" })).body.vendor;
    await other.agent.put(`/api/events/${other.event.id}/vendors/${draft.id}`).send({}).expect(404);

    await host.agent.delete(`${base}/${vendor.id}`).expect(204);
    expect((await host.agent.get(base)).body.vendors).toEqual([]);
  });
});
