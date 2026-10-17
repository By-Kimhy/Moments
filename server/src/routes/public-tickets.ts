// The public side of ticket sales: the event page (/e/<slug>), placing an order without an
// account, and the buyer's private order page (/o/<token>) with QR e-tickets once paid.
import { Router } from "express";
import QRCode from "qrcode";
import { z } from "zod";
import { config } from "../config.js";
import { prisma } from "../db.js";
import { HttpError, parse } from "../errors.js";
import { newInviteToken } from "../lib/codes.js";
import type { Photo } from "../lib/events.js";
import { plannerBranding } from "../lib/organizations.js";
import { orderUrl, ticketQrText } from "../lib/orders.js";
import { normalizePhone } from "../lib/phone.js";
import { HOLD_MINUTES, lockTicketTypes, newReference, onSale, platformFee, ticketCounts } from "../lib/tickets.js";
import { notify } from "../jobs/notifications.js";
import { rateLimit } from "../store.js";
import { expireOrders } from "./ticketing.js";

export const publicEventsRouter = Router();
export const ordersRouter = Router();

const orderSchema = z.object({
  buyerName: z.string().trim().min(1, "Enter your name.").max(120),
  buyerPhone: z.string().transform((v, ctx) => {
    const phone = normalizePhone(v);
    if (!phone) ctx.addIssue({ code: "custom", message: "Enter a valid phone number." });
    return phone ?? "";
  }),
  items: z
    .array(z.object({ ticketTypeId: z.string().uuid(), quantity: z.coerce.number().int().min(0).max(100) }))
    .max(20)
    .transform((items) => items.filter((i) => i.quantity > 0))
    .refine((items) => items.length > 0, "Choose at least one ticket."),
});

async function findPublicEvent(slug: string) {
  const event = /^[a-z0-9-]{3,60}$/.test(slug)
    ? await prisma.event.findUnique({ where: { slug }, include: { organization: true, ticketTypes: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] } } })
    : null;
  if (!event || event.type !== "TICKETED" || event.status !== "PUBLISHED") throw new HttpError(404, "Event not found or not on sale.");
  return event;
}

publicEventsRouter.get("/:slug", async (req, res) => {
  const event = await findPublicEvent(String(req.params.slug));
  await expireOrders(event.id);
  const counts = await ticketCounts(prisma, event.ticketTypes.map((t) => t.id));
  res.set("Cache-Control", "no-store");
  res.json({
    event: {
      slug: event.slug,
      titleKm: event.titleKm,
      titleEn: event.titleEn,
      descriptionKm: event.descriptionKm,
      descriptionEn: event.descriptionEn,
      startsAt: event.startsAt,
      venueKm: event.venueKm,
      venueEn: event.venueEn,
      mapUrl: event.mapUrl,
      photos: event.photos as Photo[],
      planner: plannerBranding(event.organization),
    },
    ticketTypes: event.ticketTypes
      .filter((t) => t.active)
      .map((t) => {
        const c = counts.get(t.id)!;
        return {
          id: t.id,
          name: t.name,
          description: t.description,
          price: t.price,
          currency: t.currency,
          maxPerOrder: t.maxPerOrder,
          available: Math.max(0, t.quantity - c.sold - c.held),
          onSale: onSale(t),
          salesStart: t.salesStart,
          salesEnd: t.salesEnd,
        };
      }),
  });
});

// Places an order and holds its tickets for 30 minutes while the buyer pays by KHQR.
publicEventsRouter.post("/:slug/orders", async (req, res) => {
  const event = await findPublicEvent(String(req.params.slug));
  const data = parse(orderSchema, req.body);
  await rateLimit(`order-ip:${req.ip}`, 10, 60 * 60, "Too many orders. Try again later.");
  if (!event.khqrImageKey) throw new HttpError(409, "Event not found or not on sale.");

  const order = await prisma.$transaction(async (tx) => {
    const ids = data.items.map((i) => i.ticketTypeId);
    await lockTicketTypes(tx, ids);
    const types = await tx.ticketType.findMany({ where: { id: { in: ids }, eventId: event.id } });
    const counts = await ticketCounts(tx, ids);
    const currencies = new Set(types.map((t) => t.currency));
    if (types.length !== new Set(ids).size) throw new HttpError(400, "Choose at least one ticket.");
    if (currencies.size > 1) throw new HttpError(400, "All tickets in one order must be in the same currency.");
    for (const item of data.items) {
      const type = types.find((t) => t.id === item.ticketTypeId)!;
      const c = counts.get(type.id)!;
      if (item.quantity > type.maxPerOrder) {
        const message = `At most ${type.maxPerOrder} tickets of this type per order.`;
        throw new HttpError(400, message, { items: [message] });
      }
      if (!onSale(type) || c.sold + c.held + item.quantity > type.quantity) throw new HttpError(409, "Some tickets are no longer available.");
    }
    const total = data.items.reduce((s, i) => s + i.quantity * types.find((t) => t.id === i.ticketTypeId)!.price, 0);
    let reference = newReference();
    while (await tx.order.findUnique({ where: { eventId_reference: { eventId: event.id, reference } } })) reference = newReference();
    return tx.order.create({
      data: {
        eventId: event.id,
        token: newInviteToken(),
        reference,
        buyerName: data.buyerName,
        buyerPhone: data.buyerPhone,
        total,
        currency: types[0].currency,
        fee: platformFee(total, config.platformFeePercent()),
        expiresAt: new Date(Date.now() + HOLD_MINUTES * 60_000),
        items: { create: data.items.map((i) => ({ ticketTypeId: i.ticketTypeId, quantity: i.quantity, unitPrice: types.find((t) => t.id === i.ticketTypeId)!.price })) },
      },
    });
  });
  await notify({ kind: "order_sms", orderId: order.id, stage: "placed" });
  await notify({ kind: "order_placed", orderId: order.id });
  res.status(201).json({ token: order.token, url: orderUrl(order.token) });
});

async function findOrderByToken(token: string) {
  const order = /^[\w-]{16,32}$/.test(token)
    ? await prisma.order.findUnique({
        where: { token },
        include: { event: { include: { organization: true } }, items: { include: { ticketType: { select: { name: true } } } }, tickets: { include: { ticketType: { select: { name: true } } }, orderBy: { createdAt: "asc" } } },
      })
    : null;
  if (!order) throw new HttpError(404, "Order not found.");
  return order;
}

ordersRouter.get("/:token", async (req, res) => {
  let order = await findOrderByToken(String(req.params.token));
  if (order.status === "PENDING_PAYMENT" && order.expiresAt <= new Date()) {
    await expireOrders(order.eventId);
    order = await findOrderByToken(order.token);
  }
  const e = order.event;
  res.set("Cache-Control", "no-store");
  res.json({
    order: {
      reference: order.reference,
      buyerName: order.buyerName,
      status: order.status,
      total: order.total,
      currency: order.currency,
      expiresAt: order.expiresAt,
      paidAt: order.paidAt,
      items: order.items.map((i) => ({ name: i.ticketType.name, quantity: i.quantity, unitPrice: i.unitPrice })),
      // Codes only once paid: they are what gets someone in.
      tickets: order.status === "PAID" ? order.tickets.map((t) => ({ code: t.code, type: t.ticketType.name, used: Boolean(t.checkedInAt) })) : [],
    },
    event: {
      slug: e.slug,
      titleKm: e.titleKm,
      titleEn: e.titleEn,
      startsAt: e.startsAt,
      venueKm: e.venueKm,
      venueEn: e.venueEn,
      mapUrl: e.mapUrl,
      khqrImageKey: order.status === "PENDING_PAYMENT" ? e.khqrImageKey : null,
      khqrAccountName: e.khqrAccountName,
      planner: plannerBranding(e.organization),
    },
  });
});

ordersRouter.get("/:token/tickets/:code/qr.svg", async (req, res) => {
  const order = await findOrderByToken(String(req.params.token));
  const ticket = order.status === "PAID" ? order.tickets.find((t) => t.code === req.params.code) : null;
  if (!ticket) throw new HttpError(404, "Not found.");
  const svg = await QRCode.toString(ticketQrText(ticket.code), { type: "svg", margin: 1, errorCorrectionLevel: "M" });
  res.set("Cache-Control", "private, max-age=3600");
  res.type("image/svg+xml").send(svg);
});
