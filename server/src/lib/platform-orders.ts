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

export const orderView = (o: PlanOrder) => ({
  id: o.id,
  purpose: o.purpose,
  plan: o.plan,
  units: o.units,
  amount: o.amount,
  currency: o.currency,
  reference: o.reference,
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
    const created = await tx.planOrder.create({ data: { ...data, currency: "USD", reference } });
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

/** The money arrived: record the payment and apply what was bought. */
export async function confirmOrder(order: PlanOrder, admin: { id: string; name: string }) {
  return prisma.$transaction(async (tx) => {
    // Claim the order first, so two admins confirming at once record one payment.
    const claimed = await tx.planOrder.updateMany({ where: { id: order.id, status: "PENDING" }, data: { status: "PAID", paidAt: new Date(), confirmedById: admin.id } });
    if (!claimed.count) throw new HttpError(409, "This order has changed. Reload and try again.");
    const paymentId = await paymentProvider.recordPlanPayment(tx, order, admin.id);
    await apply(tx, order, admin);
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
