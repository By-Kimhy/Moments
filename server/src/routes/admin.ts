// Platform admins: the vendor review queue, featured placements, hiding reviews, and
// confirming plan payments.
import type { Prisma, VendorStatus } from "@prisma/client";
import { type Request, Router } from "express";
import { z } from "zod";
import { currentUser, requireAdmin } from "../auth.js";
import { isUuid } from "../access.js";
import { prisma } from "../db.js";
import { HttpError, parse } from "../errors.js";
import { adminStats, monthKeys, vendorLeads } from "../lib/admin-stats.js";
import { csvCell } from "../lib/csv.js";
import { confirmOrder, describeOrders } from "../lib/platform-orders.js";
import { ownerVendorView, ratings } from "../lib/vendors.js";
import { planOrderView } from "./plans.js";

export const adminRouter = Router();
adminRouter.use(requireAdmin);

adminRouter.get("/stats", async (_req, res) => {
  res.json(await adminStats());
});

const leadsSchema = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional().catch(undefined) });

// Enquiries per vendor for a month: who to bill per lead. ?format=csv downloads it.
adminRouter.get("/leads", async (req, res) => {
  const month = parse(leadsSchema, req.query).month ?? monthKeys().at(-1)!;
  const leads = await vendorLeads(month);
  if (req.query.format === "csv") {
    const lines = [["Vendor", "Category", "Province", "Owner", "Phone", "Enquiries"], ...leads.map((l) => [l.name, l.category, l.province, l.owner.name, l.owner.phone ?? "", String(l.enquiries)])];
    res.attachment(`moments-leads-${month}.csv`);
    res.type("text/csv; charset=utf-8").send(`\ufeff${lines.map((l) => l.map(csvCell).join(",")).join("\r\n")}\r\n`);
    return;
  }
  res.json({ month, months: monthKeys(), leads, total: leads.reduce((s, l) => s + l.enquiries, 0) });
});

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

// Reports from hosts about vendors and reviews.
adminRouter.get("/reports", async (req, res) => {
  const resolved = req.query.resolved === "true";
  const reports = await prisma.report.findMany({
    where: { resolvedAt: resolved ? { not: null } : null },
    include: {
      user: { select: { name: true } },
      vendor: { select: { id: true, name: true, slug: true, status: true } },
      review: { select: { id: true, rating: true, text: true, hiddenAt: true, user: { select: { name: true } } } },
    },
    orderBy: { createdAt: resolved ? "desc" : "asc" },
    take: 200,
  });
  res.json({
    reports: reports.map((r) => ({
      id: r.id,
      reason: r.reason,
      note: r.note,
      reporter: r.user.name,
      vendor: r.vendor,
      review: r.review ? { id: r.review.id, rating: r.review.rating, text: r.review.text, author: r.review.user.name, hidden: r.review.hiddenAt !== null } : null,
      resolvedAt: r.resolvedAt,
      createdAt: r.createdAt,
    })),
  });
});

adminRouter.post("/reports/:reportId/resolve", async (req, res) => {
  const id = req.params.reportId;
  const report = isUuid(id) ? await prisma.report.findUnique({ where: { id } }) : null;
  if (!report) throw new HttpError(404, "Not found.");
  // Every open report about the same vendor or review is dealt with at once.
  await prisma.report.updateMany({
    where: { vendorId: report.vendorId, reviewId: report.reviewId, resolvedAt: null },
    data: { resolvedAt: new Date(), resolvedById: currentUser(req).id },
  });
  res.status(204).end();
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

// Payments to the platform (plans, featured vendors, planner subscriptions): the payer sends the
// platform's KHQR with the reference; an admin confirms here.

const ordersSchema = z.object({ status: z.enum(["PENDING", "PAID", "CANCELLED"]).default("PENDING").catch("PENDING") });

adminRouter.get("/plan-orders", async (req, res) => {
  const { status } = parse(ordersSchema, req.query);
  const orders = await prisma.planOrder.findMany({ where: { status }, orderBy: { createdAt: status === "PENDING" ? "asc" : "desc" }, take: 200 });
  res.json({ orders: await describeOrders(orders) });
});

async function pendingOrder(req: Request) {
  const id = req.params.orderId;
  const order = isUuid(id) ? await prisma.planOrder.findUnique({ where: { id } }) : null;
  if (!order) throw new HttpError(404, "Order not found.");
  if (order.status !== "PENDING") throw new HttpError(409, "This order has changed. Reload and try again.");
  return order;
}

// The money arrived: record the payment and move the event to the plan.
adminRouter.post("/plan-orders/:orderId/confirm", async (req, res) => {
  const order = await pendingOrder(req);
  const updated = await confirmOrder(order, currentUser(req));
  res.json({ order: planOrderView(updated) });
});

adminRouter.post("/plan-orders/:orderId/cancel", async (req, res) => {
  const order = await pendingOrder(req);
  const updated = await prisma.planOrder.update({ where: { id: order.id }, data: { status: "CANCELLED", cancelledAt: new Date() } });
  res.json({ order: planOrderView(updated) });
});
