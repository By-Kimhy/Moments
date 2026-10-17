// The guest list of one event: owners add, edit, import and export guests.
import type { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { currentMember, isUuid, ownersOnly } from "../access.js";
import { prisma } from "../db.js";
import { HttpError, parse } from "../errors.js";
import { audit } from "../lib/audit.js";
import { newInviteToken } from "../lib/codes.js";
import { csvCell } from "../lib/csv.js";
import { MAX_IMPORT_ROWS, type GuestInput, guestSchema, guestView, inviteUrl, readSheet, rowsToGuests } from "../lib/guests.js";
import { translate } from "../messages.js";
import { sheetUpload } from "../uploads.js";

/** Mounted on /api/events/:eventId (after eventAccess). */
export const guestsRouter = Router({ mergeParams: true });
guestsRouter.use("/guests", ownersOnly);

const listQuery = z.object({
  q: z.string().trim().max(100).optional(),
  side: z.enum(["BRIDE", "GROOM", "BOTH"]).optional().catch(undefined),
  rsvp: z.enum(["PENDING", "ATTENDING", "DECLINED"]).optional().catch(undefined),
  group: z.string().trim().max(80).optional(),
});

const bulkSchema = z.object({
  guests: z.array(z.unknown()).min(1, "There are no guests to add.").max(MAX_IMPORT_ROWS, `Import at most ${MAX_IMPORT_ROWS} guests at a time.`),
});

const withCounts = { _count: { select: { checkins: true, gifts: true } } } as const;

async function findGuest(eventId: string, guestId: unknown) {
  const guest = isUuid(guestId) ? await prisma.guest.findFirst({ where: { id: guestId, eventId }, include: withCounts }) : null;
  if (!guest) throw new HttpError(404, "Guest not found.");
  return guest;
}

/** Phone numbers already on this event's list. */
async function existingPhones(eventId: string) {
  const rows = await prisma.guest.findMany({ where: { eventId, phone: { not: null } }, select: { phone: true } });
  return new Set(rows.map((r) => r.phone!));
}

guestsRouter.get("/guests", async (req, res) => {
  const { eventId } = currentMember(req);
  const { q, side, rsvp, group } = parse(listQuery, req.query);
  const where: Prisma.GuestWhereInput = { eventId, side, rsvpStatus: rsvp, group: group || undefined };
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { nameAlt: { contains: q, mode: "insensitive" } },
      { phone: { contains: q.replace(/\D/g, "").replace(/^0/, "") || q } },
    ];
  }
  const [guests, all, groups] = await Promise.all([
    prisma.guest.findMany({ where, orderBy: [{ name: "asc" }], include: withCounts }),
    prisma.guest.findMany({ where: { eventId }, select: { invitedCount: true, rsvpStatus: true, rsvpCount: true, openedAt: true } }),
    prisma.guest.findMany({ where: { eventId, group: { not: null } }, distinct: ["group"], select: { group: true }, orderBy: { group: "asc" } }),
  ]);
  const summary = {
    guests: all.length,
    invitedPeople: all.reduce((sum, g) => sum + g.invitedCount, 0),
    attendingPeople: all.reduce((sum, g) => sum + (g.rsvpStatus === "ATTENDING" ? (g.rsvpCount ?? g.invitedCount) : 0), 0),
    attending: all.filter((g) => g.rsvpStatus === "ATTENDING").length,
    declined: all.filter((g) => g.rsvpStatus === "DECLINED").length,
    pending: all.filter((g) => g.rsvpStatus === "PENDING").length,
    opened: all.filter((g) => g.openedAt).length,
  };
  res.json({ guests: guests.map(guestView), summary, groups: groups.map((g) => g.group!) });
});

guestsRouter.get("/guests/groups", async (req, res) => {
  const { eventId } = currentMember(req);
  const groups = await prisma.guest.findMany({ where: { eventId, group: { not: null } }, distinct: ["group"], select: { group: true }, orderBy: { group: "asc" } });
  res.json({ groups: groups.map((g) => g.group!) });
});

// A CSV of the whole list with each guest's invitation link, for sharing or printing.
guestsRouter.get("/guests/export.csv", async (req, res) => {
  const { eventId } = currentMember(req);
  const guests = await prisma.guest.findMany({ where: { eventId }, orderBy: [{ side: "asc" }, { name: "asc" }] });
  const lines = [
    ["Name", "Latin name", "Phone", "Side", "Group", "People", "RSVP", "Confirmed people", "Table", "Invitation link"],
    ...guests.map((g) => [g.name, g.nameAlt, g.phone, g.side, g.group, g.invitedCount, g.rsvpStatus, g.rsvpCount, g.tableNo, inviteUrl(g.inviteToken)]),
  ];
  res.set("Content-Disposition", 'attachment; filename="guests.csv"');
  // The BOM makes Excel read the file as UTF-8, so Khmer names show correctly.
  res.type("text/csv; charset=utf-8").send(`﻿${lines.map((l) => l.map(csvCell).join(",")).join("\r\n")}\r\n`);
});

guestsRouter.post("/guests", async (req, res) => {
  const member = currentMember(req);
  const data = parse(guestSchema, req.body);
  const guest = await prisma.$transaction(async (tx) => {
    const created = await tx.guest.create({ data: { ...data, eventId: member.eventId, inviteToken: newInviteToken() }, include: withCounts });
    await audit(tx, { eventId: member.eventId, entity: "guest", entityId: created.id, action: "create", actorId: member.id, after: data });
    return created;
  });
  res.status(201).json({ guest: guestView(guest) });
});

// Step 1 of an import: read the file and show what would be added. Nothing is saved.
guestsRouter.post("/guests/import/parse", sheetUpload.single("file"), async (req, res) => {
  const { eventId } = currentMember(req);
  const language = req.acceptsLanguages("en", "km");
  if (!req.file) throw new HttpError(400, "Choose a CSV or Excel file.", { file: ["Choose a CSV or Excel file."] });

  let table: string[][];
  try {
    table = await readSheet(req.file.buffer, req.file.originalname);
  } catch {
    throw new HttpError(400, "Choose a CSV or Excel (.xlsx) file.", { file: ["Choose a CSV or Excel (.xlsx) file."] });
  }
  const result = rowsToGuests(table);
  if ("headingError" in result) {
    throw new HttpError(400, "The first row must have column headings, including a Name column.", {
      file: ["The first row must have column headings, including a Name column."],
    });
  }
  if (result.rows.length + result.errors.length > MAX_IMPORT_ROWS) {
    throw new HttpError(400, `Import at most ${MAX_IMPORT_ROWS} guests at a time.`, { file: [`Import at most ${MAX_IMPORT_ROWS} guests at a time.`] });
  }

  const phones = await existingPhones(eventId);
  const seen = new Set<string>();
  const duplicates: number[] = [];
  for (const row of result.rows) {
    const phone = row.guest.phone;
    if (phone && (phones.has(phone) || seen.has(phone))) duplicates.push(row.line);
    if (phone) seen.add(phone);
  }
  res.json({
    rows: result.rows,
    errors: result.errors.map((e) => ({ line: e.line, messages: e.messages.map((m) => translate(m, language)) })),
    duplicates,
  });
});

// Step 2: add the guests. Guests whose phone number is already on the list are skipped.
guestsRouter.post("/guests/bulk", async (req, res) => {
  const member = currentMember(req);
  const { guests: input } = parse(bulkSchema, req.body);
  const language = req.acceptsLanguages("en", "km");

  const valid: GuestInput[] = [];
  const errors: { index: number; messages: string[] }[] = [];
  input.forEach((item, index) => {
    const result = guestSchema.safeParse(item);
    if (result.success) valid.push(result.data);
    else errors.push({ index, messages: result.error.issues.map((i) => translate(i.message, language)) });
  });
  if (errors.length) {
    res.status(400).json({ error: translate("Some guests have problems. Fix them and try again.", language), rows: errors });
    return;
  }

  const phones = await existingPhones(member.eventId);
  const toCreate: GuestInput[] = [];
  let skipped = 0;
  for (const guest of valid) {
    if (guest.phone && phones.has(guest.phone)) {
      skipped++;
      continue;
    }
    if (guest.phone) phones.add(guest.phone);
    toCreate.push(guest);
  }

  await prisma.$transaction(async (tx) => {
    await tx.guest.createMany({ data: toCreate.map((g) => ({ ...g, eventId: member.eventId, inviteToken: newInviteToken() })) });
    await audit(tx, {
      eventId: member.eventId,
      entity: "event",
      entityId: member.eventId,
      action: "import_guests",
      actorId: member.id,
      after: { created: toCreate.length, skipped, names: toCreate.map((g) => g.name) },
    });
  });
  res.status(201).json({ created: toCreate.length, skipped });
});

guestsRouter.get("/guests/:guestId", async (req, res) => {
  const guest = await findGuest(currentMember(req).eventId, req.params.guestId);
  res.json({ guest: guestView(guest) });
});

guestsRouter.patch("/guests/:guestId", async (req, res) => {
  const member = currentMember(req);
  const before = await findGuest(member.eventId, req.params.guestId);
  const data = parse(guestSchema.partial(), req.body);
  const guest = await prisma.$transaction(async (tx) => {
    const after = await tx.guest.update({ where: { id: before.id }, data, include: withCounts });
    await audit(tx, { eventId: member.eventId, entity: "guest", entityId: before.id, action: "update", actorId: member.id, before: guestView(before), after: guestView(after) });
    return after;
  });
  res.json({ guest: guestView(guest) });
});

// A new link stops the old one from working (e.g. it was shared with the wrong person).
guestsRouter.post("/guests/:guestId/new-link", async (req, res) => {
  const member = currentMember(req);
  const before = await findGuest(member.eventId, req.params.guestId);
  const guest = await prisma.$transaction(async (tx) => {
    const after = await tx.guest.update({ where: { id: before.id }, data: { inviteToken: newInviteToken() }, include: withCounts });
    await audit(tx, { eventId: member.eventId, entity: "guest", entityId: before.id, action: "new_link", actorId: member.id });
    return after;
  });
  res.json({ guest: guestView(guest) });
});

guestsRouter.delete("/guests/:guestId", async (req, res) => {
  const member = currentMember(req);
  const guest = await findGuest(member.eventId, req.params.guestId);
  // Gift and check-in records must keep their guest, so those guests can't be deleted.
  if (guest._count.gifts || guest._count.checkins) {
    throw new HttpError(409, "This guest has gifts or a check-in recorded, so they can't be deleted.");
  }
  await prisma.$transaction(async (tx) => {
    await tx.guest.delete({ where: { id: guest.id } });
    await audit(tx, { eventId: member.eventId, entity: "guest", entityId: guest.id, action: "delete", actorId: member.id, before: guestView(guest) });
  });
  res.status(204).end();
});
