// Ticket sales: what's still available, order references and the platform fee.
import { randomInt } from "node:crypto";
import type { Prisma, TicketType } from "@prisma/client";

export const HOLD_MINUTES = 30;

/** Is this ticket type on sale right now? */
export const onSale = (t: Pick<TicketType, "active" | "salesStart" | "salesEnd">, now = new Date()) =>
  t.active && (!t.salesStart || now >= t.salesStart) && (!t.salesEnd || now < t.salesEnd);

/**
 * Tickets sold (paid orders) and held (orders waiting for payment, not yet expired) per type.
 * `excludeOrderId` leaves one order's own hold out, when that order is being confirmed.
 */
export async function ticketCounts(tx: Prisma.TransactionClient, ticketTypeIds: string[], now = new Date(), excludeOrderId?: string) {
  const items = await tx.orderItem.findMany({
    where: {
      ticketTypeId: { in: ticketTypeIds },
      OR: [{ order: { status: "PAID" } }, { order: { status: "PENDING_PAYMENT", expiresAt: { gt: now } } }],
      ...(excludeOrderId ? { orderId: { not: excludeOrderId } } : {}),
    },
    select: { ticketTypeId: true, quantity: true, order: { select: { status: true } } },
  });
  const counts = new Map(ticketTypeIds.map((id) => [id, { sold: 0, held: 0 }]));
  for (const item of items) {
    const c = counts.get(item.ticketTypeId)!;
    if (item.order.status === "PAID") c.sold += item.quantity;
    else c.held += item.quantity;
  }
  return counts;
}

/** Locks ticket types for the rest of the transaction, so two buyers can't take the last ticket. */
export async function lockTicketTypes(tx: Prisma.TransactionClient, ids: string[]) {
  if (ids.length) await tx.$queryRaw`SELECT id FROM "TicketType" WHERE id = ANY(${ids}::uuid[]) FOR UPDATE`;
}

const REFERENCE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O or 1/I
/** A short payment reference such as "K7Q2MX", easy to type into a bank app's note. */
export const newReference = () => Array.from({ length: 6 }, () => REFERENCE_ALPHABET[randomInt(REFERENCE_ALPHABET.length)]).join("");

/** The platform fee in the same minor units, rounded to the nearest unit. */
export const platformFee = (total: number, percent: number) => Math.round((total * percent) / 100);
