// Planner organizations: a wedding planner or venue, its staff, and all the events it runs.
// Owners manage the organization and its staff; staff get host access to every event of it.
import type { OrgRole } from "@prisma/client";
import { type Request, Router } from "express";
import { z } from "zod";
import { currentUser, requireUser } from "../auth.js";
import { isUuid } from "../access.js";
import { prisma } from "../db.js";
import { HttpError, parse } from "../errors.js";
import { audit } from "../lib/audit.js";
import { hostView, uniqueHelperCode } from "../lib/events.js";
import { giftTotals } from "../lib/gifts.js";
import { imageKey, processPhoto } from "../lib/images.js";
import { organizationView } from "../lib/organizations.js";
import { normalizePhone } from "../lib/phone.js";
import { storage } from "../providers/storage.js";
import { imageUpload } from "../uploads.js";
import { createEventSchema, slugTaken } from "./events.js";

export const organizationsRouter = Router();
organizationsRouter.use(requireUser);

const phoneField = z.string().transform((v, ctx) => {
  const phone = normalizePhone(v);
  if (!phone) ctx.addIssue({ code: "custom", message: "Enter a valid phone number." });
  return phone ?? "";
});
const orgSchema = z.object({
  name: z.string().trim().min(1, "Enter the organization's name.").max(120),
  brandColor: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Use a colour like #9b2c2c.")
    .optional(),
});
const memberSchema = z.object({ phone: phoneField, name: z.string().trim().min(1, "Enter their name.").max(120), role: z.enum(["OWNER", "STAFF"]).default("STAFF") });
const clientEventSchema = createEventSchema.extend({
  // The couple (or their parent), added as a co-host who signs in with this number.
  clientName: z.string().trim().max(120).optional(),
  clientPhone: z
    .string()
    .optional()
    .transform((v, ctx) => {
      if (!v?.trim()) return null;
      const phone = normalizePhone(v);
      if (!phone) ctx.addIssue({ code: "custom", message: "Enter a valid phone number." });
      return phone;
    }),
});

/** The caller's active membership of an organization, with at least the given role. */
async function membership(req: Request, roles: OrgRole[] = ["OWNER", "STAFF"]) {
  const orgId = req.params.orgId;
  const member = isUuid(orgId)
    ? await prisma.organizationMember.findFirst({ where: { organizationId: orgId, userId: currentUser(req).id, revokedAt: null }, include: { organization: true } })
    : null;
  if (!member) throw new HttpError(404, "Organization not found.");
  if (!roles.includes(member.role)) throw new HttpError(403, "Only the organization's owners can do this.");
  return member;
}

organizationsRouter.get("/", async (req, res) => {
  const memberships = await prisma.organizationMember.findMany({
    where: { userId: currentUser(req).id, revokedAt: null },
    include: { organization: { include: { _count: { select: { events: true } } } } },
    orderBy: { createdAt: "asc" },
  });
  res.json({ organizations: memberships.map((m) => ({ ...organizationView(m.organization), role: m.role, eventCount: m.organization._count.events })) });
});

organizationsRouter.post("/", async (req, res) => {
  const data = parse(orgSchema, req.body);
  const organization = await prisma.organization.create({
    data: { ...data, members: { create: { userId: currentUser(req).id, role: "OWNER" } } },
  });
  res.status(201).json({ organization: organizationView(organization) });
});

organizationsRouter.get("/:orgId", async (req, res) => {
  const member = await membership(req);
  const members = await prisma.organizationMember.findMany({
    where: { organizationId: member.organizationId, revokedAt: null },
    include: { user: { select: { name: true, phone: true } } },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
  });
  res.json({
    organization: organizationView(member.organization),
    role: member.role,
    members: members.map((m) => ({ id: m.id, role: m.role, name: m.user.name, phone: m.user.phone, isMe: m.userId === member.userId })),
  });
});

organizationsRouter.patch("/:orgId", async (req, res) => {
  const member = await membership(req, ["OWNER"]);
  const data = parse(orgSchema.partial(), req.body);
  const organization = await prisma.organization.update({ where: { id: member.organizationId }, data });
  res.json({ organization: organizationView(organization) });
});

organizationsRouter.put("/:orgId/logo", imageUpload.single("image"), async (req, res) => {
  const member = await membership(req, ["OWNER"]);
  if (!req.file) throw new HttpError(400, "Choose an image.", { image: ["Choose an image."] });
  const image = await processPhoto(req.file.buffer);
  const key = imageKey(member.organizationId, "photo", image.ext);
  await storage.put(key, image.body, image.contentType);
  const before = member.organization.logoKey;
  const organization = await prisma.organization.update({ where: { id: member.organizationId }, data: { logoKey: key } });
  if (before) await storage.delete(before);
  res.json({ organization: organizationView(organization) });
});

// Adds staff (or another owner) by phone number; an account is created if needed.
organizationsRouter.post("/:orgId/members", async (req, res) => {
  const member = await membership(req, ["OWNER"]);
  const { phone, name, role } = parse(memberSchema, req.body);
  const user = (await prisma.user.findUnique({ where: { phone } })) ?? (await prisma.user.create({ data: { phone, name } }));
  const existing = await prisma.organizationMember.findUnique({ where: { organizationId_userId: { organizationId: member.organizationId, userId: user.id } } });
  if (existing && !existing.revokedAt) throw new HttpError(409, "This person is already in the organization.", { phone: ["This person is already in the organization."] });
  const added = existing
    ? await prisma.organizationMember.update({ where: { id: existing.id }, data: { revokedAt: null, role } })
    : await prisma.organizationMember.create({ data: { organizationId: member.organizationId, userId: user.id, role } });
  res.status(201).json({ member: { id: added.id, role: added.role, name: user.name, phone } });
});

// Removing staff also ends the host access they had through the organization.
organizationsRouter.delete("/:orgId/members/:memberId", async (req, res) => {
  const member = await membership(req, ["OWNER"]);
  const target = isUuid(req.params.memberId)
    ? await prisma.organizationMember.findFirst({ where: { id: req.params.memberId, organizationId: member.organizationId, revokedAt: null } })
    : null;
  if (!target) throw new HttpError(404, "Member not found.");
  if (target.role === "OWNER") {
    const owners = await prisma.organizationMember.count({ where: { organizationId: member.organizationId, role: "OWNER", revokedAt: null } });
    if (owners <= 1) throw new HttpError(409, "An organization needs at least one owner.");
  }
  await prisma.$transaction([
    prisma.organizationMember.update({ where: { id: target.id }, data: { revokedAt: new Date() } }),
    prisma.eventMember.updateMany({ where: { userId: target.userId, viaOrganization: true, event: { organizationId: member.organizationId } }, data: { revokedAt: new Date() } }),
  ]);
  res.status(204).end();
});

/** The planner's dashboard: every event with its numbers, upcoming first. */
organizationsRouter.get("/:orgId/events", async (req, res) => {
  const member = await membership(req);
  const events = await prisma.event.findMany({ where: { organizationId: member.organizationId }, orderBy: { startsAt: "asc" } });
  const ids = events.map((e) => e.id);
  const [guests, checkins, gifts] = await Promise.all([
    prisma.guest.findMany({ where: { eventId: { in: ids } }, select: { eventId: true, walkIn: true, rsvpStatus: true, rsvpCount: true, invitedCount: true } }),
    prisma.checkin.groupBy({ by: ["eventId"], where: { eventId: { in: ids } }, _sum: { peopleCount: true } }),
    prisma.gift.findMany({
      where: { eventId: { in: ids } },
      select: { eventId: true, amount: true, currency: true, method: true, status: true, voidedAt: true, guest: { select: { side: true, group: true } } },
    }),
  ]);
  const now = Date.now();
  const rows = events.map((e) => {
    const own = guests.filter((g) => g.eventId === e.id && !g.walkIn);
    const replied = own.filter((g) => g.rsvpStatus !== "PENDING").length;
    const totals = giftTotals(gifts.filter((g) => g.eventId === e.id));
    return {
      ...hostView(e),
      guests: own.length,
      replyRate: own.length ? Math.round((replied / own.length) * 100) : 0,
      attendingPeople: own.reduce((s, g) => s + (g.rsvpStatus === "ATTENDING" ? (g.rsvpCount ?? g.invitedCount) : 0), 0),
      arrivedPeople: checkins.find((c) => c.eventId === e.id)?._sum.peopleCount ?? 0,
      giftTotal: totals.total,
      pendingGifts: totals.pendingCount,
      upcoming: e.startsAt.getTime() >= now - 24 * 3600_000,
    };
  });
  res.json({
    organization: organizationView(member.organization),
    upcoming: rows.filter((r) => r.upcoming),
    past: rows.filter((r) => !r.upcoming).reverse(),
  });
});

// A new event for a client: the organization runs it, the client is a co-host.
organizationsRouter.post("/:orgId/events", async (req, res) => {
  const member = await membership(req);
  const { clientName, clientPhone, ...data } = parse(clientEventSchema, req.body);
  const user = currentUser(req);
  const event = await prisma.$transaction(async (tx) => {
    const created = await tx.event.create({
      data: {
        ...data,
        ownerId: user.id,
        organizationId: member.organizationId,
        helperCode: await uniqueHelperCode(tx),
        members: { create: { userId: user.id, role: "OWNER", displayName: user.name, viaOrganization: true } },
      },
      include: { members: true },
    });
    await audit(tx, { eventId: created.id, entity: "event", entityId: created.id, action: "create", actorId: created.members[0].id, after: { ...hostView(created), organizationId: member.organizationId } });
    if (clientPhone) {
      const client = (await tx.user.findUnique({ where: { phone: clientPhone } })) ?? (await tx.user.create({ data: { phone: clientPhone, name: clientName || clientPhone } }));
      if (client.id !== user.id) {
        await tx.eventMember.create({ data: { eventId: created.id, userId: client.id, role: "OWNER", displayName: clientName || client.name } });
      }
    }
    return created;
  }).catch(slugTaken);
  res.status(201).json({ event: hostView(event) });
});

// Moves one of the caller's own events into the organization.
organizationsRouter.post("/:orgId/events/:eventId/attach", async (req, res) => {
  const member = await membership(req);
  const eventId = req.params.eventId;
  const own = isUuid(eventId)
    ? await prisma.eventMember.findFirst({ where: { eventId, userId: member.userId, role: "OWNER", revokedAt: null, viaOrganization: false } })
    : null;
  if (!own) throw new HttpError(404, "Event not found.");
  await prisma.$transaction(async (tx) => {
    await tx.event.update({ where: { id: eventId }, data: { organizationId: member.organizationId } });
    await audit(tx, { eventId, entity: "event", entityId: eventId, action: "attach_organization", actorId: own.id, after: { organizationId: member.organizationId } });
  });
  res.status(204).end();
});
