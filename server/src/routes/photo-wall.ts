// The photo wall for an event's hosts: every photo (hidden ones too), hiding and deleting.
import { Router } from "express";
import { currentMember, isUuid, ownersOnly } from "../access.js";
import { prisma } from "../db.js";
import { HttpError } from "../errors.js";
import { photoWallOpen, wallPhotoView } from "../lib/photo-wall.js";
import { requireFeature } from "../lib/plan-limits.js";
import { storage } from "../providers/storage.js";

/** Mounted on /api/events/:eventId (after eventAccess). */
export const photoWallRouter = Router({ mergeParams: true });
photoWallRouter.use("/photo-wall", ownersOnly, requireFeature("photoWall", "The photo wall is part of the Premium plan."));

photoWallRouter.get("/photo-wall", async (req, res) => {
  const { eventId } = currentMember(req);
  const [event, photos] = await Promise.all([
    prisma.event.findUniqueOrThrow({ where: { id: eventId } }),
    prisma.guestPhoto.findMany({ where: { eventId }, include: { guest: { select: { name: true } } }, orderBy: { createdAt: "desc" } }),
  ]);
  res.json({ open: photoWallOpen(event), photos: photos.map(wallPhotoView) });
});

async function photoFor(eventId: string, photoId: unknown) {
  const photo = isUuid(photoId) ? await prisma.guestPhoto.findFirst({ where: { id: photoId, eventId } }) : null;
  if (!photo) throw new HttpError(404, "Photo not found.");
  return photo;
}

photoWallRouter.post("/photo-wall/:photoId/hide", async (req, res) => {
  const photo = await photoFor(currentMember(req).eventId, req.params.photoId);
  await prisma.guestPhoto.update({ where: { id: photo.id }, data: { hiddenAt: new Date() } });
  res.status(204).end();
});

photoWallRouter.post("/photo-wall/:photoId/show", async (req, res) => {
  const photo = await photoFor(currentMember(req).eventId, req.params.photoId);
  await prisma.guestPhoto.update({ where: { id: photo.id }, data: { hiddenAt: null } });
  res.status(204).end();
});

photoWallRouter.delete("/photo-wall/:photoId", async (req, res) => {
  const photo = await photoFor(currentMember(req).eventId, req.params.photoId);
  await prisma.guestPhoto.delete({ where: { id: photo.id } });
  await storage.delete(photo.key);
  res.status(204).end();
});
