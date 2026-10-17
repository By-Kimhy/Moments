// The guest desk at the entrance: owners and helpers find guests (by name or by scanning the
// QR on their invitation), check them in, add walk-ins, and watch the live count.
// Writes carry a clientId made on the phone, so a request sent twice (bad venue wifi, or the
// offline queue replaying) records only once.
import type { Checkin, Guest } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { currentMember, isUuid } from "../access.js";
import { prisma } from "../db.js";
import { HttpError, parse } from "../errors.js";
import { audit } from "../lib/audit.js";
import { translate } from "../messages.js";
import { newInviteToken, sha256 } from "../lib/codes.js";

/** Mounted on /api/events/:eventId (after eventAccess). Open to owners and helpers. */
export const checkinsRouter = Router({ mergeParams: true });

type CheckinWithMember = Checkin & { checkedInBy: { displayName: string } };

/**
 * A guest as the desk sees it. The invitation token itself stays private (it opens the guest's
 * page); the desk gets a hash of it to match scanned QR codes, even offline.
 */
type DeskGift = { id: string; amount: number; currency: "USD" | "KHR"; method: "CASH" | "KHQR"; status: string };

export const deskGuestView = (g: Guest & { checkins: CheckinWithMember[]; gifts?: DeskGift[] }) => ({
  id: g.id,
  name: g.name,
  nameAlt: g.nameAlt,
  phone: g.phone,
  side: g.side,
  group: g.group,
  invitedCount: g.invitedCount,
  rsvpStatus: g.rsvpStatus,
  rsvpCount: g.rsvpCount,
  tableNo: g.tableNo,
  walkIn: g.walkIn,
  tokenHash: tokenHash(g.inviteToken),
  checkin: g.checkins[0] ? checkinView(g.checkins[0]) : null,
  // So the desk sees a guest already gave, and doesn't record the same envelope twice.
  gifts: (g.gifts ?? []).map((x) => ({ id: x.id, amount: x.amount, currency: x.currency, method: x.method, status: x.status })),
});

export const tokenHash = (token: string) => sha256(token).slice(0, 20);

const checkinView = (c: CheckinWithMember) => ({
  id: c.id,
  peopleCount: c.peopleCount,
  checkedInAt: c.checkedInAt,
  checkedInBy: c.checkedInBy.displayName,
});

const withCheckin = {
  checkins: { include: { checkedInBy: { select: { displayName: true } } } },
  gifts: { where: { voidedAt: null, status: { not: "REJECTED" } }, select: { id: true, amount: true, currency: true, method: true, status: true } },
} as const;

// The time the phone recorded it; offline check-ins arrive later. Must be within the last week
// and not (much) in the future.
const deviceTime = z.coerce
  .date()
  .optional()
  .refine((d) => !d || (d.getTime() <= Date.now() + 5 * 60_000 && d.getTime() >= Date.now() - 7 * 86_400_000), "That time is not valid.");

const peopleCount = z.coerce.number({ message: "Enter how many people arrived." }).int("Enter a whole number.").min(1, "At least 1 person.").max(50, "At most 50 people per invitation.");

const checkinSchema = z.object({
  guestId: z.string().refine(isUuid, "Choose a guest."),
  peopleCount,
  clientId: z.string().refine(isUuid).optional(),
  checkedInAt: deviceTime,
});

const walkInSchema = z.object({
  name: z.string().trim().min(1, "Enter the guest's name.").max(160),
  side: z.enum(["BRIDE", "GROOM", "BOTH"], { message: "Choose the bride's or groom's side." }).default("BOTH"),
  phone: z
    .string()
    .trim()
    .max(20)
    .nullish()
    .transform((v) => v || null),
  peopleCount,
  clientId: z.string().refine(isUuid, "Missing clientId."),
  checkedInAt: deviceTime,
});

async function stats(eventId: string) {
  const [guests, checkins, recent] = await Promise.all([
    prisma.guest.findMany({ where: { eventId }, select: { invitedCount: true, rsvpStatus: true, rsvpCount: true, walkIn: true } }),
    prisma.checkin.aggregate({ where: { eventId }, _count: true, _sum: { peopleCount: true } }),
    prisma.checkin.findMany({
      where: { eventId },
      orderBy: { checkedInAt: "desc" },
      take: 8,
      include: { guest: { select: { id: true, name: true } }, checkedInBy: { select: { displayName: true } } },
    }),
  ]);
  const invited = guests.filter((g) => !g.walkIn);
  return {
    checkedInGuests: checkins._count,
    checkedInPeople: checkins._sum.peopleCount ?? 0,
    expectedPeople: invited.reduce((sum, g) => sum + (g.rsvpStatus === "ATTENDING" ? (g.rsvpCount ?? g.invitedCount) : 0), 0),
    invitedPeople: invited.reduce((sum, g) => sum + g.invitedCount, 0),
    invitedGuests: invited.length,
    walkIns: guests.length - invited.length,
    recent: recent.map((c) => ({ guestId: c.guest.id, name: c.guest.name, ...checkinView(c) })),
  };
}

/** The whole list, so the desk can search instantly and keep working when the wifi drops. */
checkinsRouter.get("/desk/guests", async (req, res) => {
  const { eventId } = currentMember(req);
  const guests = await prisma.guest.findMany({ where: { eventId }, orderBy: { name: "asc" }, include: withCheckin });
  res.json({ guests: guests.map(deskGuestView), stats: await stats(eventId), at: new Date() });
});

checkinsRouter.get("/desk/stats", async (req, res) => {
  res.json({ stats: await stats(currentMember(req).eventId) });
});

checkinsRouter.post("/checkins", async (req, res) => {
  const member = currentMember(req);
  const data = parse(checkinSchema, req.body);
  const guest = await prisma.guest.findFirst({ where: { id: data.guestId, eventId: member.eventId }, include: withCheckin });
  if (!guest) throw new HttpError(404, "Guest not found.");

  const existing = guest.checkins[0];
  if (existing) {
    // The same check-in sent again: answer as if it just worked.
    if (data.clientId && existing.clientId === data.clientId) {
      res.json({ guest: deskGuestView(guest), duplicate: true });
      return;
    }
    res.status(409).json({ error: translate("Already checked in.", req.acceptsLanguages("en", "km")), guest: deskGuestView(guest) });
    return;
  }

  let created = true;
  try {
    await prisma.$transaction(async (tx) => {
      const created = await tx.checkin.create({
        data: { eventId: member.eventId, guestId: guest.id, peopleCount: data.peopleCount, clientId: data.clientId, checkedInById: member.id, checkedInAt: data.checkedInAt },
      });
      await audit(tx, { eventId: member.eventId, entity: "checkin", entityId: created.id, action: "create", actorId: member.id, after: { guestId: guest.id, peopleCount: data.peopleCount } });
    });
  } catch (e) {
    // Two phones checked the same guest in at the same moment: the other one won.
    if ((e as { code?: string }).code !== "P2002") throw e;
    created = false;
  }
  const after = await prisma.guest.findUniqueOrThrow({ where: { id: guest.id }, include: withCheckin });
  if (!created) {
    res.status(409).json({ error: translate("Already checked in.", req.acceptsLanguages("en", "km")), guest: deskGuestView(after) });
    return;
  }
  res.status(201).json({ guest: deskGuestView(after) });
});

// Undo a check-in made by mistake (wrong guest tapped).
checkinsRouter.delete("/checkins/:guestId", async (req, res) => {
  const member = currentMember(req);
  const checkin = isUuid(req.params.guestId)
    ? await prisma.checkin.findFirst({ where: { eventId: member.eventId, guestId: req.params.guestId } })
    : null;
  if (checkin) {
    await prisma.$transaction(async (tx) => {
      await tx.checkin.delete({ where: { id: checkin.id } });
      await audit(tx, { eventId: member.eventId, entity: "checkin", entityId: checkin.id, action: "delete", actorId: member.id, before: checkin });
    });
  }
  const guest = isUuid(req.params.guestId)
    ? await prisma.guest.findFirst({ where: { id: req.params.guestId, eventId: member.eventId }, include: withCheckin })
    : null;
  if (!guest) throw new HttpError(404, "Guest not found.");
  res.json({ guest: deskGuestView(guest) });
});

// Someone who wasn't on the list: add them and check them in at once.
checkinsRouter.post("/desk/walk-ins", async (req, res) => {
  const member = currentMember(req);
  const data = parse(walkInSchema, req.body);
  const existing = await prisma.guest.findUnique({ where: { eventId_clientId: { eventId: member.eventId, clientId: data.clientId } }, include: withCheckin });
  if (existing) {
    res.json({ guest: deskGuestView(existing), duplicate: true });
    return;
  }
  const guest = await prisma.$transaction(async (tx) => {
    const created = await tx.guest.create({
      data: {
        eventId: member.eventId,
        clientId: data.clientId,
        name: data.name,
        phone: data.phone,
        side: data.side,
        invitedCount: data.peopleCount,
        inviteToken: newInviteToken(),
        walkIn: true,
      },
    });
    const checkin = await tx.checkin.create({
      data: { eventId: member.eventId, guestId: created.id, peopleCount: data.peopleCount, checkedInById: member.id, checkedInAt: data.checkedInAt },
    });
    await audit(tx, { eventId: member.eventId, entity: "guest", entityId: created.id, action: "walk_in", actorId: member.id, after: { name: data.name, side: data.side } });
    await audit(tx, { eventId: member.eventId, entity: "checkin", entityId: checkin.id, action: "create", actorId: member.id, after: { guestId: created.id, peopleCount: data.peopleCount } });
    return tx.guest.findUniqueOrThrow({ where: { id: created.id }, include: withCheckin });
  });
  res.status(201).json({ guest: deskGuestView(guest) });
});
