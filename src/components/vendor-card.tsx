import Link from "next/link";
import type { VendorCard as Card } from "@api/contract";
import { formatAmount } from "@api/lib/money";
import { PROVINCES, VENDOR_CATEGORIES, type Province } from "@api/lib/vendor-catalog";
import { fill } from "@/i18n/format";
import type { Locale } from "@/i18n";
import type { Messages } from "@/i18n/km";

export const categoryName = (category: Card["category"], locale: Locale) => VENDOR_CATEGORIES[category][locale];
export const provinceName = (province: string, locale: Locale) => PROVINCES[province as Province]?.[locale] ?? province;

/** ★ rating with the number of reviews, or "No reviews yet". */
export function Stars({ rating, count, t }: { rating: number | null; count: number; t: Messages["vendors"] }) {
  if (rating === null) return <span className="text-sm text-muted">{t.noReviews}</span>;
  return (
    <span className="text-sm">
      <span className="text-amber-500" aria-hidden>
        {"★".repeat(Math.round(rating))}
        <span className="text-zinc-300">{"★".repeat(5 - Math.round(rating))}</span>
      </span>{" "}
      {rating.toFixed(1)} <span className="text-muted">· {fill(t.reviewCount, { count })}</span>
    </span>
  );
}

export function VendorCard({ vendor, locale, t }: { vendor: Card; locale: Locale; t: Messages["vendors"] }) {
  return (
    <Link href={`/vendors/${vendor.slug}`} className="flex w-full flex-col overflow-hidden rounded-xl border border-line hover:bg-black/5">
      <div className="relative aspect-[3/2] bg-black/5">
        {vendor.coverKey && (
          // eslint-disable-next-line @next/next/no-img-element -- stored photos are already resized WebP
          <img src={`/api/files/${vendor.coverKey}`} alt="" className="h-full w-full object-cover" loading="lazy" />
        )}
        {vendor.featured && <span className="absolute left-2 top-2 rounded-full bg-amber-400 px-2 py-0.5 text-xs font-semibold text-amber-950">{t.featured}</span>}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <div className="flex items-center gap-2">
          {vendor.logoKey && (
            // eslint-disable-next-line @next/next/no-img-element -- stored photos are already resized WebP
            <img src={`/api/files/${vendor.logoKey}`} alt="" className="h-8 w-8 rounded-full object-cover" />
          )}
          <span className="font-semibold">{vendor.name}</span>
        </div>
        <span className="text-sm text-muted">
          {categoryName(vendor.category, locale)} · {provinceName(vendor.province, locale)}
        </span>
        <Stars rating={vendor.rating} count={vendor.reviewCount} t={t} />
        {vendor.priceFrom !== null && <span className="text-sm font-medium">{fill(t.priceFrom, { price: formatAmount(vendor.priceFrom, vendor.priceCurrency, locale === "km") })}</span>}
      </div>
    </Link>
  );
}
