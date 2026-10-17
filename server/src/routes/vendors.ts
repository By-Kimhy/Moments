// Vendor marketplace: the public directory and profiles, vendors managing their own listing,
// enquiries and reviews from hosts. Platform admins approve listings (routes/admin.ts).
import type { Prisma, Vendor } from "@prisma/client";
import { type Request, Router } from "express";
import { z } from "zod";
import { currentUser, requireUser } from "../auth.js";
import { hostMembership, isUuid } from "../access.js";
import { config } from "../config.js";
import { prisma } from "../db.js";
import { HttpError, parse } from "../errors.js";
import { notify } from "../jobs/notifications.js";
import { imageKey, processPhoto } from "../lib/images.js";
import { cancelOrder, orderView, placeOrder } from "../lib/platform-orders.js";
import { FEATURED_PACKAGES } from "../lib/plans.js";
import type { Photo } from "../lib/events.js";
import { normalizePhone } from "../lib/phone.js";
import { CATEGORY_KEYS, PROVINCE_KEYS } from "../lib/vendor-catalog.js";
import {
  DIRECTORY_PAGE_SIZE,
  MAX_VENDOR_PHOTOS,
  directoryOrder,
  newVendorSlug,
  ownerVendorView,
  ratings,
  vendorCard,
  vendorProfile,
} from "../lib/vendors.js";
import { storage } from "../providers/storage.js";
import { rateLimit } from "../store.js";
import { imageUpload } from "../uploads.js";
import { slugTaken } from "./events.js";

export const vendorsRouter = Router();

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => v || null);

const vendorFields = {
  name: z.string().trim().min(1, "Enter the business name.").max(120),
  category: z.enum(CATEGORY_KEYS as [string, ...string[]], { message: "Choose a category." }),
  province: z.enum(PROVINCE_KEYS as [string, ...string[]], { message: "Choose a province." }),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .refine((v) => /^[a-z0-9](?:[a-z0-9-]{1,58}[a-z0-9])$/.test(v), "Use 3–60 letters, numbers and dashes, like khmer-music-night."),
  descriptionKm: optionalText(4000),
  descriptionEn: optionalText(4000),
  priceFrom: z
    .number({ message: "Enter the amount in cents or riel." })
    .int("Enter the amount in cents or riel.")
    .min(0)
    .max(1_000_000_000, "That amount is too large.")
    .nullish()
    .transform((v) => v ?? null),
  priceCurrency: z.enum(["USD", "KHR"], { message: "Choose USD or KHR." }),
  phone: z
    .string()
    .nullish()
    .transform((v, ctx) => {
      if (!v?.trim()) return null;
      const phone = normalizePhone(v);
      if (!phone) ctx.addIssue({ code: "custom", message: "Enter a valid phone number." });
      return phone;
    }),
  telegram: z
    .string()
    .trim()
    .nullish()
    .transform((v) => (v ? v.replace(/^@/, "").replace(/^https:\/\/t\.me\//, "") : null))
    .refine((v) => v === null || /^[A-Za-z][A-Za-z0-9_]{3,31}$/.test(v), "Enter a Telegram username, like @goldenphoto."),
  facebookUrl: z
    .string()
    .trim()
    .max(300)
    .nullish()
    .transform((v) => v || null)
    .refine((v) => v === null || /^https:\/\/(www\.|m\.|web\.)?(facebook|fb)\.com\//.test(v), "Paste a Facebook link that starts with https://facebook.com/"),
};
const createVendorSchema = z.object(vendorFields).partial({ slug: true, priceCurrency: true });
const updateVendorSchema = z.object(vendorFields).partial();

const directorySchema = z.object({
  category: z.enum(CATEGORY_KEYS as [string, ...string[]]).optional().catch(undefined),
  province: z.enum(PROVINCE_KEYS as [string, ...string[]]).optional().catch(undefined),
  q: z.string().trim().max(100).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(1000).default(1).catch(1),
});

const enquirySchema = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(120),
  phone: z.string({ message: "Enter your phone number." }).transform((v, ctx) => {
    const phone = normalizePhone(v);
    if (!phone) ctx.addIssue({ code: "custom", message: "Enter a valid phone number." });
    return phone ?? "";
  }),
  eventDate: z
    .string()
    .nullish()
    .transform((v) => (v ? new Date(`${v.slice(0, 10)}T00:00:00Z`) : null))
    .refine((v) => v === null || !Number.isNaN(v.getTime()), "That date is not valid."),
  message: z.string().trim().min(1, "Write a message.").max(2000, "Keep the message under 2000 characters."),
  eventId: z
    .string()
    .nullish()
    .transform((v) => v || null)
    .refine((v) => v === null || isUuid(v), "Event not found."),
});

const reviewSchema = z.object({
  rating: z.coerce.number({ message: "Choose 1 to 5 stars." }).int().min(1, "Choose 1 to 5 stars.").max(5, "Choose 1 to 5 stars."),
  text: optionalText(2000),
});
const replySchema = z.object({ reply: z.string().trim().min(1, "Write a reply.").max(2000) });

/** A published vendor by its link name. */
async function publishedVendor(slug: unknown) {
  const vendor = typeof slug === "string" ? await prisma.vendor.findUnique({ where: { slug } }) : null;
  if (!vendor || vendor.status !== "PUBLISHED") throw new HttpError(404, "Vendor not found.");
  return vendor;
}

/** One of the signed-in user's own vendor listings. */
async function ownVendor(req: Request) {
  const id = req.params.vendorId;
  const vendor = isUuid(id) ? await prisma.vendor.findFirst({ where: { id, ownerId: currentUser(req).id } }) : null;
  if (!vendor) throw new HttpError(404, "Vendor not found.");
  return vendor;
}

async function withRating(vendor: Vendor) {
  return ownerVendorView(vendor, (await ratings([vendor.id])).get(vendor.id));
}

const reviewView = (r: Prisma.VendorReviewGetPayload<{ include: { user: { select: { name: true } } } }>) => ({
  id: r.id,
  rating: r.rating,
  text: r.text,
  reply: r.reply,
  repliedAt: r.repliedAt,
  author: r.user.name,
  hidden: r.hiddenAt !== null,
  createdAt: r.createdAt,
});

// --- Public directory -------------------------------------------------------------------------

vendorsRouter.get("/", async (req, res) => {
  const { category, province, q, page } = parse(directorySchema, req.query);
  const where: Prisma.VendorWhereInput = {
    status: "PUBLISHED",
    ...(category ? { category: category as Vendor["category"] } : {}),
    ...(province ? { province } : {}),
    ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
  };
  // Ordering needs each vendor's rating, so it happens here rather than in SQL. A directory
  // filtered by category and province stays small enough for that.
  const vendors = await prisma.vendor.findMany({ where });
  const rated = await ratings(vendors.map((v) => v.id));
  const cards = vendors
    .map((v) => ({ card: vendorCard(v, rated.get(v.id)), publishedAt: v.publishedAt }))
    .sort((a, b) => directoryOrder({ ...a.card, publishedAt: a.publishedAt }, { ...b.card, publishedAt: b.publishedAt }))
    .map((r) => r.card);
  const start = (page - 1) * DIRECTORY_PAGE_SIZE;
  res.json({ vendors: cards.slice(start, start + DIRECTORY_PAGE_SIZE), total: cards.length, page, pageSize: DIRECTORY_PAGE_SIZE });
});

// --- The vendor's own listings (before /:slug, so "mine" is not read as a link name) ----------

vendorsRouter.get("/mine", requireUser, async (req, res) => {
  const vendors = await prisma.vendor.findMany({ where: { ownerId: currentUser(req).id }, orderBy: { createdAt: "asc" } });
  const rated = await ratings(vendors.map((v) => v.id));
  const unread = await prisma.vendorEnquiry.groupBy({ by: ["vendorId"], where: { vendorId: { in: vendors.map((v) => v.id) }, readAt: null }, _count: { _all: true } });
  res.json({
    vendors: vendors.map((v) => ({ ...ownerVendorView(v, rated.get(v.id)), unreadEnquiries: unread.find((u) => u.vendorId === v.id)?._count._all ?? 0 })),
  });
});

vendorsRouter.post("/mine", requireUser, async (req, res) => {
  const { slug, ...data } = parse(createVendorSchema, req.body);
  const vendor = await prisma.vendor
    .create({
      data: {
        ...data,
        category: data.category as Vendor["category"],
        slug: slug ?? (await newVendorSlug(data.name)),
        ownerId: currentUser(req).id,
      },
    })
    .catch(slugTaken);
  res.status(201).json({ vendor: ownerVendorView(vendor) });
});

vendorsRouter.get("/mine/:vendorId", requireUser, async (req, res) => {
  const vendor = await ownVendor(req);
  const reviews = await prisma.vendorReview.findMany({ where: { vendorId: vendor.id }, include: { user: { select: { name: true } } }, orderBy: { createdAt: "desc" } });
  res.json({ vendor: await withRating(vendor), reviews: reviews.map(reviewView) });
});

vendorsRouter.patch("/mine/:vendorId", requireUser, async (req, res) => {
  const vendor = await ownVendor(req);
  const data = parse(updateVendorSchema, req.body);
  const updated = await prisma.vendor
    .update({ where: { id: vendor.id }, data: { ...data, category: data.category as Vendor["category"] | undefined } })
    .catch(slugTaken);
  res.json({ vendor: await withRating(updated) });
});

vendorsRouter.post("/mine/:vendorId/photos", requireUser, imageUpload.array("photos"), async (req, res) => {
  const vendor = await ownVendor(req);
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  if (!files.length) throw new HttpError(400, "Choose at least one photo.", { photos: ["Choose at least one photo."] });
  if ((vendor.photos as Photo[]).length + files.length > MAX_VENDOR_PHOTOS) {
    throw new HttpError(400, `A vendor can have up to ${MAX_VENDOR_PHOTOS} photos.`, { photos: [`A vendor can have up to ${MAX_VENDOR_PHOTOS} photos.`] });
  }
  const processed = await Promise.all(files.map((f) => processPhoto(f.buffer)));
  const added: Photo[] = [];
  for (const image of processed) {
    const key = imageKey(vendor.id, "photo", image.ext);
    await storage.put(key, image.body, image.contentType);
    added.push({ key });
  }
  const updated = await prisma.$transaction(async (tx) => {
    const current = (await tx.vendor.findUniqueOrThrow({ where: { id: vendor.id } })).photos as Photo[];
    return tx.vendor.update({ where: { id: vendor.id }, data: { photos: [...current, ...added] } });
  });
  res.status(201).json({ vendor: await withRating(updated) });
});

vendorsRouter.delete("/mine/:vendorId/photos/:key", requireUser, async (req, res) => {
  const vendor = await ownVendor(req);
  const key = String(req.params.key);
  const photos = vendor.photos as Photo[];
  if (!photos.some((p) => p.key === key)) throw new HttpError(404, "Photo not found.");
  const updated = await prisma.vendor.update({ where: { id: vendor.id }, data: { photos: photos.filter((p) => p.key !== key) } });
  await storage.delete(key);
  res.json({ vendor: await withRating(updated) });
});

vendorsRouter.put("/mine/:vendorId/logo", requireUser, imageUpload.single("image"), async (req, res) => {
  const vendor = await ownVendor(req);
  if (!req.file) throw new HttpError(400, "Choose an image.", { image: ["Choose an image."] });
  const image = await processPhoto(req.file.buffer);
  const key = imageKey(vendor.id, "photo", image.ext);
  await storage.put(key, image.body, image.contentType);
  const updated = await prisma.vendor.update({ where: { id: vendor.id }, data: { logoKey: key } });
  if (vendor.logoKey) await storage.delete(vendor.logoKey);
  res.json({ vendor: await withRating(updated) });
});

// Sends the listing to the platform admins. A suspended listing can be fixed and sent again.
vendorsRouter.post("/mine/:vendorId/submit", requireUser, async (req, res) => {
  const vendor = await ownVendor(req);
  if (vendor.status !== "DRAFT" && vendor.status !== "SUSPENDED") throw new HttpError(409, "This listing is already sent for review or published.");
  const missing: Record<string, string[]> = {};
  if (!vendor.descriptionKm && !vendor.descriptionEn) missing.descriptionKm = ["Describe your services."];
  if (!vendor.phone && !vendor.telegram) missing.phone = ["Add a phone number or Telegram username."];
  if (!(vendor.photos as Photo[]).length) missing.photos = ["Add at least one photo of your work."];
  if (Object.keys(missing).length) throw new HttpError(400, "Complete your listing before sending it for review.", missing);
  const updated = await prisma.vendor.update({ where: { id: vendor.id }, data: { status: "PENDING_REVIEW" } });
  res.json({ vendor: await withRating(updated) });
});

vendorsRouter.get("/mine/:vendorId/enquiries", requireUser, async (req, res) => {
  const vendor = await ownVendor(req);
  const enquiries = await prisma.vendorEnquiry.findMany({ where: { vendorId: vendor.id }, orderBy: { createdAt: "desc" }, take: 200 });
  res.json({
    enquiries: enquiries.map((e) => ({ id: e.id, name: e.name, phone: e.phone, eventDate: e.eventDate, message: e.message, read: e.readAt !== null, createdAt: e.createdAt })),
  });
});

vendorsRouter.post("/mine/:vendorId/enquiries/read", requireUser, async (req, res) => {
  const vendor = await ownVendor(req);
  await prisma.vendorEnquiry.updateMany({ where: { vendorId: vendor.id, readAt: null }, data: { readAt: new Date() } });
  res.status(204).end();
});

vendorsRouter.put("/mine/:vendorId/reviews/:reviewId/reply", requireUser, async (req, res) => {
  const vendor = await ownVendor(req);
  const { reply } = parse(replySchema, req.body);
  const reviewId = req.params.reviewId;
  const review = isUuid(reviewId) ? await prisma.vendorReview.findFirst({ where: { id: reviewId, vendorId: vendor.id } }) : null;
  if (!review) throw new HttpError(404, "Review not found.");
  const updated = await prisma.vendorReview.update({ where: { id: review.id }, data: { reply, repliedAt: new Date() }, include: { user: { select: { name: true } } } });
  res.json({ review: reviewView(updated) });
});

// Paying to be listed first: an order paid to the platform's KHQR, confirmed by an admin.
const featuredSchema = z.object({ days: z.coerce.number().int() });

vendorsRouter.get("/mine/:vendorId/featured", requireUser, async (req, res) => {
  const vendor = await ownVendor(req);
  const orders = await prisma.planOrder.findMany({ where: { vendorId: vendor.id }, orderBy: { createdAt: "desc" } });
  res.json({
    featuredUntil: vendor.featuredUntil,
    canBuy: vendor.status === "PUBLISHED",
    packages: FEATURED_PACKAGES,
    pending: orders.filter((o) => o.status === "PENDING").map(orderView)[0] ?? null,
    orders: orders.map(orderView),
    platformKhqr: Boolean(config.platformKhqrImage()),
  });
});

vendorsRouter.post("/mine/:vendorId/featured/orders", requireUser, async (req, res) => {
  const vendor = await ownVendor(req);
  const { days } = parse(featuredSchema, req.body);
  const pack = FEATURED_PACKAGES.find((p) => p.units === days);
  if (!pack) throw new HttpError(400, "Choose a package.", { days: ["Choose a package."] });
  if (vendor.status !== "PUBLISHED") throw new HttpError(409, "Only published listings can be featured.");
  const order = await placeOrder({ purpose: "VENDOR_FEATURED", vendorId: vendor.id, units: pack.units, amount: pack.price, userId: currentUser(req).id });
  res.status(201).json({ order: orderView(order) });
});

vendorsRouter.post("/mine/:vendorId/featured/orders/:orderId/cancel", requireUser, async (req, res) => {
  const vendor = await ownVendor(req);
  const id = req.params.orderId;
  await cancelOrder(isUuid(id) ? await prisma.planOrder.findFirst({ where: { id, vendorId: vendor.id } }) : null);
  res.status(204).end();
});

// --- Profiles, enquiries and reviews ----------------------------------------------------------

vendorsRouter.get("/:slug", async (req, res) => {
  const vendor = await publishedVendor(req.params.slug);
  const reviews = await prisma.vendorReview.findMany({
    where: { vendorId: vendor.id, hiddenAt: null },
    include: { user: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  // What the signed-in visitor can do here: review only after an enquiry.
  let viewer = null;
  if (req.user) {
    const [enquired, mine] = await Promise.all([
      prisma.vendorEnquiry.count({ where: { vendorId: vendor.id, userId: req.user.id } }),
      prisma.vendorReview.findUnique({ where: { vendorId_userId: { vendorId: vendor.id, userId: req.user.id } } }),
    ]);
    viewer = {
      isOwner: vendor.ownerId === req.user.id,
      enquired: enquired > 0,
      canReview: enquired > 0 && vendor.ownerId !== req.user.id,
      myReview: mine ? { rating: mine.rating, text: mine.text } : null,
    };
  }
  res.json({ vendor: vendorProfile(vendor, (await ratings([vendor.id])).get(vendor.id)), reviews: reviews.map(reviewView), viewer });
});

vendorsRouter.post("/:slug/enquiries", requireUser, async (req, res) => {
  const vendor = await publishedVendor(req.params.slug);
  const data = parse(enquirySchema, req.body);
  const user = currentUser(req);
  if (data.eventId) {
    const member = await hostMembership(data.eventId, user);
    if (!member || member.role !== "OWNER") throw new HttpError(404, "Event not found.");
  }
  await rateLimit(`vendor-enquiry:${user.id}`, 20, 60 * 60, "Too many enquiries. Try again later.");
  const enquiry = await prisma.vendorEnquiry.create({ data: { ...data, vendorId: vendor.id, userId: user.id } });
  await notify({ kind: "vendor_enquiry", enquiryId: enquiry.id });
  res.status(201).json({ enquiry: { id: enquiry.id, createdAt: enquiry.createdAt } });
});

const reportSchema = z.object({
  reason: z.enum(["FAKE", "INAPPROPRIATE", "SPAM", "OTHER"], { message: "Choose a reason." }),
  note: optionalText(500),
  reviewId: z
    .string()
    .nullish()
    .transform((v) => v || null)
    .refine((v) => v === null || isUuid(v), "Review not found."),
});

// Flags the vendor (or one of its reviews) for the platform admins.
vendorsRouter.post("/:slug/reports", requireUser, async (req, res) => {
  const vendor = await publishedVendor(req.params.slug);
  const data = parse(reportSchema, req.body);
  const user = currentUser(req);
  if (data.reviewId && !(await prisma.vendorReview.findFirst({ where: { id: data.reviewId, vendorId: vendor.id, hiddenAt: null } }))) {
    throw new HttpError(404, "Review not found.");
  }
  await rateLimit(`vendor-report:${user.id}`, 10, 60 * 60, "Too many reports. Try again later.");
  const open = await prisma.report.findFirst({ where: { userId: user.id, vendorId: vendor.id, reviewId: data.reviewId, resolvedAt: null } });
  if (open) throw new HttpError(409, "You already reported this. The team will look at it.");
  await prisma.report.create({ data: { ...data, vendorId: vendor.id, userId: user.id } });
  res.status(201).json({ reported: true });
});

// One review per host per vendor, from hosts who contacted the vendor; sending again edits it.
vendorsRouter.put("/:slug/reviews", requireUser, async (req, res) => {
  const vendor = await publishedVendor(req.params.slug);
  const { rating, text } = parse(reviewSchema, req.body);
  const user = currentUser(req);
  if (vendor.ownerId === user.id) throw new HttpError(403, "You can't review your own business.");
  const enquired = await prisma.vendorEnquiry.count({ where: { vendorId: vendor.id, userId: user.id } });
  if (!enquired) throw new HttpError(403, "Send this vendor an enquiry before reviewing them.");
  const review = await prisma.vendorReview.upsert({
    where: { vendorId_userId: { vendorId: vendor.id, userId: user.id } },
    create: { vendorId: vendor.id, userId: user.id, rating, text },
    update: { rating, text },
    include: { user: { select: { name: true } } },
  });
  res.json({ review: reviewView(review) });
});
