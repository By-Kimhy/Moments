import { Router } from "express";
import { z } from "zod";
import { currentUser, requireUser } from "../auth.js";
import { currentMember, isUuid, ownersOnly } from "../access.js";
import { prisma } from "../db.js";
import { HttpError, parse } from "../errors.js";
import { audit } from "../lib/audit.js";
import { deskView, hostView, uniqueHelperCode } from "../lib/events.js";
import { publicEventView } from "../lib/invitations.js";
import { normalizePhone } from "../lib/phone.js";
import { checkTemplateAllowed } from "../lib/plan-limits.js";
import { featuresOf } from "../lib/plans.js";

/** /api/events: the signed-in host's events. */
export const eventsRouter = Router();
/** /api/events/:eventId: one event, for its members (mounted behind eventAccess in app.ts). */
export const eventRouter = Router({ mergeParams: true });

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => v || null);

const scheduleItem = z.object({
  time: z.string().trim().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a time like 07:30."),
  titleKm: z.string().trim().min(1, "Describe this part of the day.").max(120),
  titleEn: optionalText(120),
});

const eventFields = {
  titleKm: z.string().trim().min(1, "Enter a title in Khmer.").max(200),
  titleEn: optionalText(200),
  brideNameKm: optionalText(120),
  brideNameEn: optionalText(120),
  groomNameKm: optionalText(120),
  groomNameEn: optionalText(120),
  startsAt: z.coerce.date({ message: "Choose the date and time." }),
  venueKm: optionalText(300),
  venueEn: optionalText(300),
  mapUrl: z
    .string()
    .trim()
    .max(500)
    .nullish()
    .transform((v) => v || null)
    .refine((v) => v === null || /^https:\/\//.test(v), "Paste a link that starts with https://"),
  schedule: z.array(scheduleItem).max(20).default([]),
  khqrAccountName: optionalText(120),
  // Ticketed events: the public page /e/<slug> and a description.
  type: z.enum(["WEDDING", "TICKETED"]).optional(),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .nullish()
    .transform((v) => v || null)
    .refine((v) => v === null || /^[a-z0-9](?:[a-z0-9-]{1,58}[a-z0-9])$/.test(v), "Use 3–60 letters, numbers and dashes, like khmer-music-night."),
  descriptionKm: optionalText(4000),
  descriptionEn: optionalText(4000),
  templateId: z
    .string()
    .nullish()
    .transform((v) => v || null)
    .refine((v) => v === null || isUuid(v), "Choose a template."),
};

export const createEventSchema = z.object(eventFields);
const updateEventSchema = z
  .object({ ...eventFields, status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]) })
  .partial();

const cohostSchema = z.object({
  phone: z.string().transform((v, ctx) => {
    const phone = normalizePhone(v);
    if (!phone) ctx.addIssue({ code: "custom", message: "Enter a valid phone number." });
    return phone ?? "";
  }),
  name: z.string().trim().min(1, "Enter their name.").max(120),
});

/** A public link name another event already uses. */
export function slugTaken(e: unknown): never {
  if ((e as { code?: string; meta?: { target?: string[] } }).code === "P2002") {
    throw new HttpError(409, "This link is already taken. Choose another.", { slug: ["This link is already taken. Choose another."] });
  }
  throw e;
}

async function checkTemplate(templateId: string | null | undefined) {
  if (!templateId) return;
  const template = await prisma.template.findFirst({ where: { id: templateId, isActive: true }, select: { id: true } });
  if (!template) throw new HttpError(400, "Choose a template.", { templateId: ["Choose a template."] });
}

eventsRouter.get("/", requireUser, async (req, res) => {
  const userId = currentUser(req).id;
  const events = await prisma.event.findMany({
    where: {
      OR: [
        { members: { some: { userId, role: "OWNER", revokedAt: null, viaOrganization: false } } },
        { organization: { members: { some: { userId, revokedAt: null } } } },
      ],
    },
    orderBy: { startsAt: "desc" },
    include: { _count: { select: { guests: true } } },
  });
  res.json({ events: events.map((e) => ({ ...hostView(e), guestCount: e._count.guests })) });
});

eventsRouter.post("/", requireUser, async (req, res) => {
  const user = currentUser(req);
  const data = parse(createEventSchema, req.body);
  await checkTemplate(data.templateId);
  // New events start on the free plan.
  await checkTemplateAllowed(data.templateId, featuresOf({ plan: "FREE", organizationId: null, type: data.type ?? "WEDDING" }));
  const event = await prisma.$transaction(async (tx) => {
    const created = await tx.event.create({
      data: {
        ...data,
        ownerId: user.id,
        helperCode: await uniqueHelperCode(tx),
        members: { create: { userId: user.id, role: "OWNER", displayName: user.name } },
      },
      include: { members: true },
    });
    await audit(tx, { eventId: created.id, entity: "event", entityId: created.id, action: "create", actorId: created.members[0].id, after: hostView(created) });
    return created;
  }).catch(slugTaken);
  res.status(201).json({ event: hostView(event) });
});

eventRouter.get("/", async (req, res) => {
  const member = currentMember(req);
  const event = await prisma.event.findUniqueOrThrow({ where: { id: member.eventId } });
  res.json({ event: member.role === "OWNER" ? hostView(event) : deskView(event), role: member.role });
});

eventRouter.patch("/", ownersOnly, async (req, res) => {
  const member = currentMember(req);
  const data = parse(updateEventSchema, req.body);
  await checkTemplate(data.templateId);
  if (data.templateId) {
    const current = await prisma.event.findUniqueOrThrow({ where: { id: member.eventId } });
    await checkTemplateAllowed(data.templateId, featuresOf({ ...current, type: data.type ?? current.type }));
  }
  const event = await prisma.$transaction(async (tx) => {
    const before = await tx.event.findUniqueOrThrow({ where: { id: member.eventId } });
    const after = await tx.event.update({ where: { id: member.eventId }, data });
    await audit(tx, { eventId: member.eventId, entity: "event", entityId: member.eventId, action: "update", actorId: member.id, before: hostView(before), after: hostView(after) });
    return after;
  }).catch(slugTaken);
  res.json({ event: hostView(event) });
});

// What guests will see, before any guest exists or the event is published.
eventRouter.get("/preview", ownersOnly, async (req, res) => {
  const event = await prisma.event.findUniqueOrThrow({ where: { id: currentMember(req).eventId }, include: { template: true, organization: true } });
  res.json({
    event: publicEventView(event),
    guest: { name: "ភ្ញៀវកិត្តិយស", nameAlt: "Honoured guest", side: "BOTH", invitedCount: 2, rsvpStatus: "PENDING", rsvpCount: null, rsvpMessage: null, tableName: null },
  });
});

eventRouter.post("/helper-code", ownersOnly, async (req, res) => {
  const member = currentMember(req);
  const event = await prisma.$transaction(async (tx) => {
    const updated = await tx.event.update({ where: { id: member.eventId }, data: { helperCode: await uniqueHelperCode(tx) } });
    await audit(tx, { eventId: member.eventId, entity: "event", entityId: member.eventId, action: "rotate_helper_code", actorId: member.id });
    return updated;
  });
  res.json({ helperCode: event.helperCode });
});

eventRouter.get("/members", ownersOnly, async (req, res) => {
  const members = await prisma.eventMember.findMany({
    where: { eventId: currentMember(req).eventId },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    include: { user: { select: { phone: true } }, event: { select: { ownerId: true } } },
  });
  res.json({
    members: members.map((m) => ({
      id: m.id,
      role: m.role,
      displayName: m.displayName,
      phone: m.user?.phone ?? null,
      viaOrganization: m.viaOrganization,
      isCreator: m.userId !== null && m.userId === m.event.ownerId,
      revokedAt: m.revokedAt,
      createdAt: m.createdAt,
    })),
  });
});

// Adds another host (e.g. the other family) by phone number. If they have no account yet,
// one is created; they sign in later with a code sent to that number.
eventRouter.post("/cohosts", ownersOnly, async (req, res) => {
  const member = currentMember(req);
  const { phone, name } = parse(cohostSchema, req.body);
  const cohost = await prisma.$transaction(async (tx) => {
    const user = (await tx.user.findUnique({ where: { phone } })) ?? (await tx.user.create({ data: { phone, name } }));
    const existing = await tx.eventMember.findUnique({ where: { eventId_userId: { eventId: member.eventId, userId: user.id } } });
    if (existing && !existing.revokedAt) throw new HttpError(409, "This person is already a host.", { phone: ["This person is already a host."] });
    const saved = existing
      ? await tx.eventMember.update({ where: { id: existing.id }, data: { revokedAt: null, role: "OWNER", displayName: name } })
      : await tx.eventMember.create({ data: { eventId: member.eventId, userId: user.id, role: "OWNER", displayName: name } });
    await audit(tx, { eventId: member.eventId, entity: "member", entityId: saved.id, action: "add_cohost", actorId: member.id, after: { phone, name } });
    return saved;
  });
  res.status(201).json({ member: { id: cohost.id, role: cohost.role, displayName: cohost.displayName, phone } });
});

// Removes a co-host or helper. Their past records stay, attributed to them.
eventRouter.delete("/members/:memberId", ownersOnly, async (req, res) => {
  const member = currentMember(req);
  const target = isUuid(req.params.memberId)
    ? await prisma.eventMember.findFirst({ where: { id: req.params.memberId, eventId: member.eventId }, include: { event: { select: { ownerId: true } } } })
    : null;
  if (!target) throw new HttpError(404, "Member not found.");
  if (target.userId && target.userId === target.event.ownerId) throw new HttpError(409, "The person who created the event can't be removed.");
  if (target.viaOrganization) throw new HttpError(409, "This person has access through the planner's organization. Remove them there.");
  if (!target.revokedAt) {
    await prisma.$transaction(async (tx) => {
      await tx.eventMember.update({ where: { id: target.id }, data: { revokedAt: new Date() } });
      await audit(tx, { eventId: member.eventId, entity: "member", entityId: target.id, action: "revoke", actorId: member.id });
    });
  }
  res.status(204).end();
});
