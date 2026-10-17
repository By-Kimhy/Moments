// The seating plan: tables, who sits where, automatic arranging and printouts. Owners only.
import { Router } from "express";
import { z } from "zod";
import { currentMember, isUuid, ownersOnly } from "../access.js";
import { prisma } from "../db.js";
import { HttpError, parse } from "../errors.js";
import { audit } from "../lib/audit.js";
import { autoArrange, nextTableNames, seatsFor } from "../lib/seating.js";
import { seatingPdf } from "../reports/seating-pdf.js";

/** Mounted on /api/events/:eventId (after eventAccess). */
export const seatingRouter = Router({ mergeParams: true });
seatingRouter.use(["/seating", "/tables"], ownersOnly);

const tableFields = {
  name: z.string().trim().min(1, "Enter a table name.").max(40),
  capacity: z.coerce.number().int().min(1, "At least 1 seat.").max(100, "At most 100 seats."),
  note: z
    .string()
    .trim()
    .max(200)
    .nullish()
    .transform((v) => v || null),
  sortOrder: z.coerce.number().int().min(0).max(10_000),
};
const createSchema = z.object({ ...tableFields, sortOrder: tableFields.sortOrder.optional(), capacity: tableFields.capacity.default(10) });
const updateSchema = z.object(tableFields).partial();
const bulkSchema = z.object({ count: z.coerce.number().int().min(1).max(200), capacity: tableFields.capacity.default(10) });
const assignSchema = z.object({
  guestIds: z.array(z.string().refine(isUuid)).min(1).max(2000),
  tableId: z.string().refine(isUuid).nullable(),
});
const autoSchema = z.object({ mode: z.enum(["unassigned", "all"]).default("unassigned") });

const guestSelect = { id: true, name: true, nameAlt: true, side: true, group: true, invitedCount: true, rsvpStatus: true, rsvpCount: true, tableId: true } as const;

/** Tables with their guests and seat counts, the unseated guests, and totals. */
async function seatingPlan(eventId: string) {
  const [tables, guests] = await Promise.all([
    prisma.diningTable.findMany({ where: { eventId }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    prisma.guest.findMany({ where: { eventId }, select: guestSelect, orderBy: { name: "asc" } }),
  ]);
  const withSeats = guests.map((g) => ({ ...g, seats: seatsFor(g) }));
  const byTable = new Map<string, typeof withSeats>();
  for (const g of withSeats) if (g.tableId) byTable.set(g.tableId, [...(byTable.get(g.tableId) ?? []), g]);
  const planTables = tables.map((t) => {
    const seated = byTable.get(t.id) ?? [];
    const seatsUsed = seated.reduce((s, g) => s + g.seats, 0);
    return { id: t.id, name: t.name, capacity: t.capacity, note: t.note, sortOrder: t.sortOrder, seatsUsed, over: seatsUsed > t.capacity, guests: seated };
  });
  const unassigned = withSeats.filter((g) => !g.tableId && g.seats > 0);
  return {
    tables: planTables,
    unassigned,
    summary: {
      tables: tables.length,
      capacity: tables.reduce((s, t) => s + t.capacity, 0),
      seatedPeople: planTables.reduce((s, t) => s + t.seatsUsed, 0),
      unseatedPeople: unassigned.reduce((s, g) => s + g.seats, 0),
      unseatedGuests: unassigned.length,
      overTables: planTables.filter((t) => t.over).length,
    },
  };
}

async function findTable(eventId: string, tableId: unknown) {
  const table = isUuid(tableId) ? await prisma.diningTable.findFirst({ where: { id: tableId, eventId } }) : null;
  if (!table) throw new HttpError(404, "Table not found.");
  return table;
}

function duplicateName(e: unknown): never {
  if ((e as { code?: string }).code === "P2002") throw new HttpError(409, "A table with this name already exists.", { name: ["A table with this name already exists."] });
  throw e;
}

seatingRouter.get("/seating", async (req, res) => {
  res.json(await seatingPlan(currentMember(req).eventId));
});

seatingRouter.post("/tables", async (req, res) => {
  const member = currentMember(req);
  const data = parse(createSchema, req.body);
  const last = await prisma.diningTable.aggregate({ where: { eventId: member.eventId }, _max: { sortOrder: true } });
  const table = await prisma.$transaction(async (tx) => {
    const created = await tx.diningTable.create({ data: { ...data, eventId: member.eventId, sortOrder: data.sortOrder ?? (last._max.sortOrder ?? 0) + 1 } });
    await audit(tx, { eventId: member.eventId, entity: "event", entityId: member.eventId, action: "table_create", actorId: member.id, after: { name: created.name, capacity: created.capacity } });
    return created;
  }).catch(duplicateName);
  res.status(201).json({ table });
});

// "Add 20 tables of 10": numbered after the highest existing number.
seatingRouter.post("/tables/bulk", async (req, res) => {
  const member = currentMember(req);
  const { count, capacity } = parse(bulkSchema, req.body);
  const existing = await prisma.diningTable.findMany({ where: { eventId: member.eventId }, select: { name: true, sortOrder: true } });
  const start = Math.max(0, ...existing.map((t) => t.sortOrder)) + 1;
  const names = nextTableNames(existing.map((t) => t.name), count);
  await prisma.$transaction(async (tx) => {
    await tx.diningTable.createMany({ data: names.map((name, i) => ({ eventId: member.eventId, name, capacity, sortOrder: start + i })) });
    await audit(tx, { eventId: member.eventId, entity: "event", entityId: member.eventId, action: "table_create", actorId: member.id, after: { names, capacity } });
  });
  res.status(201).json(await seatingPlan(member.eventId));
});

seatingRouter.patch("/tables/:tableId", async (req, res) => {
  const member = currentMember(req);
  const before = await findTable(member.eventId, req.params.tableId);
  const data = parse(updateSchema, req.body);
  const table = await prisma.$transaction(async (tx) => {
    const after = await tx.diningTable.update({ where: { id: before.id }, data });
    await audit(tx, { eventId: member.eventId, entity: "event", entityId: member.eventId, action: "table_update", actorId: member.id, before, after });
    return after;
  }).catch(duplicateName);
  res.json({ table });
});

// Deleting a table leaves its guests unseated, not deleted.
seatingRouter.delete("/tables/:tableId", async (req, res) => {
  const member = currentMember(req);
  const table = await findTable(member.eventId, req.params.tableId);
  await prisma.$transaction(async (tx) => {
    await tx.guest.updateMany({ where: { eventId: member.eventId, tableId: table.id }, data: { tableId: null } });
    await tx.diningTable.delete({ where: { id: table.id } });
    await audit(tx, { eventId: member.eventId, entity: "event", entityId: member.eventId, action: "table_delete", actorId: member.id, before: table });
  });
  res.status(204).end();
});

// Seats guests at a table (or unseats them with tableId: null).
seatingRouter.post("/seating/assign", async (req, res) => {
  const member = currentMember(req);
  const { guestIds, tableId } = parse(assignSchema, req.body);
  if (tableId) await findTable(member.eventId, tableId);
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.guest.updateMany({ where: { id: { in: guestIds }, eventId: member.eventId }, data: { tableId } });
    if (count !== guestIds.length) throw new HttpError(404, "Guest not found.");
    await audit(tx, { eventId: member.eventId, entity: "event", entityId: member.eventId, action: "seat", actorId: member.id, after: { guestIds, tableId } });
  });
  res.json(await seatingPlan(member.eventId));
});

// Arranges the unseated guests (or everyone, starting over) at the existing tables.
seatingRouter.post("/seating/auto", async (req, res) => {
  const member = currentMember(req);
  const { mode } = parse(autoSchema, req.body);
  const result = await prisma.$transaction(async (tx) => {
    if (mode === "all") await tx.guest.updateMany({ where: { eventId: member.eventId }, data: { tableId: null } });
    const [tables, guests] = await Promise.all([
      tx.diningTable.findMany({ where: { eventId: member.eventId }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
      tx.guest.findMany({ where: { eventId: member.eventId }, select: guestSelect }),
    ]);
    const used = new Map<string, number>();
    for (const g of guests) if (g.tableId) used.set(g.tableId, (used.get(g.tableId) ?? 0) + seatsFor(g));
    const arranged = autoArrange(
      tables.map((t) => ({ id: t.id, capacity: t.capacity, used: used.get(t.id) ?? 0 })),
      guests.filter((g) => !g.tableId).map((g) => ({ id: g.id, side: g.side, group: g.group, seats: seatsFor(g) })),
    );
    for (const a of arranged.assignments) await tx.guest.update({ where: { id: a.guestId }, data: { tableId: a.tableId } });
    await audit(tx, { eventId: member.eventId, entity: "event", entityId: member.eventId, action: "seat_auto", actorId: member.id, after: { mode, seated: arranged.assignments.length, unplaced: arranged.unplaced.length } });
    return arranged;
  });
  res.json({ seated: result.assignments.length, unplaced: result.unplaced.length, ...(await seatingPlan(member.eventId)) });
});

seatingRouter.get("/seating/plan.pdf", async (req, res) => {
  const { eventId } = currentMember(req);
  const lang = req.query.lang === "en" ? "en" : "km";
  const [event, plan] = await Promise.all([prisma.event.findUniqueOrThrow({ where: { id: eventId } }), seatingPlan(eventId)]);
  const title = lang === "en" && event.titleEn ? event.titleEn : event.titleKm;
  const pdf = await seatingPdf(title, plan.tables.filter((t) => t.guests.length), lang);
  if (!pdf) throw new HttpError(503, "PDF export is not set up on this server.");
  res.set("Content-Disposition", `attachment; filename="seating-plan-${event.startsAt.toISOString().slice(0, 10)}.pdf"`);
  res.type("application/pdf").send(pdf);
});

/** For the shared response type only. */
export const seatingPlanForContract = seatingPlan;
