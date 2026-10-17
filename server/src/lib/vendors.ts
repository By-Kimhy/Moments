// Vendor marketplace: what the directory, a profile and the vendor's own dashboard show.
import type { Prisma, Vendor } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { prisma } from "../db.js";
import type { Photo } from "./events.js";

export const MAX_VENDOR_PHOTOS = 12;
export const DIRECTORY_PAGE_SIZE = 24;

export type Rating = { rating: number | null; reviewCount: number };

/** Average rating of the visible reviews, per vendor. */
export async function ratings(vendorIds: string[]): Promise<Map<string, Rating>> {
  const rows = await prisma.vendorReview.groupBy({
    by: ["vendorId"],
    where: { vendorId: { in: vendorIds }, hiddenAt: null },
    _avg: { rating: true },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.vendorId, { rating: r._avg.rating === null ? null : Math.round(r._avg.rating * 10) / 10, reviewCount: r._count._all }]));
}

const noRating: Rating = { rating: null, reviewCount: 0 };
export const isFeatured = (v: Pick<Vendor, "featuredUntil">, now = new Date()) => Boolean(v.featuredUntil && v.featuredUntil > now);

/** A directory card. */
export const vendorCard = (v: Vendor, rating: Rating = noRating) => ({
  slug: v.slug,
  name: v.name,
  category: v.category,
  province: v.province,
  priceFrom: v.priceFrom,
  priceCurrency: v.priceCurrency,
  logoKey: v.logoKey,
  coverKey: (v.photos as Photo[])[0]?.key ?? null,
  featured: isFeatured(v),
  ...rating,
});

/** The public profile. */
export const vendorProfile = (v: Vendor, rating: Rating = noRating) => ({
  ...vendorCard(v, rating),
  id: v.id, // for hosts saving it to an event
  descriptionKm: v.descriptionKm,
  descriptionEn: v.descriptionEn,
  phone: v.phone,
  telegram: v.telegram,
  facebookUrl: v.facebookUrl,
  photos: v.photos as Photo[],
});

/** Everything, for the vendor's owner and platform admins. */
export const ownerVendorView = (v: Vendor, rating: Rating = noRating) => ({
  ...vendorProfile(v, rating),
  status: v.status,
  reviewNote: v.reviewNote,
  featuredUntil: v.featuredUntil,
  publishedAt: v.publishedAt,
  createdAt: v.createdAt,
  updatedAt: v.updatedAt,
});

/** Directory order: featured vendors first, then the best rated, then the newest. */
export function directoryOrder<T extends { featured: boolean; rating: number | null; reviewCount: number; publishedAt?: Date | null }>(a: T, b: T) {
  if (a.featured !== b.featured) return a.featured ? -1 : 1;
  if ((b.rating ?? 0) !== (a.rating ?? 0)) return (b.rating ?? 0) - (a.rating ?? 0);
  if (b.reviewCount !== a.reviewCount) return b.reviewCount - a.reviewCount;
  return (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0);
}

/** A link name from the vendor's name, or a random one for names without Latin letters. */
export async function newVendorSlug(name: string, db: Prisma.TransactionClient = prisma) {
  const base = name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50)
    .replace(/-+$/, "");
  const suffix = () => randomBytes(3).toString("hex");
  if (base.length >= 3 && !(await db.vendor.findUnique({ where: { slug: base }, select: { id: true } }))) return base;
  return base.length >= 3 ? `${base}-${suffix()}` : `vendor-${suffix()}`;
}
