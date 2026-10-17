// The public side of an invitation: anyone holding a guest's link (/i/<token>) can open it and
// reply. No login. The token is the only key, so it must never be listed anywhere public.
import { Router, type Request } from "express";
import { z } from "zod";
import QRCode from "qrcode";
import { prisma } from "../db.js";
import { HttpError, parse } from "../errors.js";
import { audit } from "../lib/audit.js";
import { inviteUrl } from "../lib/guests.js";
import { notify } from "../jobs/notifications.js";
import { MAX_AMOUNT } from "../lib/money.js";
import { publicEventView, publicGuestView, rsvpOpen, rsvpSchema } from "../lib/invitations.js";
import { showThankYouCard, thankYouFor } from "../lib/thank-you.js";
import { rateLimit } from "../store.js";

export const invitationsRouter = Router();

const TOKEN = /^[\w-]{16,32}$/;

/** Is the signed-in visitor a host of this event? Hosts may preview drafts and don't count as opens. */
async function isOwner(req: Request, eventId: string) {
  if (!req.user) return false;
  const member = await prisma.eventMember.findFirst({ where: { eventId, userId: req.user.id, role: "OWNER", revokedAt: null } });
  return Boolean(member);
}

/** Finds the guest and event for a link. Drafts are only visible to the event's hosts. */
async function findInvitation(req: Request) {
  const token = String(req.params.token);
  const guest = TOKEN.test(token)
    ? await prisma.guest.findUnique({ where: { inviteToken: token }, include: { event: { include: { template: true, organization: true } }, table: { select: { name: true } } } })
    : null;
  if (!guest) throw new HttpError(404, "This invitation link is not valid.");
  const owner = await isOwner(req, guest.eventId);
  if (guest.event.status === "DRAFT" && !owner) throw new HttpError(404, "This invitation link is not valid.");
  return { guest, event: guest.event, owner };
}

const giftSchema = z
  .object({
    amount: z.coerce.number({ message: "Enter the amount." }).int("Enter the amount in cents or riel.").positive("The amount must be more than 0."),
    currency: z.enum(["USD", "KHR"], { message: "Choose USD or KHR." }),
    note: z
      .string()
      .trim()
      .max(500, "Keep the message under 500 characters.")
      .nullish()
      .transform((v) => v || null),
  })
  .refine((v) => v.amount <= MAX_AMOUNT[v.currency], { path: ["amount"], message: "That amount is too large." });

/** The KHQR gifts this guest told us about, so their page can show "waiting" or "received". */
const guestGifts = (guestId: string) =>
  prisma.gift.findMany({
    where: { guestId, source: "GUEST", voidedAt: null },
    orderBy: { createdAt: "asc" },
    select: { id: true, amount: true, currency: true, status: true, createdAt: true },
  });

invitationsRouter.get("/:token", async (req, res) => {
  const { guest, event } = await findInvitation(req);
  res.set("Cache-Control", "no-store");
  // After the wedding the page becomes a thank-you card, in both languages.
  let thankYou: { km: string; en: string } | null = null;
  if (showThankYouCard(event)) {
    const detail = await prisma.guest.findUniqueOrThrow({
      where: { id: guest.id },
      include: { checkins: { select: { id: true } }, gifts: { select: { amount: true, currency: true, status: true, voidedAt: true } } },
    });
    // No link inside the card: the guest is already on their page.
    thankYou = { km: thankYouFor(event, detail, "KM", "").trim(), en: thankYouFor(event, detail, "EN", "").trim() };
  }
  res.json({ event: publicEventView(event), guest: publicGuestView(guest), gifts: await guestGifts(guest.id), thankYou, inviteUrl: inviteUrl(guest.inviteToken) });
});

// A guest says they sent a gift by KHQR. It waits for a host to confirm the money arrived;
// until then it isn't counted in the totals.
invitationsRouter.post("/:token/gift", async (req, res) => {
  const { guest, event } = await findInvitation(req);
  if (event.status === "ARCHIVED" || !event.khqrImageKey) throw new HttpError(409, "This event no longer accepts gifts here.");
  const data = parse(giftSchema, req.body);
  await rateLimit(`guest-gift:${guest.id}`, 5, 60 * 60, "Too many gifts sent. Try again later.");
  const gift = await prisma.$transaction(async (tx) => {
    const gift = await tx.gift.create({
      data: { eventId: guest.eventId, guestId: guest.id, amount: data.amount, currency: data.currency, method: "KHQR", status: "PENDING", source: "GUEST", note: data.note },
    });
    await audit(tx, { eventId: guest.eventId, entity: "gift", entityId: gift.id, action: "guest_submit", actorId: null, after: { amount: data.amount, currency: data.currency, note: data.note } });
    return gift;
  });
  await notify({ kind: "guest_gift", giftId: gift.id });
  res.status(201).json({ gifts: await guestGifts(guest.id) });
});

// The page calls this from the browser once it has loaded. Link-preview bots (Telegram,
// Facebook) fetch the page without running scripts, so they don't count as opens.
invitationsRouter.post("/:token/open", async (req, res) => {
  const { guest, owner } = await findInvitation(req);
  if (!owner && !guest.openedAt) {
    await prisma.guest.updateMany({ where: { id: guest.id, openedAt: null }, data: { openedAt: new Date() } });
  }
  res.status(204).end();
});

invitationsRouter.post("/:token/rsvp", async (req, res) => {
  const { guest, event } = await findInvitation(req);
  await rateLimit(`rsvp:${guest.id}`, 20, 60 * 60, "Too many replies. Try again later.");
  if (!rsvpOpen(event)) throw new HttpError(409, "Replies for this event are closed.");

  const data = parse(rsvpSchema, req.body);
  const count = data.status === "ATTENDING" ? (data.count ?? guest.invitedCount) : 0;
  if (count > guest.invitedCount) {
    const message = `This invitation is for up to ${guest.invitedCount} people.`;
    throw new HttpError(400, message, { count: [message] });
  }

  const updated = await prisma.$transaction(async (tx) => {
    const after = await tx.guest.update({
      include: { table: { select: { name: true } } },
      where: { id: guest.id },
      data: { rsvpStatus: data.status, rsvpCount: count, rsvpMessage: data.message, rsvpAt: new Date(), openedAt: guest.openedAt ?? new Date() },
    });
    await audit(tx, {
      eventId: guest.eventId,
      entity: "guest",
      entityId: guest.id,
      action: "rsvp",
      actorId: null,
      before: { rsvpStatus: guest.rsvpStatus, rsvpCount: guest.rsvpCount },
      after: { rsvpStatus: after.rsvpStatus, rsvpCount: after.rsvpCount, rsvpMessage: after.rsvpMessage },
    });
    return after;
  });
  await notify({ kind: "rsvp", guestId: guest.id });
  res.json({ guest: publicGuestView(updated) });
});

// The guest's personal QR code for check-in at the entrance. It encodes the invitation link,
// so a phone camera opens the invitation and the helpers' scanner finds the guest.
invitationsRouter.get("/:token/qr.svg", async (req, res) => {
  const { guest } = await findInvitation(req);
  const svg = await QRCode.toString(inviteUrl(guest.inviteToken), { type: "svg", margin: 1, errorCorrectionLevel: "M" });
  res.set("Cache-Control", "private, max-age=3600");
  res.type("image/svg+xml").send(svg);
});
