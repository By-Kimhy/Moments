// An event's plan: what it includes, and upgrading by paying the platform's KHQR. A platform
// admin confirms the payment (routes/admin.ts), which applies the plan.
import type { PlanOrder } from "@prisma/client";
import { Router } from "express";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { currentMember, isUuid, ownersOnly } from "../access.js";
import { config } from "../config.js";
import { prisma } from "../db.js";
import { HttpError, parse } from "../errors.js";
import { audit } from "../lib/audit.js";
import { PLANS, PLAN_ORDER, effectivePlan, featuresOf, upgradePrice } from "../lib/plans.js";
import { newReference } from "../lib/tickets.js";

/** Mounted on /api/events/:eventId (after eventAccess). */
export const eventPlanRouter = Router({ mergeParams: true });
eventPlanRouter.use("/plan", ownersOnly);
/** Mounted on /api/platform. */
export const platformRouter = Router();

const upgradeSchema = z.object({ plan: z.enum(["STANDARD", "PREMIUM"], { message: "Choose a plan." }) });

export const planOrderView = (o: PlanOrder) => ({
  id: o.id,
  plan: o.plan,
  amount: o.amount,
  currency: o.currency,
  reference: o.reference,
  status: o.status,
  paidAt: o.paidAt,
  createdAt: o.createdAt,
});

eventPlanRouter.get("/plan", async (req, res) => {
  const member = currentMember(req);
  const event = await prisma.event.findUniqueOrThrow({ where: { id: member.eventId } });
  const [orders, guests] = await Promise.all([
    prisma.planOrder.findMany({ where: { eventId: event.id }, orderBy: { createdAt: "desc" } }),
    prisma.guest.count({ where: { eventId: event.id, walkIn: false } }),
  ]);
  res.json({
    plan: event.plan,
    effectivePlan: effectivePlan(event),
    features: featuresOf(event),
    guests,
    plans: PLAN_ORDER.map((p) => ({ plan: p, ...PLANS[p], upgradePrice: upgradePrice(event.plan, p) })),
    pending: orders.filter((o) => o.status === "PENDING").map(planOrderView)[0] ?? null,
    orders: orders.map(planOrderView),
    platformKhqr: Boolean(config.platformKhqrImage()),
  });
});

// Asks for an upgrade. Only one request waits at a time: a new one replaces it.
eventPlanRouter.post("/plan/orders", async (req, res) => {
  const member = currentMember(req);
  const { plan } = parse(upgradeSchema, req.body);
  const event = await prisma.event.findUniqueOrThrow({ where: { id: member.eventId } });
  if (effectivePlan(event) === "PLANNER" || event.type === "TICKETED") throw new HttpError(409, "This event already has every feature.");
  const amount = upgradePrice(event.plan, plan);
  if (amount === null) throw new HttpError(409, "The event is already on this plan or a higher one.");
  const order = await prisma.$transaction(async (tx) => {
    await tx.planOrder.updateMany({ where: { eventId: event.id, status: "PENDING" }, data: { status: "CANCELLED", cancelledAt: new Date() } });
    let reference = newReference();
    while (await tx.planOrder.findUnique({ where: { reference } })) reference = newReference();
    const created = await tx.planOrder.create({ data: { eventId: event.id, plan, amount, currency: "USD", reference, requestedById: member.id } });
    await audit(tx, { eventId: event.id, entity: "event", entityId: event.id, action: "plan_order", actorId: member.id, after: planOrderView(created) });
    return created;
  });
  res.status(201).json({ order: planOrderView(order) });
});

eventPlanRouter.post("/plan/orders/:orderId/cancel", async (req, res) => {
  const member = currentMember(req);
  const id = req.params.orderId;
  const order = isUuid(id) ? await prisma.planOrder.findFirst({ where: { id, eventId: member.eventId } }) : null;
  if (!order) throw new HttpError(404, "Order not found.");
  if (order.status !== "PENDING") throw new HttpError(409, "Only orders waiting for payment can be cancelled.");
  await prisma.$transaction(async (tx) => {
    await tx.planOrder.update({ where: { id: order.id }, data: { status: "CANCELLED", cancelledAt: new Date() } });
    await audit(tx, { eventId: order.eventId, entity: "event", entityId: order.eventId, action: "plan_order_cancel", actorId: member.id, before: planOrderView(order) });
  });
  res.status(204).end();
});

// The platform's KHQR, for hosts paying for a plan.
platformRouter.get("/khqr", async (_req, res) => {
  const file = config.platformKhqrImage();
  if (!file) throw new HttpError(404, "Not found.");
  const body = await readFile(file).catch(() => null);
  if (!body) throw new HttpError(404, "Not found.");
  res.set("Cache-Control", "public, max-age=3600");
  res.type(file.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg").send(body);
});
