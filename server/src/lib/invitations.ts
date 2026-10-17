// What a guest sees when they open their invitation link, and the RSVP rules.
import type { Event, Guest, Organization, Template } from "@prisma/client";
import { plannerBranding } from "./organizations.js";
import { z } from "zod";
import type { Photo, ScheduleItem } from "./events.js";

export type TemplateConfig = { background: string; accent: string; text: string; headingFont: string; bodyFont: string };

const DEFAULT_TEMPLATE = {
  slug: "traditional",
  style: "TRADITIONAL" as const,
  config: { background: "#7a1f1f", accent: "#d4a73c", text: "#fff8e7", headingFont: "Moul", bodyFont: "Battambang" },
};

/** Replies are accepted until the event starts, and never once it is archived. */
export const rsvpOpen = (event: Pick<Event, "status" | "startsAt">, now = new Date()) =>
  event.status !== "ARCHIVED" && now < event.startsAt;

/** The event as guests see it: no helper code, no internal ids beyond what the page needs. */
export const publicEventView = (e: Event & { template: Template | null; organization?: Organization | null }) => ({
  id: e.id,
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
  template: e.template
    ? { slug: e.template.slug, style: e.template.style, config: e.template.config as TemplateConfig }
    : DEFAULT_TEMPLATE,
  rsvpOpen: rsvpOpen(e),
  // "Planned by …" instead of the Moments footer, when a planner runs the event.
  planner: plannerBranding(e.organization ?? null),
});

export const publicGuestView = (g: Guest & { table?: { name: string } | null }) => ({
  name: g.name,
  nameAlt: g.nameAlt,
  side: g.side,
  invitedCount: g.invitedCount,
  rsvpStatus: g.rsvpStatus,
  rsvpCount: g.rsvpCount,
  rsvpMessage: g.rsvpMessage,
  tableName: g.table?.name ?? null,
});

export const rsvpSchema = z.object({
  status: z.enum(["ATTENDING", "DECLINED"], { message: "Choose whether you are coming." }),
  count: z.coerce.number().int().min(1, "At least 1 person.").max(50).optional(),
  message: z
    .string()
    .trim()
    .max(500, "Keep the message under 500 characters.")
    .nullish()
    .transform((v) => v || null),
});
