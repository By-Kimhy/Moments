import type { Event, Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { randomDigits } from "./codes.js";

export type ScheduleItem = { time: string; titleKm: string; titleEn: string | null };
export type Photo = { key: string };

/** A 6-digit helper code no other event is using. */
export async function uniqueHelperCode(tx: Prisma.TransactionClient = prisma): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const code = randomDigits(6);
    if (!(await tx.event.findUnique({ where: { helperCode: code }, select: { id: true } }))) return code;
  }
  throw new Error("Could not find a free helper code");
}

/** The event as hosts see it. Helpers get desk() instead. */
export const hostView = (e: Event) => ({
  id: e.id,
  type: e.type,
  status: e.status,
  titleKm: e.titleKm,
  titleEn: e.titleEn,
  brideNameKm: e.brideNameKm,
  brideNameEn: e.brideNameEn,
  groomNameKm: e.groomNameKm,
  groomNameEn: e.groomNameEn,
  startsAt: e.startsAt,
  venueKm: e.venueKm,
  venueEn: e.venueEn,
  mapUrl: e.mapUrl,
  schedule: e.schedule as ScheduleItem[],
  photos: e.photos as Photo[],
  khqrImageKey: e.khqrImageKey,
  khqrAccountName: e.khqrAccountName,
  templateId: e.templateId,
  helperCode: e.helperCode,
  slug: e.slug,
  descriptionKm: e.descriptionKm,
  descriptionEn: e.descriptionEn,
  telegramChatId: e.telegramChatId?.toString() ?? null,
  createdAt: e.createdAt,
  updatedAt: e.updatedAt,
});

/** What a helper at the desk needs to know about the event. */
export const deskView = (e: Event) => ({
  id: e.id,
  type: e.type,
  status: e.status,
  titleKm: e.titleKm,
  titleEn: e.titleEn,
  startsAt: e.startsAt,
  venueKm: e.venueKm,
  venueEn: e.venueEn,
});
