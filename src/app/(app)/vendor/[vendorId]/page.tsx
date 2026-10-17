import Link from "next/link";
import type { MyVendorResponse, VendorEnquiriesResponse } from "@api/contract";
import { markEnquiriesRead, removeVendorPhoto, uploadVendorPhotos } from "@/app/actions/vendors";
import { secondaryButtonClass } from "@/components/form";
import { UploadForm } from "@/components/upload-form";
import { Stars } from "@/components/vendor-card";
import { getLocale, getMessages } from "@/i18n";
import { fill } from "@/i18n/format";
import { apiGet } from "@/lib/api";
import { formatDateTime, formatDay } from "@/lib/dates";
import { ReplyForm, SubmitForReview, VendorForm } from "../forms";

const statusStyle = {
  DRAFT: "bg-amber-50 text-amber-900",
  PENDING_REVIEW: "bg-sky-50 text-sky-900",
  PUBLISHED: "bg-emerald-50 text-emerald-900",
  SUSPENDED: "bg-red-50 text-red-800",
};

export default async function MyVendorPage({ params }: PageProps<"/vendor/[vendorId]">) {
  const { vendorId } = await params;
  const [t, locale, { vendor, reviews }, { enquiries }] = await Promise.all([
    getMessages(),
    getLocale(),
    apiGet<MyVendorResponse>(`/vendors/mine/${vendorId}`),
    apiGet<VendorEnquiriesResponse>(`/vendors/mine/${vendorId}/enquiries`),
  ]);
  const unread = enquiries.filter((e) => !e.read).length;
  return (
    <div className="flex flex-col gap-8 py-8">
      <div>
        <Link href="/vendor" className="text-sm text-muted">
          ← {t.vendors.mine}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">{vendor.name}</h1>
        <Stars rating={vendor.rating} count={vendor.reviewCount} t={t.vendors} />
      </div>

      <section className={`flex flex-col gap-3 rounded-xl p-4 ${statusStyle[vendor.status]}`} data-testid="vendor-status">
        <p className="font-semibold">{t.vendors.status[vendor.status]}</p>
        <p className="text-sm">{t.vendors.statusHint[vendor.status]}</p>
        {vendor.reviewNote && <p className="text-sm">{fill(t.vendors.reviewNote, { note: vendor.reviewNote })}</p>}
        {(vendor.status === "DRAFT" || vendor.status === "SUSPENDED") && <SubmitForReview vendorId={vendor.id} t={t.vendors} />}
        {vendor.status === "PUBLISHED" && (
          <Link href={`/vendors/${vendor.slug}`} className={`${secondaryButtonClass} self-start bg-white`}>
            {t.vendors.viewPage}
          </Link>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">
            {t.vendors.enquiries} {unread > 0 && <span className="ml-1 rounded-full bg-accent px-2 py-0.5 text-xs text-white">{unread}</span>}
          </h2>
          {unread > 0 && (
            <form action={markEnquiriesRead.bind(null, vendor.id)}>
              <button className="text-sm text-muted underline">✓</button>
            </form>
          )}
        </div>
        {enquiries.length === 0 ? (
          <p className="text-sm text-muted">{t.vendors.noEnquiries}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line rounded-xl border border-line">
            {enquiries.map((e) => (
              <li key={e.id} className="flex flex-col gap-1 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">
                    {e.name} {!e.read && <span className="ml-1 rounded-full bg-accent px-2 py-0.5 text-xs text-white">{t.vendors.newBadge}</span>}
                  </span>
                  <a href={`tel:${e.phone}`} className="text-sm underline">
                    {e.phone}
                  </a>
                </div>
                {e.eventDate && (
                  <span className="text-sm text-muted">
                    {t.vendors.eventDate}: {formatDay(e.eventDate, locale)}
                  </span>
                )}
                <p className="whitespace-pre-line">{e.message}</p>
                <span className="text-xs text-muted">{formatDateTime(e.createdAt, locale)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">{t.vendors.photos}</h2>
        {vendor.photos.length > 0 && (
          <ul className="grid grid-cols-3 gap-2">
            {vendor.photos.map((p) => (
              <li key={p.key} className="flex flex-col gap-1">
                {/* eslint-disable-next-line @next/next/no-img-element -- stored photos are already resized WebP */}
                <img src={`/api/files/${p.key}`} alt="" className="aspect-square w-full rounded-lg object-cover" />
                <form action={removeVendorPhoto.bind(null, vendor.id, p.key)}>
                  <button className="text-xs text-muted underline">{t.vendors.remove}</button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <UploadForm action={uploadVendorPhotos.bind(null, vendor.id)} name="photos" label={t.vendors.addPhotos} multiple />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">{t.vendors.details}</h2>
        <VendorForm vendor={vendor} t={t.vendors} locale={locale} />
      </section>

      {reviews.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="font-semibold">{t.vendors.reviews}</h2>
          <ul className="flex flex-col gap-3">
            {reviews.map((r) => (
              <li key={r.id} className="flex flex-col gap-2 rounded-xl border border-line p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{r.author}</span>
                  <span className="text-amber-500">{"★".repeat(r.rating)}</span>
                </div>
                {r.text && <p className="whitespace-pre-line">{r.text}</p>}
                {r.hidden && <span className="text-xs text-red-700">{t.vendors.hiddenReview}</span>}
                <ReplyForm vendorId={vendor.id} reviewId={r.id} reply={r.reply} t={t.vendors} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
