import Link from "next/link";
import type { HostEvent } from "@api/contract";
import { DeskApp } from "@/components/desk/desk-app";
import { EventNav } from "@/components/event-nav";
import { getLocale, getMessages } from "@/i18n";
import { apiGet } from "@/lib/api";

// The guest desk for hosts; helpers use the same desk at /desk.
export default async function CheckinPage({ params }: PageProps<"/events/[eventId]/checkin">) {
  const { eventId } = await params;
  const [t, locale, { event }] = await Promise.all([getMessages(), getLocale(), apiGet<{ event: HostEvent }>(`/events/${eventId}`)]);
  const title = locale === "en" && event.titleEn ? event.titleEn : event.titleKm;
  return (
    <div className="flex flex-col gap-6 py-8">
      <div>
        <Link href="/dashboard" className="text-sm text-muted">
          ← {t.dashboard.title}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">{title}</h1>
      </div>
      <EventNav eventId={eventId} active="checkin" t={t.nav} />
      <DeskApp eventId={eventId} t={t.desk} sides={t.side} rsvp={t.rsvp} />
    </div>
  );
}
