// An event's plan: what it includes, and upgrading by paying the platform's KHQR. A platform
// admin confirms the payment (routes/admin.ts), which applies the plan.
import { Router } from "express";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { currentUser } from "../auth.js";
import { currentMember, isUuid, ownersOnly } from "../access.js";
import { config } from "../config.js";
import { prisma } from "../db.js";
import { HttpError, parse } from "../errors.js";
import { PLANS, PLAN_ORDER, effectivePlan, featuresOf, upgradePrice } from "../lib/plans.js";
import { cancelOrder, orderView, placeOrder } from "../lib/platform-orders.js";

/** Mounted on /api/events/:eventId (after eventAccess). */
export const eventPlanRouter = Router({ mergeParams: true });
eventPlanRouter.use("/plan", ownersOnly);
/** Mounted on /api/platform. */
export const platformRouter = Router();

const upgradeSchema = z.object({ plan: z.enum(["STANDARD", "PREMIUM"], { message: "Choose a plan." }) });

export const planOrderView = orderView;

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
  const order = await placeOrder({ purpose: "EVENT_PLAN", eventId: event.id, plan, amount, userId: currentUser(req).id, requestedById: member.id });
  res.status(201).json({ order: planOrderView(order) });
});

eventPlanRouter.post("/plan/orders/:orderId/cancel", async (req, res) => {
  const member = currentMember(req);
  const id = req.params.orderId;
  const order = isUuid(id) ? await prisma.planOrder.findFirst({ where: { id, eventId: member.eventId } }) : null;
  await cancelOrder(order, member.id);
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
