import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import type { EventsResponse, VendorPageResponse } from "@api/contract";
import { formatAmount } from "@api/lib/money";
import { buttonClass, secondaryButtonClass } from "@/components/form";
import { Stars, categoryName, provinceName } from "@/components/vendor-card";
import { getLocale, getMessages } from "@/i18n";
import { fill } from "@/i18n/format";
import { ApiError, api } from "@/lib/api";
import { getOptionalUser } from "@/lib/dal";
import { formatDateTime } from "@/lib/dates";
import { EnquiryForm, ReportForm, ReviewForm, ShortlistForm } from "./forms";

const getVendor = cache(async (slug: string) => {
  try {
    return await api.get<VendorPageResponse>(`/vendors/${encodeURIComponent(slug)}`);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
});

export async function generateMetadata({ params }: PageProps<"/vendors/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const [{ vendor }, locale] = await Promise.all([getVendor(slug), getLocale()]);
  const title = `${vendor.name} · ${categoryName(vendor.category, locale)}`;
  const description = ((locale === "en" ? vendor.descriptionEn || vendor.descriptionKm : vendor.descriptionKm || vendor.descriptionEn) ?? "").slice(0, 200);
  const image = vendor.photos[0] ? `/api/files/${vendor.photos[0].key}/og.jpg` : "/og-default.png";
  return { title, description, openGraph: { title, description, images: [{ url: image, width: 1200, height: 630 }] } };
}

export default async function VendorPage({ params }: PageProps<"/vendors/[slug]">) {
  const { slug } = await params;
  const [{ vendor, reviews, viewer }, t, locale, user] = await Promise.all([getVendor(slug), getMessages(), getLocale(), getOptionalUser()]);
  const events = user ? (await api.get<EventsResponse>("/events")).events : [];
  const description = locale === "en" ? vendor.descriptionEn || vendor.descriptionKm : vendor.descriptionKm || vendor.descriptionEn;
  const eventOptions = events.map((e) => ({ id: e.id, title: locale === "en" && e.titleEn ? e.titleEn : e.titleKm }));
  return (
    <div className="flex flex-col gap-6 py-8">
      <Link href="/vendors" className="text-sm text-muted">
        ← {t.vendors.title}
      </Link>
      {vendor.photos.length > 0 && (
        <div className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4">
          {vendor.photos.map((p) => (
            // eslint-disable-next-line @next/next/no-img-element -- stored photos are already resized WebP
            <img key={p.key} src={`/api/files/${p.key}`} alt="" className="aspect-[3/2] w-[85%] shrink-0 snap-center rounded-xl object-cover sm:w-[60%]" />
          ))}
        </div>
      )}
      <div className="flex items-start gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- stored photos are already resized WebP */}
        {vendor.logoKey && <img src={`/api/files/${vendor.logoKey}`} alt="" className="h-14 w-14 rounded-full object-cover" />}
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">{vendor.name}</h1>
          <span className="text-muted">
            {categoryName(vendor.category, locale)} · {provinceName(vendor.province, locale)}
          </span>
          <Stars rating={vendor.rating} count={vendor.reviewCount} t={t.vendors} />
          {vendor.priceFrom !== null && (
            <span className="font-medium">{fill(t.vendors.priceFrom, { price: formatAmount(vendor.priceFrom, vendor.priceCurrency, locale === "km") })}</span>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {vendor.phone && (
          <a href={`tel:${vendor.phone}`} className={buttonClass}>
            {t.vendors.call}
          </a>
        )}
        {vendor.telegram && (
          <a href={`https://t.me/${vendor.telegram}`} className={secondaryButtonClass} target="_blank" rel="noreferrer">
            {t.vendors.telegram}
          </a>
        )}
        {vendor.facebookUrl && (
          <a href={vendor.facebookUrl} className={secondaryButtonClass} target="_blank" rel="noreferrer">
            {t.vendors.facebook}
          </a>
        )}
      </div>
      {description && (
        <section className="flex flex-col gap-2">
          <h2 className="font-semibold">{t.vendors.about}</h2>
          <p className="whitespace-pre-line">{description}</p>
        </section>
      )}

      {!user ? (
        <Link href={`/login?next=/vendors/${vendor.slug}`} className={`${secondaryButtonClass} self-start`}>
          {t.vendors.signInToContact}
        </Link>
      ) : (
        !viewer?.isOwner && (
          <>
            {eventOptions.length > 0 && (
              <details className="rounded-xl border border-line p-4">
                <summary className="cursor-pointer font-semibold">{t.vendors.saveToEvent}</summary>
                <ShortlistForm vendorId={vendor.id} events={eventOptions} t={t.vendors} />
              </details>
            )}
            <section className="flex flex-col gap-3 rounded-xl border border-line p-4">
              <h2 className="font-semibold">{t.vendors.enquiry}</h2>
              <p className="text-sm text-muted">{t.vendors.enquiryHint}</p>
              <EnquiryForm slug={vendor.slug} name={user.name} phone={user.phone ?? ""} events={eventOptions} t={t.vendors} />
            </section>
          </>
        )
      )}

      {user && !viewer?.isOwner && <ReportForm slug={vendor.slug} label={t.vendors.report} t={t.vendors} />}

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">{t.vendors.reviews}</h2>
        {viewer?.canReview ? (
          <details className="rounded-xl border border-line p-4" open={!viewer.myReview}>
            <summary className="cursor-pointer font-medium">{viewer.myReview ? t.vendors.editReview : t.vendors.writeReview}</summary>
            <ReviewForm slug={vendor.slug} initial={viewer.myReview} t={t.vendors} />
          </details>
        ) : (
          user && !viewer?.isOwner && <p className="text-sm text-muted">{t.vendors.reviewHint}</p>
        )}
        {reviews.length === 0 ? (
          <p className="text-sm text-muted">{t.vendors.noReviews}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {reviews.map((r) => (
              <li key={r.id} className="flex flex-col gap-1 py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{r.author}</span>
                  <span className="text-amber-500" aria-label={`${r.rating}/5`}>
                    {"★".repeat(r.rating)}
                    <span className="text-zinc-300">{"★".repeat(5 - r.rating)}</span>
                  </span>
                </div>
                {r.text && <p className="whitespace-pre-line">{r.text}</p>}
                <span className="text-xs text-muted">{formatDateTime(r.createdAt, locale)}</span>
                {user && !viewer?.isOwner && <ReportForm slug={vendor.slug} reviewId={r.id} label={t.vendors.reportReview} t={t.vendors} />}
                {r.reply && (
                  <div className="mt-1 rounded-lg bg-black/5 p-3 text-sm">
                    <span className="font-medium">{t.vendors.reply}</span>
                    <p className="whitespace-pre-line">{r.reply}</p>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
