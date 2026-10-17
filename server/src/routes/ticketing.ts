// Ticket sales for the organizer (ticket types, orders, confirming payments) and the door
// (scanning tickets). Orders are placed on the public page, see routes/public-tickets.ts.
import { type Request, type Response, Router } from "express";
import { z } from "zod";
import { currentMember, isUuid, ownersOnly } from "../access.js";
import { prisma } from "../db.js";
import { HttpError, parse } from "../errors.js";
import { audit } from "../lib/audit.js";
import { newInviteToken } from "../lib/codes.js";
import { MAX_AMOUNT } from "../lib/money.js";
import { orderView, ticketHash } from "../lib/orders.js";
import { lockTicketTypes, onSale, ticketCounts } from "../lib/tickets.js";
import { translate } from "../messages.js";
import { paymentProvider } from "../providers/payment.js";

/** Mounted on /api/events/:eventId (after eventAccess). */
export const ticketingRouter = Router({ mergeParams: true });
ticketingRouter.use(["/ticket-types", "/orders"], ownersOnly);

const optionalDate = z
  .union([z.coerce.date(), z.literal(""), z.null()])
  .optional()
  .transform((v) => (v instanceof Date ? v : v === undefined ? undefined : null));
const typeFields = {
  name: z.string().trim().min(1, "Enter a ticket name.").max(80),
  description: z
    .string()
    .trim()
    .max(300)
    .nullish()
    .transform((v) => v || null),
  price: z.coerce.number().int().min(0, "The amount must be more than 0."),
  currency: z.enum(["USD", "KHR"], { message: "Choose USD or KHR." }),
  quantity: z.coerce.number({ message: "Enter how many tickets are for sale." }).int().min(1).max(100_000),
  maxPerOrder: z.coerce.number().int().min(1).max(100).default(10),
  salesStart: optionalDate,
  salesEnd: optionalDate,
  active: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).max(10_000).optional(),
};
const createTypeSchema = z.object(typeFields).refine((v) => v.price <= MAX_AMOUNT[v.currency], { path: ["price"], message: "That amount is too large." });
const updateTypeSchema = z
  .object({ ...typeFields, maxPerOrder: typeFields.maxPerOrder.optional(), active: z.boolean().optional() })
  .partial();
const listQuery = z.object({ status: z.enum(["PENDING_PAYMENT", "PAID", "CANCELLED", "EXPIRED"]).optional().catch(undefined), q: z.string().trim().max(100).optional() });
const cancelSchema = z.object({ reason: z.string().trim().min(1, "Give a reason.").max(300) });
const scanSchema = z.object({
  code: z.string().trim().max(200),
  clientId: z.string().refine(isUuid),
  scannedAt: z.coerce
    .date()
    .optional()
    .refine((d) => !d || (d.getTime() <= Date.now() + 5 * 60_000 && d.getTime() >= Date.now() - 7 * 86_400_000), "That time is not valid."),
});

const orderInclude = { items: { include: { ticketType: { select: { name: true } } } }, tickets: { include: { ticketType: { select: { name: true } } } } } as const;

/** Pending orders past their hold become expired (their tickets go back on sale). */
export async function expireOrders(eventId: string) {
  await prisma.order.updateMany({ where: { eventId, status: "PENDING_PAYMENT", expiresAt: { lte: new Date() } }, data: { status: "EXPIRED" } });
}

async function findType(eventId: string, id: unknown) {
  const type = isUuid(id) ? await prisma.ticketType.findFirst({ where: { id, eventId } }) : null;
  if (!type) throw new HttpError(404, "Ticket type not found.");
  return type;
}

async function findOrder(eventId: string, id: unknown) {
  const order = isUuid(id) ? await prisma.order.findFirst({ where: { id, eventId }, include: orderInclude }) : null;
  if (!order) throw new HttpError(404, "Order not found.");
  return order;
}

ticketingRouter.get("/ticket-types", async (req, res) => {
  const { eventId } = currentMember(req);
  const types = await prisma.ticketType.findMany({ where: { eventId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
  const counts = await ticketCounts(prisma, types.map((t) => t.id));
  res.json({
    ticketTypes: types.map((t) => {
      const c = counts.get(t.id)!;
      return { ...t, sold: c.sold, held: c.held, available: Math.max(0, t.quantity - c.sold - c.held), onSale: onSale(t) };
    }),
  });
});

ticketingRouter.post("/ticket-types", async (req, res) => {
  const member = currentMember(req);
  const data = parse(createTypeSchema, req.body);
  const last = await prisma.ticketType.aggregate({ where: { eventId: member.eventId }, _max: { sortOrder: true } });
  const type = await prisma.$transaction(async (tx) => {
    const created = await tx.ticketType.create({ data: { ...data, eventId: member.eventId, sortOrder: data.sortOrder ?? (last._max.sortOrder ?? 0) + 1 } });
    await audit(tx, { eventId: member.eventId, entity: "event", entityId: member.eventId, action: "ticket_type_create", actorId: member.id, after: created });
    return created;
  });
  res.status(201).json({ ticketType: type });
});

ticketingRouter.patch("/ticket-types/:typeId", async (req, res) => {
  const member = currentMember(req);
  const before = await findType(member.eventId, req.params.typeId);
  const data = parse(updateTypeSchema, req.body);
  const type = await prisma.$transaction(async (tx) => {
    const after = await tx.ticketType.update({ where: { id: before.id }, data });
    await audit(tx, { eventId: member.eventId, entity: "event", entityId: member.eventId, action: "ticket_type_update", actorId: member.id, before, after });
    return after;
  });
  res.json({ ticketType: type });
});

ticketingRouter.delete("/ticket-types/:typeId", async (req, res) => {
  const member = currentMember(req);
  const type = await findType(member.eventId, req.params.typeId);
  if (await prisma.orderItem.count({ where: { ticketTypeId: type.id } })) {
    throw new HttpError(409, "Tickets of this type have been ordered. Stop its sales instead of deleting it.");
  }
  await prisma.ticketType.delete({ where: { id: type.id } });
  res.status(204).end();
});

ticketingRouter.get("/orders", async (req, res) => {
  const { eventId } = currentMember(req);
  await expireOrders(eventId);
  const { status, q } = parse(listQuery, req.query);
  const orders = await prisma.order.findMany({
    where: {
      eventId,
      status,
      ...(q ? { OR: [{ reference: { contains: q.toUpperCase() } }, { buyerName: { contains: q, mode: "insensitive" } }, { buyerPhone: { contains: q.replace(/\D/g, "").replace(/^0/, "") || q } }] } : {}),
    },
    include: orderInclude,
    orderBy: { createdAt: "desc" },
  });
  const paid = await prisma.order.findMany({ where: { eventId, status: "PAID" }, select: { total: true, fee: true, currency: true, _count: { select: { tickets: true } } } });
  const sum = (key: "total" | "fee") => ({
    USD: paid.filter((o) => o.currency === "USD").reduce((s, o) => s + o[key], 0),
    KHR: paid.filter((o) => o.currency === "KHR").reduce((s, o) => s + o[key], 0),
  });
  res.json({
    orders: orders.map(orderView),
    summary: {
      paidOrders: paid.length,
      ticketsSold: paid.reduce((s, o) => s + o._count.tickets, 0),
      revenue: sum("total"),
      fees: sum("fee"),
      waiting: await prisma.order.count({ where: { eventId, status: "PENDING_PAYMENT" } }),
    },
  });
});

// The organizer saw the money arrive: issue the tickets. Works for an expired hold too (late
// payment), if tickets are still left.
ticketingRouter.post("/orders/:orderId/confirm", async (req, res) => {
  const member = currentMember(req);
  const order = await findOrder(member.eventId, req.params.orderId);
  if (order.status !== "PENDING_PAYMENT" && order.status !== "EXPIRED") throw new HttpError(409, "This order can't be confirmed.");
  const confirmed = await prisma.$transaction(async (tx) => {
    const typeIds = order.items.map((i) => i.ticketTypeId);
    await lockTicketTypes(tx, typeIds);
    const types = await tx.ticketType.findMany({ where: { id: { in: typeIds } } });
    const counts = await ticketCounts(tx, typeIds, new Date(), order.id);
    for (const item of order.items) {
      const type = types.find((t) => t.id === item.ticketTypeId)!;
      const c = counts.get(type.id)!;
      if (c.sold + c.held + item.quantity > type.quantity) throw new HttpError(409, "Some tickets are no longer available.");
    }
    const paymentId = await paymentProvider.recordOrderPayment(tx, order, member.id);
    await tx.ticket.createMany({
      data: order.items.flatMap((item) =>
        Array.from({ length: item.quantity }, () => ({ eventId: member.eventId, orderId: order.id, ticketTypeId: item.ticketTypeId, code: newInviteToken() })),
      ),
    });
    const after = await tx.order.update({ where: { id: order.id }, data: { status: "PAID", paidAt: new Date(), paymentId }, include: orderInclude });
    await audit(tx, { eventId: member.eventId, entity: "event", entityId: member.eventId, action: "order_paid", actorId: member.id, after: { orderId: order.id, reference: order.reference, total: order.total, currency: order.currency } });
    return after;
  });
  res.json({ order: orderView(confirmed) });
});

// Cancels an order (unpaid, or refunded). Its tickets stop working at the door.
ticketingRouter.post("/orders/:orderId/cancel", async (req, res) => {
  const member = currentMember(req);
  const order = await findOrder(member.eventId, req.params.orderId);
  if (order.status === "CANCELLED") throw new HttpError(409, "This order is already cancelled.");
  const { reason } = parse(cancelSchema, req.body);
  const cancelled = await prisma.$transaction(async (tx) => {
    const after = await tx.order.update({ where: { id: order.id }, data: { status: "CANCELLED", cancelledReason: reason }, include: orderInclude });
    await audit(tx, { eventId: member.eventId, entity: "event", entityId: member.eventId, action: "order_cancel", actorId: member.id, before: { status: order.status }, after: { orderId: order.id, reference: order.reference, reason } });
    return after;
  });
  res.json({ order: orderView(cancelled) });
});

// The door: everything the scanner needs to check tickets, even offline.
ticketingRouter.get("/door/tickets", async (req, res) => {
  const { eventId } = currentMember(req);
  const tickets = await prisma.ticket.findMany({
    where: { eventId, order: { status: "PAID" } },
    include: { ticketType: { select: { name: true } }, order: { select: { buyerName: true, reference: true } }, checkedInBy: { select: { displayName: true } } },
  });
  res.json({
    tickets: tickets.map((t) => ({
      id: t.id,
      hash: ticketHash(t.code),
      type: t.ticketType.name,
      buyerName: t.order.buyerName,
      reference: t.order.reference,
      checkedInAt: t.checkedInAt,
      checkedInBy: t.checkedInBy?.displayName ?? null,
    })),
    stats: { sold: tickets.length, entered: tickets.filter((t) => t.checkedInAt).length },
  });
});

const admitSchema = z.object({ ticketId: z.string().refine(isUuid), clientId: z.string().refine(isUuid), scannedAt: scanSchema.shape.scannedAt });

/**
 * Lets one ticket in. The same scan sent again (offline queue) is answered as before; a ticket
 * already used by another scan is refused with when and by whom.
 */
async function admit(req: Request, res: Response, where: { code: string } | { id: string }, clientId: string, scannedAt?: Date) {
  const member = currentMember(req);
  const include = { ticketType: { select: { name: true } }, order: { select: { buyerName: true, reference: true, status: true } }, checkedInBy: { select: { displayName: true } } } as const;
  const ticket = await prisma.ticket.findFirst({ where: { ...where, eventId: member.eventId }, include });
  if (!ticket || ticket.order.status !== "PAID") throw new HttpError(404, "Not a ticket for this event.");
  const view = (t: typeof ticket) => ({ id: t.id, type: t.ticketType.name, buyerName: t.order.buyerName, reference: t.order.reference, checkedInAt: t.checkedInAt, checkedInBy: t.checkedInBy?.displayName ?? null });

  const { count } = await prisma.ticket.updateMany({
    where: { id: ticket.id, checkedInAt: null },
    data: { checkedInAt: scannedAt ?? new Date(), checkedInById: member.id, scanClientId: clientId },
  });
  const after = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id }, include });
  if (count === 0 && after.scanClientId !== clientId) {
    res.status(409).json({ error: translate("This ticket has already been used.", req.acceptsLanguages("en", "km")), ticket: view(after) });
    return;
  }
  res.json({ ticket: view(after), duplicate: count === 0 });
}

// A scanned QR.
ticketingRouter.post("/door/scan", async (req, res) => {
  const { code, clientId, scannedAt } = parse(scanSchema, req.body);
  await admit(req, res, { code: code.replace(/^MOMENTS-TICKET:/, "") }, clientId, scannedAt);
});

// Let in by hand, from the list (the buyer's phone died, the QR won't scan).
ticketingRouter.post("/door/admit", async (req, res) => {
  const { ticketId, clientId, scannedAt } = parse(admitSchema, req.body);
  await admit(req, res, { id: ticketId }, clientId, scannedAt);
});
