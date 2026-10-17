import type { Order, OrderItem, Ticket, TicketType } from "@prisma/client";
import { config } from "../config.js";
import { sha256 } from "./codes.js";

export const orderUrl = (token: string) => `${config.appUrl()}/o/${token}`;

/** What the scanner compares against; the ticket code itself stays with the buyer. */
export const ticketHash = (code: string) => sha256(code).slice(0, 20);

/** The QR on a ticket: recognisable, and only the code matters. */
export const ticketQrText = (code: string) => `MOMENTS-TICKET:${code}`;

type FullOrder = Order & { items: (OrderItem & { ticketType: Pick<TicketType, "name"> })[]; tickets?: (Ticket & { ticketType: Pick<TicketType, "name"> })[] };

/** An order as its organizer sees it. */
export const orderView = (o: FullOrder) => ({
  id: o.id,
  reference: o.reference,
  buyerName: o.buyerName,
  buyerPhone: o.buyerPhone,
  status: o.status,
  total: o.total,
  currency: o.currency,
  fee: o.fee,
  expiresAt: o.expiresAt,
  paidAt: o.paidAt,
  cancelledReason: o.cancelledReason,
  createdAt: o.createdAt,
  items: o.items.map((i) => ({ ticketTypeId: i.ticketTypeId, name: i.ticketType.name, quantity: i.quantity, unitPrice: i.unitPrice })),
  ticketsEntered: (o.tickets ?? []).filter((t) => t.checkedInAt).length,
});
