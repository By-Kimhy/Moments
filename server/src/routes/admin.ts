// Platform admins: the vendor review queue, featured placements and hiding reviews.
import type { Prisma, VendorStatus } from "@prisma/client";
import { type Request, Router } from "express";
import { z } from "zod";
import { requireAdmin } from "../auth.js";
import { isUuid } from "../access.js";
import { prisma } from "../db.js";
import { HttpError, parse } from "../errors.js";
import { ownerVendorView, ratings } from "../lib/vendors.js";

export const adminRouter = Router();
adminRouter.use(requireAdmin);

const listSchema = z.object({ status: z.enum(["DRAFT", "PENDING_REVIEW", "PUBLISHED", "SUSPENDED"]).default("PENDING_REVIEW").catch("PENDING_REVIEW") });
const noteSchema = z.object({ note: z.string().trim().max(300).nullish().transform((v) => v || null) });
const featureSchema = z.object({ days: z.coerce.number().int().min(0).max(366) });

async function vendorFor(req: Request) {
  const id = req.params.vendorId;
  const vendor = isUuid(id) ? await prisma.vendor.findUnique({ where: { id } }) : null;
  if (!vendor) throw new HttpError(404, "Vendor not found.");
  return vendor;
}

async function adminVendorView(vendor: Prisma.VendorGetPayload<{ include: { owner: { select: { name: true; phone: true } } } }>) {
  const [rated, enquiries] = await Promise.all([ratings([vendor.id]), prisma.vendorEnquiry.count({ where: { vendorId: vendor.id } })]);
  return { ...ownerVendorView(vendor, rated.get(vendor.id)), owner: vendor.owner, enquiries };
}

adminRouter.get("/vendors", async (req, res) => {
  const { status } = parse(listSchema, req.query);
  const vendors = await prisma.vendor.findMany({
    where: { status },
    include: { owner: { select: { name: true, phone: true } } },
    orderBy: { updatedAt: status === "PENDING_REVIEW" ? "asc" : "desc" },
    take: 200,
  });
  const counts = await prisma.vendor.groupBy({ by: ["status"], _count: { _all: true } });
  res.json({
    vendors: await Promise.all(vendors.map(adminVendorView)),
    counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])) as Partial<Record<VendorStatus, number>>,
  });
});

async function setStatus(req: Request, status: VendorStatus, allowedFrom: VendorStatus[], note: string | null) {
  const vendor = await vendorFor(req);
  if (!allowedFrom.includes(vendor.status)) throw new HttpError(409, "This listing has changed. Reload and try again.");
  return prisma.vendor.update({
    where: { id: vendor.id },
    data: { status, reviewNote: note, ...(status === "PUBLISHED" && !vendor.publishedAt ? { publishedAt: new Date() } : {}) },
    include: { owner: { select: { name: true, phone: true } } },
  });
}

adminRouter.post("/vendors/:vendorId/approve", async (req, res) => {
  const vendor = await setStatus(req, "PUBLISHED", ["PENDING_REVIEW", "SUSPENDED"], null);
  res.json({ vendor: await adminVendorView(vendor) });
});

// Back to the vendor as a draft, with what to fix.
adminRouter.post("/vendors/:vendorId/return", async (req, res) => {
  const { note } = parse(noteSchema, req.body);
  const vendor = await setStatus(req, "DRAFT", ["PENDING_REVIEW"], note);
  res.json({ vendor: await adminVendorView(vendor) });
});

adminRouter.post("/vendors/:vendorId/suspend", async (req, res) => {
  const { note } = parse(noteSchema, req.body);
  const vendor = await setStatus(req, "SUSPENDED", ["PENDING_REVIEW", "PUBLISHED", "DRAFT"], note);
  res.json({ vendor: await adminVendorView(vendor) });
});

// Paid placement: listed first for this many days from now (0 ends it).
adminRouter.post("/vendors/:vendorId/feature", async (req, res) => {
  const { days } = parse(featureSchema, req.body);
  const vendor = await vendorFor(req);
  const updated = await prisma.vendor.update({
    where: { id: vendor.id },
    data: { featuredUntil: days ? new Date(Date.now() + days * 86_400_000) : null },
    include: { owner: { select: { name: true, phone: true } } },
  });
  res.json({ vendor: await adminVendorView(updated) });
});

adminRouter.get("/reviews", async (_req, res) => {
  const reviews = await prisma.vendorReview.findMany({
    include: { user: { select: { name: true } }, vendor: { select: { name: true, slug: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  res.json({
    reviews: reviews.map((r) => ({ id: r.id, rating: r.rating, text: r.text, author: r.user.name, vendor: r.vendor, hidden: r.hiddenAt !== null, createdAt: r.createdAt })),
  });
});

async function setHidden(req: Request, hidden: boolean) {
  const id = req.params.reviewId;
  const review = isUuid(id) ? await prisma.vendorReview.findUnique({ where: { id } }) : null;
  if (!review) throw new HttpError(404, "Review not found.");
  await prisma.vendorReview.update({ where: { id: review.id }, data: { hiddenAt: hidden ? new Date() : null } });
}

adminRouter.post("/reviews/:reviewId/hide", async (req, res) => {
  await setHidden(req, true);
  res.status(204).end();
});

adminRouter.post("/reviews/:reviewId/show", async (req, res) => {
  await setHidden(req, false);
  res.status(204).end();
});
