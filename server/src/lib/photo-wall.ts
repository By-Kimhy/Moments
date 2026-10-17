// The photo wall: guests send photos of the day from their invitation link, and everyone with a
// link (and the screen at the venue) sees them. Premium. Hosts can hide any photo.
import type { Event, GuestPhoto } from "@prisma/client";

export const MAX_PHOTOS_PER_GUEST = 30;
export const WALL_OPENS_HOURS_BEFORE = 12;
export const WALL_CLOSES_DAYS_AFTER = 7;

/** Guests can send photos from 12 hours before the start until a week after. */
export function photoWallOpen(e: Pick<Event, "status" | "startsAt">, now = new Date()) {
  if (e.status !== "PUBLISHED") return false;
  const start = e.startsAt.getTime();
  return now.getTime() >= start - WALL_OPENS_HOURS_BEFORE * 3600_000 && now.getTime() <= start + WALL_CLOSES_DAYS_AFTER * 86_400_000;
}

export const wallPhotoView = (p: GuestPhoto & { guest: { name: string } }) => ({
  id: p.id,
  key: p.key,
  by: p.guest.name,
  hidden: p.hiddenAt !== null,
  createdAt: p.createdAt,
});
