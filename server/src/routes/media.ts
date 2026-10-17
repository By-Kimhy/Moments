// Couple photos and the family's KHQR image for an event. Owners upload; anyone with the
// (unguessable) key can view, because the public invitation page shows them.
import { Router } from "express";
import { currentMember, ownersOnly } from "../access.js";
import { prisma } from "../db.js";
import { HttpError } from "../errors.js";
import { audit } from "../lib/audit.js";
import { type Photo, hostView } from "../lib/events.js";
import { imageKey, processPhoto, processQr } from "../lib/images.js";
import sharp from "sharp";
import { storage } from "../providers/storage.js";
import { imageUpload } from "../uploads.js";

export const MAX_PHOTOS = 12;

/** Mounted on /api/events/:eventId (after eventAccess). */
export const mediaRouter = Router({ mergeParams: true });
/** Mounted on /api/files. */
export const filesRouter = Router();

mediaRouter.post("/photos", ownersOnly, imageUpload.array("photos"), async (req, res) => {
  const member = currentMember(req);
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  if (!files.length) throw new HttpError(400, "Choose at least one photo.", { photos: ["Choose at least one photo."] });

  const event = await prisma.event.findUniqueOrThrow({ where: { id: member.eventId } });
  const existing = event.photos as Photo[];
  if (existing.length + files.length > MAX_PHOTOS) {
    throw new HttpError(400, `An event can have up to ${MAX_PHOTOS} photos.`, { photos: [`An event can have up to ${MAX_PHOTOS} photos.`] });
  }

  // Process everything first, so one bad file doesn't leave half the batch stored.
  const processed = await Promise.all(files.map((f) => processPhoto(f.buffer)));
  const added: Photo[] = [];
  for (const image of processed) {
    const key = imageKey(member.eventId, "photo", image.ext);
    await storage.put(key, image.body, image.contentType);
    added.push({ key });
  }
  const updated = await prisma.$transaction(async (tx) => {
    // Re-read inside the transaction so two uploads at once don't drop each other's photos.
    const current = (await tx.event.findUniqueOrThrow({ where: { id: member.eventId } })).photos as Photo[];
    const after = await tx.event.update({ where: { id: member.eventId }, data: { photos: [...current, ...added] } });
    await audit(tx, { eventId: member.eventId, entity: "event", entityId: member.eventId, action: "add_photos", actorId: member.id, after: { added } });
    return after;
  });
  res.status(201).json({ event: hostView(updated) });
});

mediaRouter.delete("/photos/:key", ownersOnly, async (req, res) => {
  const member = currentMember(req);
  const key = String(req.params.key);
  const updated = await prisma.$transaction(async (tx) => {
    const event = await tx.event.findUniqueOrThrow({ where: { id: member.eventId } });
    const photos = event.photos as Photo[];
    if (!photos.some((p) => p.key === key)) throw new HttpError(404, "Photo not found.");
    const after = await tx.event.update({ where: { id: member.eventId }, data: { photos: photos.filter((p) => p.key !== key) } });
    await audit(tx, { eventId: member.eventId, entity: "event", entityId: member.eventId, action: "remove_photo", actorId: member.id, before: { key } });
    return after;
  });
  await storage.delete(key);
  res.json({ event: hostView(updated) });
});

// Moves a photo to the front: the first photo is the invitation's cover.
mediaRouter.post("/photos/:key/cover", ownersOnly, async (req, res) => {
  const member = currentMember(req);
  const key = String(req.params.key);
  const event = await prisma.event.findUniqueOrThrow({ where: { id: member.eventId } });
  const photos = event.photos as Photo[];
  const photo = photos.find((p) => p.key === key);
  if (!photo) throw new HttpError(404, "Photo not found.");
  const updated = await prisma.event.update({ where: { id: member.eventId }, data: { photos: [photo, ...photos.filter((p) => p.key !== key)] } });
  res.json({ event: hostView(updated) });
});

mediaRouter.put("/khqr", ownersOnly, imageUpload.single("image"), async (req, res) => {
  const member = currentMember(req);
  if (!req.file) throw new HttpError(400, "Choose your KHQR image.", { image: ["Choose your KHQR image."] });
  const image = await processQr(req.file.buffer);
  const key = imageKey(member.eventId, "khqr", image.ext);
  await storage.put(key, image.body, image.contentType);
  const { before, after } = await prisma.$transaction(async (tx) => {
    const before = await tx.event.findUniqueOrThrow({ where: { id: member.eventId } });
    const after = await tx.event.update({ where: { id: member.eventId }, data: { khqrImageKey: key } });
    // A changed KHQR changes where gift money goes, so it is always on the record.
    await audit(tx, { eventId: member.eventId, entity: "event", entityId: member.eventId, action: "set_khqr", actorId: member.id, before: { key: before.khqrImageKey }, after: { key } });
    return { before, after };
  });
  if (before.khqrImageKey) await storage.delete(before.khqrImageKey);
  res.json({ event: hostView(after) });
});

mediaRouter.delete("/khqr", ownersOnly, async (req, res) => {
  const member = currentMember(req);
  const before = await prisma.$transaction(async (tx) => {
    const before = await tx.event.findUniqueOrThrow({ where: { id: member.eventId } });
    await tx.event.update({ where: { id: member.eventId }, data: { khqrImageKey: null } });
    await audit(tx, { eventId: member.eventId, entity: "event", entityId: member.eventId, action: "remove_khqr", actorId: member.id, before: { key: before.khqrImageKey } });
    return before;
  });
  if (before.khqrImageKey) await storage.delete(before.khqrImageKey);
  res.status(204).end();
});

filesRouter.get("/:key", async (req, res) => {
  const key = String(req.params.key);
  if (!/^[\w-]+\.(webp|png)$/.test(key)) throw new HttpError(404, "Not found.");
  const file = await storage.get(key);
  if (!file) throw new HttpError(404, "Not found.");
  // Keys never change content (a new upload gets a new key), so browsers may cache forever.
  res.set("Cache-Control", "public, max-age=31536000, immutable");
  res.type(file.contentType).send(file.body);
});

// A 1200×630 JPEG of a photo, for link previews: Facebook and some chat apps don't show WebP.
filesRouter.get("/:key/og.jpg", async (req, res) => {
  const key = String(req.params.key);
  if (!/^[\w-]+-photo-[\w-]+\.webp$/.test(key)) throw new HttpError(404, "Not found.");
  const file = await storage.get(key);
  if (!file) throw new HttpError(404, "Not found.");
  const jpeg = await sharp(file.body).resize(1200, 630, { fit: "cover", position: "attention" }).jpeg({ quality: 80 }).toBuffer();
  res.set("Cache-Control", "public, max-age=31536000, immutable");
  res.type("image/jpeg").send(jpeg);
});
