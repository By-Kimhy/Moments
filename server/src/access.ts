// Every event route lives under /api/events/:eventId and passes through eventAccess, which
// finds the caller's membership in that one event. Handlers must then filter every query by
// member.eventId, never by a bare record id.
import type { NextFunction, Request, Response } from "express";
import type { MemberRole } from "@prisma/client";
import { prisma } from "./db.js";
import { HttpError } from "./errors.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (value: unknown): value is string => typeof value === "string" && UUID.test(value);

export async function eventAccess(req: Request, _res: Response, next: NextFunction) {
  if (!req.user && !req.helper) throw new HttpError(401, "Sign in first.");
  const eventId = req.params.eventId;
  // Someone without access gets the same 404 as for an event that doesn't exist.
  if (!isUuid(eventId)) throw new HttpError(404, "Event not found.");

  const member = req.user ? await hostMembership(eventId, req.user) : null;
  if (member) {
    req.member = { id: member.id, eventId, role: member.role, displayName: member.displayName };
  } else if (req.helper?.eventId === eventId) {
    req.member = { id: req.helper.memberId, eventId, role: "HELPER", displayName: req.helper.displayName };
  } else {
    throw new HttpError(404, "Event not found.");
  }
  next();
}

/** Is the user active staff of the planner organization that runs this event? */
async function plannerFor(eventId: string, userId: string) {
  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { organizationId: true } });
  if (!event?.organizationId) return false;
  const staff = await prisma.organizationMember.findFirst({ where: { organizationId: event.organizationId, userId, revokedAt: null } });
  return Boolean(staff);
}

/**
 * The user's host membership of an event: their own (owner or co-host), or one that comes from
 * working for the planner organization running it. Planner access is checked every time, so it
 * ends when they leave the organization; the membership row exists so their actions are logged
 * under their name like any host's.
 */
export async function hostMembership(eventId: string, user: { id: string; name: string }) {
  const existing = await prisma.eventMember.findFirst({ where: { eventId, userId: user.id } });
  if (existing && !existing.revokedAt && !existing.viaOrganization) return existing;
  if (!(await plannerFor(eventId, user.id))) return null;
  if (existing?.viaOrganization && !existing.revokedAt) return existing;
  return prisma.eventMember.upsert({
    where: { eventId_userId: { eventId, userId: user.id } },
    create: { eventId, userId: user.id, role: "OWNER", displayName: user.name, viaOrganization: true },
    update: { role: "OWNER", revokedAt: null, viaOrganization: true },
  });
}

/** Allows only these roles past this point (after eventAccess). */
export function allow(...roles: MemberRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.member || !roles.includes(req.member.role)) throw new HttpError(403, "Only the hosts can do this.");
    next();
  };
}

export const ownersOnly = allow("OWNER");

/** For use after eventAccess: the caller's membership in this event. */
export function currentMember(req: Request) {
  if (!req.member) throw new HttpError(401, "Sign in first.");
  return req.member;
}
