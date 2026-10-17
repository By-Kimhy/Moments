import Link from "next/link";
import type { EventVendorsResponse, HostEvent } from "@api/contract";
import { removeShortlisted } from "@/app/actions/vendors";
import { EventNav } from "@/components/event-nav";
import { buttonClass } from "@/components/form";
import { categoryName } from "@/components/vendor-card";
import { getLocale, getMessages } from "@/i18n";
import { apiGet } from "@/lib/api";
import { ShortlistRow } from "./shortlist-row";

// The vendors the hosts are considering or have booked for this event.
export default async function EventVendorsPage({ params }: PageProps<"/events/[eventId]/vendors">) {
  const { eventId } = await params;
  const [t, locale, { event }, { vendors }] = await Promise.all([
    getMessages(),
    getLocale(),
    apiGet<{ event: HostEvent }>(`/events/${eventId}`),
    apiGet<EventVendorsResponse>(`/events/${eventId}/vendors`),
  ]);
  const title = locale === "en" && event.titleEn ? event.titleEn : event.titleKm;
  return (
    <div className="flex flex-col gap-6 py-8">
      <div>
        <Link href="/dashboard" className="text-sm text-muted">
          ← {t.dashboard.title}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">{title}</h1>
      </div>
      <EventNav eventId={eventId} active="vendors" t={t.nav} type={event.type} />
      <Link href="/vendors" className={`${buttonClass} self-start`}>
        {t.vendors.find}
      </Link>
      {vendors.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line p-8 text-center text-muted">{t.vendors.eventEmpty}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {vendors.map((row) => (
            <li key={row.vendorId} className="flex flex-col gap-2 rounded-xl border border-line p-4" data-testid="shortlist-row">
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-col">
                  {row.listed ? (
                    <Link href={`/vendors/${row.vendor.slug}`} className="font-semibold underline">
                      {row.vendor.name}
                    </Link>
                  ) : (
                    <span className="font-semibold">
                      {row.vendor.name} <span className="text-xs font-normal text-muted">({t.vendors.unlisted})</span>
                    </span>
                  )}
                  <span className="text-sm text-muted">{categoryName(row.vendor.category, locale)}</span>
                  <span className="flex gap-3 text-sm">
                    {row.vendor.phone && (
                      <a href={`tel:${row.vendor.phone}`} className="underline">
                        {row.vendor.phone}
                      </a>
                    )}
                    {row.vendor.telegram && (
                      <a href={`https://t.me/${row.vendor.telegram}`} className="underline" target="_blank" rel="noreferrer">
                        @{row.vendor.telegram}
                      </a>
                    )}
                  </span>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${row.status === "BOOKED" ? "bg-emerald-100 text-emerald-900" : "bg-black/5"}`}>
                  {t.vendors.shortlist[row.status]}
                </span>
              </div>
              <ShortlistRow eventId={eventId} vendorId={row.vendorId} status={row.status} note={row.note} t={t.vendors} />
              <form action={removeShortlisted.bind(null, eventId, row.vendorId)}>
                <button className="text-xs text-muted underline">{t.vendors.remove}</button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
