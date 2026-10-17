// Checks of an event's plan in the API. Refusals answer 402 so the web app can offer an upgrade.
import type { NextFunction, Request, Response } from "express";
import type { Prisma } from "@prisma/client";
import { currentMember } from "../access.js";
import { prisma } from "../db.js";
import { HttpError } from "../errors.js";
import { FREE_TEMPLATE, type PlanFeatures, featuresOf } from "./plans.js";

export async function eventFeatures(eventId: string, db: Prisma.TransactionClient = prisma) {
  return featuresOf(await db.event.findUniqueOrThrow({ where: { id: eventId }, select: { plan: true, organizationId: true, type: true } }));
}

/** Adding guests past the plan's limit. Walk-ins at the desk are never refused. */
export async function checkGuestLimit(eventId: string, adding: number, db: Prisma.TransactionClient = prisma) {
  const { maxGuests } = await eventFeatures(eventId, db);
  const current = await db.guest.count({ where: { eventId, walkIn: false } });
  if (current + adding > maxGuests) throw new HttpError(402, `This plan allows up to ${maxGuests} guests. Upgrade to add more.`);
}

/** Templates other than the traditional one need a paid plan. */
export async function checkTemplateAllowed(templateId: string | null | undefined, features: PlanFeatures) {
  if (!templateId || features.allTemplates) return;
  const template = await prisma.template.findUnique({ where: { id: templateId }, select: { slug: true } });
  if (template?.slug !== FREE_TEMPLATE) throw new HttpError(402, "This template needs a paid plan.", { templateId: ["This template needs a paid plan."] });
}

/** For routes that only some plans include (after eventAccess). */
export function requireFeature(feature: "seating" | "thankYouSms", message: string) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const features = await eventFeatures(currentMember(req).eventId);
    if (!features[feature]) throw new HttpError(402, message);
    next();
  };
}
