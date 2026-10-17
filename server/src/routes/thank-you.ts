// Thank-you messages after the wedding. Owners write the text, choose who to thank, and send
// each one with the share button (Telegram or any app); each guest's thank-you is recorded.
import type { Language } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { currentMember, isUuid, ownersOnly } from "../access.js";
import { prisma } from "../db.js";
import { HttpError, parse } from "../errors.js";
import { audit } from "../lib/audit.js";
import { inviteUrl } from "../lib/guests.js";
import { type Audience, DEFAULT_THANK_YOU, attended, gave, giftText, inAudience, thankYouFor } from "../lib/thank-you.js";

/** Mounted on /api/events/:eventId (after eventAccess). */
export const thankYouRouter = Router({ mergeParams: true });
thankYouRouter.use("/thank-you", ownersOnly);

const text = z
  .string()
  .trim()
  .max(1000, "Keep the message under 1000 characters.")
  .nullish()
  .transform((v) => v || null);
const settingsSchema = z.object({ thankYouKm: text, thankYouEn: text });
const audience = z.enum(["ALL", "ATTENDED", "GAVE"]).default("ALL");
const language = z.enum(["KM", "EN"]).default("KM");
const listQuery = z.object({ audience: audience.catch("ALL"), language: language.catch("KM") });
const sharedSchema = z.object({ language });

const guestInclude = {
  checkins: { select: { id: true } },
  gifts: { select: { amount: true, currency: true, status: true, voidedAt: true } },
  thankYous: { select: { channel: true, status: true, sentAt: true, error: true } },
} as const;

async function load(eventId: string) {
  const [event, guests] = await Promise.all([
    prisma.event.findUniqueOrThrow({ where: { id: eventId } }),
    prisma.guest.findMany({ where: { eventId }, include: guestInclude, orderBy: { name: "asc" } }),
  ]);
  return { event, guests };
}

thankYouRouter.get("/thank-you", async (req, res) => {
  const { eventId } = currentMember(req);
  const q = parse(listQuery, req.query);
  const { event, guests } = await load(eventId);
  const chosen = guests.filter((g) => inAudience(g, q.audience as Audience));
  res.json({
    settings: { thankYouKm: event.thankYouKm, thankYouEn: event.thankYouEn, defaults: DEFAULT_THANK_YOU },
    canSend: new Date() >= event.startsAt,
    counts: {
      ALL: guests.filter((g) => inAudience(g, "ALL")).length,
      ATTENDED: guests.filter(attended).length,
      GAVE: guests.filter(gave).length,
    },
    sent: {
      SHARE: guests.filter((g) => g.thankYous.some((t) => t.channel === "SHARE")).length,
    },
    guests: chosen.map((g) => ({
      id: g.id,
      name: g.name,
      phone: g.phone,
      inviteUrl: inviteUrl(g.inviteToken),
      attended: attended(g),
      gift: giftText(g.gifts, q.language as Language),
      text: thankYouFor(event, g, q.language as Language, inviteUrl(g.inviteToken)),
      shared: g.thankYous.find((t) => t.channel === "SHARE") ?? null,
    })),
  });
});

thankYouRouter.put("/thank-you/settings", async (req, res) => {
  const member = currentMember(req);
  const data = parse(settingsSchema, req.body);
  await prisma.$transaction(async (tx) => {
    await tx.event.update({ where: { id: member.eventId }, data });
    await audit(tx, { eventId: member.eventId, entity: "event", entityId: member.eventId, action: "thank_you_text", actorId: member.id, after: data });
  });
  res.status(204).end();
});

// The host shared a thank-you by hand (Telegram share button): remember it.
thankYouRouter.post("/thank-you/:guestId/shared", async (req, res) => {
  const member = currentMember(req);
  const { language: lang } = parse(sharedSchema, req.body);
  const guest = isUuid(req.params.guestId)
    ? await prisma.guest.findFirst({ where: { id: req.params.guestId, eventId: member.eventId }, include: guestInclude })
    : null;
  if (!guest) throw new HttpError(404, "Guest not found.");
  const event = await prisma.event.findUniqueOrThrow({ where: { id: member.eventId } });
  const message = thankYouFor(event, guest, lang, inviteUrl(guest.inviteToken));
  await prisma.thankYou.upsert({
    where: { guestId_channel: { guestId: guest.id, channel: "SHARE" } },
    create: { eventId: member.eventId, guestId: guest.id, channel: "SHARE", status: "SENT", sentAt: new Date(), language: lang, text: message },
    update: { status: "SENT", sentAt: new Date(), language: lang, text: message },
  });
  res.status(204).end();
});
