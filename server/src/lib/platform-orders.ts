// Orders for things paid to the platform: an event's plan, a vendor's featured placement, a
// planner organization's subscription. The payer sends the amount to the platform's KHQR with
// the order's reference; a platform admin confirms it, which records the payment and applies
// the order.
import type { PlanOrder, PlanOrderPurpose, Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { HttpError } from "../errors.js";
import { paymentProvider } from "../providers/payment.js";
import { audit } from "./audit.js";
import { PLAN_ORDER, addMonths } from "./plans.js";
import { newReference } from "./tickets.js";
import { config } from "../config.js";
import { type BakongPayment, bakong } from "../providers/bakong.js";
import { buildKhqr, khqrMd5 } from "./khqr.js";

export const orderView = (o: PlanOrder) => ({
  id: o.id,
  purpose: o.purpose,
  plan: o.plan,
  units: o.units,
  amount: o.amount,
  currency: o.currency,
  reference: o.reference,
  // With Bakong the order has its own QR (amount included) and is confirmed automatically.
  khqr: o.khqr !== null,
  status: o.status,
  paidAt: o.paidAt,
  createdAt: o.createdAt,
});

type Target = { eventId: string } | { vendorId: string } | { organizationId: string };

/** Places an order. Only one waits per event, vendor or organization: a new one replaces it. */
export async function placeOrder(
  data: Target & { purpose: PlanOrderPurpose; amount: number; userId: string; plan?: PlanOrder["plan"]; units?: number; requestedById?: string },
) {
  return prisma.$transaction(async (tx) => {
    const target = "eventId" in data ? { eventId: data.eventId } : "vendorId" in data ? { vendorId: data.vendorId } : { organizationId: data.organizationId };
    await tx.planOrder.updateMany({ where: { ...target, status: "PENDING" }, data: { status: "CANCELLED", cancelledAt: new Date() } });
    let reference = newReference();
    while (await tx.planOrder.findUnique({ where: { reference } })) reference = newReference();
    const khqr = platformKhqr(data.amount, reference);
    const created = await tx.planOrder.create({ data: { ...data, currency: "USD", reference, khqr, khqrMd5: khqr ? khqrMd5(khqr) : null } });
    if ("eventId" in data) {
      await audit(tx, { eventId: data.eventId, entity: "event", entityId: data.eventId, action: "plan_order", actorId: data.requestedById ?? null, after: orderView(created) });
    }
    return created;
  });
}

/** The payer's own pending order, cancelled. */
export async function cancelOrder(order: PlanOrder | null, actorId?: string) {
  if (!order) throw new HttpError(404, "Order not found.");
  if (order.status !== "PENDING") throw new HttpError(409, "Only orders waiting for payment can be cancelled.");
  await prisma.$transaction(async (tx) => {
    await tx.planOrder.update({ where: { id: order.id }, data: { status: "CANCELLED", cancelledAt: new Date() } });
    if (order.eventId) {
      await audit(tx, { eventId: order.eventId, entity: "event", entityId: order.eventId, action: "plan_order_cancel", actorId: actorId ?? null, before: orderView(order) });
    }
  });
}

/** The order's own KHQR, when Bakong is set up. */
function platformKhqr(amount: number, reference: string) {
  const accountId = config.bakongAccountId();
  if (!bakong() || !accountId) return null;
  return buildKhqr({ accountId, merchantName: config.bakongMerchantName(), amount, currency: "USD", billNumber: reference });
}

/**
 * The money arrived: record the payment and apply what was bought. An admin confirms by hand
 * (`admin`), or Bakong found the payment (`bakongPayment`, no admin).
 */
export async function confirmOrder(order: PlanOrder, admin: { id: string; name: string } | null, bakongPayment?: BakongPayment) {
  return prisma.$transaction(async (tx) => {
    // Claim the order first, so two confirmations at once record one payment.
    const claimed = await tx.planOrder.updateMany({ where: { id: order.id, status: "PENDING" }, data: { status: "PAID", paidAt: new Date(), confirmedById: admin?.id ?? null } });
    if (!claimed.count) throw new HttpError(409, "This order has changed. Reload and try again.");
    const paymentId = bakongPayment
      ? (
          await tx.payment.create({
            data: {
              eventId: order.eventId,
              provider: "bakong",
              reference: bakongPayment.hash,
              amount: bakongPayment.amount,
              currency: bakongPayment.currency,
              status: "PAID",
              providerPayload: { order: order.reference, fromAccountId: bakongPayment.fromAccountId },
            },
          })
        ).id
      : await paymentProvider.recordPlanPayment(tx, order, admin!.id);
    await apply(tx, order, admin ?? { id: "bakong", name: "Bakong" });
    return tx.planOrder.update({ where: { id: order.id }, data: { paymentId } });
  });
}

async function apply(tx: Prisma.TransactionClient, order: PlanOrder, admin: { id: string; name: string }) {
  const now = new Date();
  if (order.purpose === "EVENT_PLAN" && order.eventId && order.plan) {
    const before = await tx.event.findUniqueOrThrow({ where: { id: order.eventId }, select: { plan: true } });
    // Never move an event down: an older, cheaper order confirmed late changes nothing.
    const plan = PLAN_ORDER.indexOf(order.plan) > PLAN_ORDER.indexOf(before.plan) ? order.plan : before.plan;
    await tx.event.update({ where: { id: order.eventId }, data: { plan } });
    await audit(tx, {
      eventId: order.eventId,
      entity: "event",
      entityId: order.eventId,
      action: "plan_upgrade",
      actorId: null,
      before: { plan: before.plan },
      after: { plan, reference: order.reference, amount: order.amount, currency: order.currency, confirmedBy: admin },
    });
  } else if (order.purpose === "VENDOR_FEATURED" && order.vendorId && order.units) {
    // Days add on to a placement that is still running.
    const vendor = await tx.vendor.findUniqueOrThrow({ where: { id: order.vendorId } });
    const from = vendor.featuredUntil && vendor.featuredUntil > now ? vendor.featuredUntil : now;
    await tx.vendor.update({ where: { id: vendor.id }, data: { featuredUntil: new Date(from.getTime() + order.units * 86_400_000) } });
  } else if (order.purpose === "PLANNER_SUBSCRIPTION" && order.organizationId && order.units) {
    const org = await tx.organization.findUniqueOrThrow({ where: { id: order.organizationId } });
    const from = org.paidUntil && org.paidUntil > now ? org.paidUntil : now;
    await tx.organization.update({ where: { id: org.id }, data: { paidUntil: addMonths(from, order.units) } });
  }
}

/** For the admin's list: what the order is for and who asked. */
export async function describeOrders(orders: PlanOrder[]) {
  const [events, vendors, orgs, users] = await Promise.all([
    prisma.event.findMany({ where: { id: { in: orders.flatMap((o) => (o.eventId ? [o.eventId] : [])) } }, select: { id: true, titleKm: true, titleEn: true, plan: true } }),
    prisma.vendor.findMany({ where: { id: { in: orders.flatMap((o) => (o.vendorId ? [o.vendorId] : [])) } }, select: { id: true, name: true, slug: true } }),
    prisma.organization.findMany({ where: { id: { in: orders.flatMap((o) => (o.organizationId ? [o.organizationId] : [])) } }, select: { id: true, name: true } }),
    prisma.user.findMany({ where: { id: { in: orders.flatMap((o) => (o.userId ? [o.userId] : [])) } }, select: { id: true, name: true, phone: true } }),
  ]);
  return orders.map((o) => {
    const event = events.find((e) => e.id === o.eventId);
    const vendor = vendors.find((v) => v.id === o.vendorId);
    const org = orgs.find((g) => g.id === o.organizationId);
    const user = users.find((u) => u.id === o.userId);
    return {
      ...orderView(o),
      target: event
        ? { titleKm: event.titleKm, titleEn: event.titleEn, link: `/events/${event.id}` }
        : vendor
          ? { titleKm: vendor.name, titleEn: vendor.name, link: `/vendors/${vendor.slug}` }
          : { titleKm: org?.name ?? "", titleEn: org?.name ?? "", link: null },
      payer: user ? { name: user.name, phone: user.phone } : null,
    };
  });
}

/**
 * Asks Bakong whether this order's QR was paid, and confirms it if the full amount arrived.
 * Returns whether the order is paid now.
 */
export async function checkBakongPayment(order: PlanOrder) {
  const client = bakong();
  if (order.status === "PAID") return true;
  if (order.status !== "PENDING" || !order.khqrMd5 || !client) return false;
  const payment = await client.checkByMd5(order.khqrMd5);
  if (!payment || payment.currency !== order.currency || payment.amount < order.amount) return false;
  try {
    await confirmOrder(order, null, payment);
  } catch (e) {
    // Someone (or the other check) confirmed it first.
    if (!(e instanceof HttpError && e.status === 409)) throw e;
  }
  return true;
}

/** Checks every waiting order with a QR from the last day. */
export async function checkPendingBakongOrders() {
  const orders = await prisma.planOrder.findMany({ where: { status: "PENDING", khqrMd5: { not: null }, createdAt: { gte: new Date(Date.now() - 86_400_000) } } });
  for (const order of orders) await checkBakongPayment(order).catch((e) => console.error("bakong check failed", order.reference, (e as Error).message));
}

/** In the API process, with Bakong set up: look for payments every 30 seconds. */
export function startBakongChecks() {
  if (!bakong() || config.test) return;
  setInterval(() => void checkPendingBakongOrders(), 30_000).unref();
  console.log("Checking Bakong for platform payments");
}
