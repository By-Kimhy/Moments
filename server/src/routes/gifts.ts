// The gift book (chamnang dai). Helpers record cash and KHQR gifts at the desk; hosts see
// everything, confirm the KHQR gifts guests say they sent, and correct mistakes. Gifts are
// never deleted or silently changed: every edit, void, confirm and reject is in the audit log.
import type { Gift, Guest, Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { type CurrentMember } from "../auth.js";
import { currentMember, isUuid, ownersOnly } from "../access.js";
import { prisma } from "../db.js";
import { HttpError, parse } from "../errors.js";
import { audit } from "../lib/audit.js";
import { giftTotals } from "../lib/gifts.js";
import { MAX_AMOUNT } from "../lib/money.js";
import { scheduleDeskDigest } from "../jobs/notifications.js";
import { paymentProvider } from "../providers/payment.js";

/** Mounted on /api/events/:eventId (after eventAccess). */
export const giftsRouter = Router({ mergeParams: true });

const include = {
  guest: { select: { id: true, name: true, side: true, group: true, clientId: true } },
  recordedBy: { select: { displayName: true } },
  voidedBy: { select: { displayName: true } },
} as const;

type GiftWithRelations = Gift & {
  guest: Pick<Guest, "id" | "name" | "side" | "group" | "clientId"> | null;
  recordedBy: { displayName: string } | null;
  voidedBy: { displayName: string } | null;
};

export const giftView = (g: GiftWithRelations) => ({
  id: g.id,
  clientId: g.clientId,
  guestId: g.guestId,
  guestName: g.guest?.name ?? g.giverName ?? "",
  giverName: g.giverName,
  side: g.guest?.side ?? null,
  group: g.guest?.group ?? null,
  amount: g.amount,
  currency: g.currency,
  method: g.method,
  status: g.status,
  source: g.source,
  note: g.note,
  recordedById: g.recordedById,
  recordedBy: g.recordedBy?.displayName ?? null,
  recordedAt: g.recordedAt,
  confirmedAt: g.confirmedAt,
  voidedAt: g.voidedAt,
  voidedBy: g.voidedBy?.displayName ?? null,
  voidReason: g.voidReason,
});

const amountFields = {
  amount: z.coerce.number({ message: "Enter the amount." }).int("Enter the amount in cents or riel.").positive("The amount must be more than 0."),
  currency: z.enum(["USD", "KHR"], { message: "Choose USD or KHR." }),
};
const tooLarge = (v: { amount?: number; currency?: "USD" | "KHR" }) => !v.amount || !v.currency || v.amount <= MAX_AMOUNT[v.currency];
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => v || null);

const createSchema = z
  .object({
    ...amountFields,
    method: z.enum(["CASH", "KHQR"]).default("CASH"),
    guestId: z.string().refine(isUuid, "Choose a guest.").nullish(),
    // A guest added offline at the desk, known only by the id the phone gave it.
    guestClientId: z.string().refine(isUuid).nullish(),
    giverName: optionalText(160),
    note: optionalText(500),
    clientId: z.string().refine(isUuid, "Missing clientId."),
    recordedAt: z.coerce
      .date()
      .optional()
      .refine((d) => !d || (d.getTime() <= Date.now() + 5 * 60_000 && d.getTime() >= Date.now() - 7 * 86_400_000), "That time is not valid."),
  })
  .refine(tooLarge, { path: ["amount"], message: "That amount is too large." })
  .refine((v) => v.guestId || v.guestClientId || v.giverName, { path: ["giverName"], message: "Choose a guest or enter the giver's name." });

const updateSchema = z
  .object({
    ...amountFields,
    method: z.enum(["CASH", "KHQR"]),
    guestId: z.string().refine(isUuid, "Choose a guest.").nullable(),
    giverName: optionalText(160),
    note: optionalText(500),
  })
  .partial()
  .refine(tooLarge, { path: ["amount"], message: "That amount is too large." });

const reasonSchema = z.object({ reason: z.string().trim().min(1, "Give a reason.").max(300) });

const listQuery = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(["PENDING", "CONFIRMED", "REJECTED", "VOIDED"]).optional().catch(undefined),
  currency: z.enum(["USD", "KHR"]).optional().catch(undefined),
  method: z.enum(["CASH", "KHQR"]).optional().catch(undefined),
});

async function findGift(member: CurrentMember, giftId: unknown) {
  const gift = isUuid(giftId) ? await prisma.gift.findFirst({ where: { id: giftId, eventId: member.eventId }, include }) : null;
  if (!gift) throw new HttpError(404, "Gift not found.");
  return gift;
}

/** Helpers may only touch the gifts they recorded themselves. */
function checkCanChange(member: CurrentMember, gift: Gift) {
  if (member.role !== "OWNER" && gift.recordedById !== member.id) throw new HttpError(403, "Only the hosts can do this.");
  if (gift.voidedAt) throw new HttpError(409, "This gift was cancelled and can't be changed.");
}

async function guestInEvent(eventId: string, guestId: string | null | undefined) {
  if (!guestId) return null;
  const guest = await prisma.guest.findFirst({ where: { id: guestId, eventId }, select: { id: true } });
  if (!guest) throw new HttpError(404, "Guest not found.");
  return guest.id;
}

giftsRouter.post("/gifts", async (req, res) => {
  const member = currentMember(req);
  const data = parse(createSchema, req.body);

  // Sent before (retry, or the offline queue replaying): return the gift already saved.
  const existing = await prisma.gift.findUnique({ where: { eventId_clientId: { eventId: member.eventId, clientId: data.clientId } }, include });
  if (existing) {
    res.json({ gift: giftView(existing), duplicate: true });
    return;
  }

  let guestId = await guestInEvent(member.eventId, data.guestId);
  if (!guestId && data.guestClientId) {
    const guest = await prisma.guest.findUnique({ where: { eventId_clientId: { eventId: member.eventId, clientId: data.guestClientId } } });
    if (!guest) throw new HttpError(404, "Guest not found.");
    guestId = guest.id;
  }

  const gift = await prisma.$transaction(async (tx) => {
    const created = await tx.gift.create({
      data: {
        eventId: member.eventId,
        clientId: data.clientId,
        guestId,
        giverName: guestId ? null : data.giverName,
        amount: data.amount,
        currency: data.currency,
        method: data.method,
        status: "CONFIRMED",
        source: member.role === "OWNER" ? "HOST" : "DESK",
        note: data.note,
        recordedById: member.id,
        recordedAt: data.recordedAt,
        confirmedAt: new Date(),
      },
      include,
    });
    await audit(tx, { eventId: member.eventId, entity: "gift", entityId: created.id, action: "create", actorId: member.id, after: giftView(created) });
    return created;
  });
  await scheduleDeskDigest(member.eventId);
  res.status(201).json({ gift: giftView(gift) });
});

// Owners: every gift with totals. Helpers: the gifts they recorded, with the total they should
// have in their cash box.
giftsRouter.get("/gifts", async (req, res) => {
  const member = currentMember(req);
  const { q, status, currency, method } = parse(listQuery, req.query);
  const where: Prisma.GiftWhereInput = { eventId: member.eventId, currency, method };
  if (member.role !== "OWNER") where.recordedById = member.id;
  if (status === "VOIDED") where.voidedAt = { not: null };
  else if (status) Object.assign(where, { status, voidedAt: null });
  if (q) {
    where.OR = [
      { giverName: { contains: q, mode: "insensitive" } },
      { note: { contains: q, mode: "insensitive" } },
      { guest: { name: { contains: q, mode: "insensitive" } } },
      { guest: { nameAlt: { contains: q, mode: "insensitive" } } },
    ];
  }
  const [gifts, all] = await Promise.all([
    prisma.gift.findMany({ where, include, orderBy: { recordedAt: "desc" } }),
    prisma.gift.findMany({
      where: { eventId: member.eventId, ...(member.role === "OWNER" ? {} : { recordedById: member.id }) },
      select: { amount: true, currency: true, method: true, status: true, voidedAt: true, guest: { select: { side: true, group: true } } },
    }),
  ]);
  res.json({ gifts: gifts.map(giftView), totals: giftTotals(all) });
});

giftsRouter.patch("/gifts/:giftId", async (req, res) => {
  const member = currentMember(req);
  const before = await findGift(member, req.params.giftId);
  checkCanChange(member, before);
  const data = parse(updateSchema, req.body);
  if (data.guestId !== undefined) data.guestId = await guestInEvent(member.eventId, data.guestId);
  const giverName = data.guestId ? null : (data.giverName ?? before.giverName);
  if (data.guestId === null && !giverName) {
    throw new HttpError(400, "Choose a guest or enter the giver's name.", { giverName: ["Choose a guest or enter the giver's name."] });
  }
  const currency = data.currency ?? before.currency;
  if ((data.amount ?? before.amount) > MAX_AMOUNT[currency]) throw new HttpError(400, "That amount is too large.", { amount: ["That amount is too large."] });

  const gift = await prisma.$transaction(async (tx) => {
    const after = await tx.gift.update({ where: { id: before.id }, data: { ...data, giverName }, include });
    await audit(tx, { eventId: member.eventId, entity: "gift", entityId: before.id, action: "update", actorId: member.id, before: giftView(before), after: giftView(after) });
    return after;
  });
  res.json({ gift: giftView(gift) });
});

// Cancels a gift recorded by mistake. It stays in the book, crossed out, with the reason.
giftsRouter.post("/gifts/:giftId/void", async (req, res) => {
  const member = currentMember(req);
  const before = await findGift(member, req.params.giftId);
  checkCanChange(member, before);
  const { reason } = parse(reasonSchema, req.body);
  const gift = await prisma.$transaction(async (tx) => {
    const after = await tx.gift.update({ where: { id: before.id }, data: { voidedAt: new Date(), voidedById: member.id, voidReason: reason }, include });
    await audit(tx, { eventId: member.eventId, entity: "gift", entityId: before.id, action: "void", actorId: member.id, before: giftView(before), after: { reason } });
    return after;
  });
  res.json({ gift: giftView(gift) });
});

// A host checked their bank app and the KHQR gift a guest reported has arrived.
giftsRouter.post("/gifts/:giftId/confirm", ownersOnly, async (req, res) => {
  const member = currentMember(req);
  const before = await findGift(member, req.params.giftId);
  if (before.status !== "PENDING" || before.voidedAt) throw new HttpError(409, "Only gifts waiting for confirmation can be confirmed.");
  const gift = await prisma.$transaction(async (tx) => {
    const paymentId = await paymentProvider.recordConfirmation(tx, before, member.id);
    const after = await tx.gift.update({ where: { id: before.id }, data: { status: "CONFIRMED", confirmedAt: new Date(), paymentId, recordedById: member.id }, include });
    await audit(tx, { eventId: member.eventId, entity: "gift", entityId: before.id, action: "confirm", actorId: member.id, before: { status: before.status }, after: { status: "CONFIRMED", paymentId } });
    return after;
  });
  res.json({ gift: giftView(gift) });
});

// The money never arrived (or the guest made a mistake).
giftsRouter.post("/gifts/:giftId/reject", ownersOnly, async (req, res) => {
  const member = currentMember(req);
  const before = await findGift(member, req.params.giftId);
  if (before.status !== "PENDING" || before.voidedAt) throw new HttpError(409, "Only gifts waiting for confirmation can be rejected.");
  const gift = await prisma.$transaction(async (tx) => {
    const after = await tx.gift.update({ where: { id: before.id }, data: { status: "REJECTED" }, include });
    await audit(tx, { eventId: member.eventId, entity: "gift", entityId: before.id, action: "reject", actorId: member.id, before: { status: before.status }, after: { status: "REJECTED" } });
    return after;
  });
  res.json({ gift: giftView(gift) });
});

// The full history of one gift, so disputes can be settled.
giftsRouter.get("/gifts/:giftId/history", ownersOnly, async (req, res) => {
  const member = currentMember(req);
  const gift = await findGift(member, req.params.giftId);
  const logs = await prisma.auditLog.findMany({
    where: { eventId: member.eventId, entity: "gift", entityId: gift.id },
    orderBy: { createdAt: "asc" },
    include: { actor: { select: { displayName: true } } },
  });
  res.json({
    gift: giftView(gift),
    history: logs.map((l) => ({ action: l.action, at: l.createdAt, by: l.actor?.displayName ?? null, before: l.before, after: l.after })),
  });
});
