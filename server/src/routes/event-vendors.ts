// An event's vendor shortlist: vendors the hosts are considering or have booked.
import { Router } from "express";
import { z } from "zod";
import { currentMember, isUuid, ownersOnly } from "../access.js";
import { prisma } from "../db.js";
import { HttpError, parse } from "../errors.js";
import { ratings, vendorCard } from "../lib/vendors.js";

/** Mounted on /api/events/:eventId (after eventAccess). */
export const eventVendorsRouter = Router({ mergeParams: true });

const shortlistSchema = z.object({
  status: z.enum(["CONSIDERING", "BOOKED"]).default("CONSIDERING"),
  note: z.string().trim().max(300).nullish().transform((v) => v || null),
});

eventVendorsRouter.get("/vendors", ownersOnly, async (req, res) => {
  const member = currentMember(req);
  const rows = await prisma.eventVendor.findMany({ where: { eventId: member.eventId }, include: { vendor: true }, orderBy: [{ status: "desc" }, { createdAt: "asc" }] });
  const rated = await ratings(rows.map((r) => r.vendorId));
  res.json({
    vendors: rows.map((r) => ({
      vendorId: r.vendorId,
      status: r.status,
      note: r.note,
      // A vendor taken off the directory stays on the list, without its profile link.
      listed: r.vendor.status === "PUBLISHED",
      vendor: { ...vendorCard(r.vendor, rated.get(r.vendorId)), phone: r.vendor.phone, telegram: r.vendor.telegram },
    })),
  });
});

eventVendorsRouter.put("/vendors/:vendorId", ownersOnly, async (req, res) => {
  const member = currentMember(req);
  const data = parse(shortlistSchema, req.body);
  const vendorId = req.params.vendorId;
  const vendor = isUuid(vendorId) ? await prisma.vendor.findUnique({ where: { id: vendorId } }) : null;
  // Only published vendors can be added; ones already on the list can still be updated.
  const existing = vendor ? await prisma.eventVendor.findUnique({ where: { eventId_vendorId: { eventId: member.eventId, vendorId: vendor.id } } }) : null;
  if (!vendor || (vendor.status !== "PUBLISHED" && !existing)) throw new HttpError(404, "Vendor not found.");
  const row = await prisma.eventVendor.upsert({
    where: { eventId_vendorId: { eventId: member.eventId, vendorId: vendor.id } },
    create: { eventId: member.eventId, vendorId: vendor.id, ...data },
    update: data,
  });
  res.json({ vendorId: row.vendorId, status: row.status, note: row.note });
});

eventVendorsRouter.delete("/vendors/:vendorId", ownersOnly, async (req, res) => {
  const member = currentMember(req);
  const vendorId = req.params.vendorId;
  if (isUuid(vendorId)) await prisma.eventVendor.deleteMany({ where: { eventId: member.eventId, vendorId } });
  res.status(204).end();
});
