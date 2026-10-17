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

  const member = req.user
    ? await prisma.eventMember.findFirst({ where: { eventId, userId: req.user.id, revokedAt: null } })
    : null;
  if (member) {
    req.member = { id: member.id, eventId, role: member.role, displayName: member.displayName };
  } else if (req.helper?.eventId === eventId) {
    req.member = { id: req.helper.memberId, eventId, role: "HELPER", displayName: req.helper.displayName };
  } else {
    throw new HttpError(404, "Event not found.");
  }
  next();
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
