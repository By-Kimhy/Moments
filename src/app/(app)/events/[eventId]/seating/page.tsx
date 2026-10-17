import Link from "next/link";
import type { HostEvent, SeatingPlan } from "@api/contract";
import { EventNav } from "@/components/event-nav";
import { UpgradeNotice } from "@/components/upgrade-notice";
import { getLocale, getMessages } from "@/i18n";
import { apiGet } from "@/lib/api";
import { SeatingBoard } from "./seating-board";

export default async function SeatingPage({ params }: PageProps<"/events/[eventId]/seating">) {
  const { eventId } = await params;
  const [t, locale, { event }, plan] = await Promise.all([
    getMessages(),
    getLocale(),
    apiGet<{ event: HostEvent }>(`/events/${eventId}`),
    apiGet<SeatingPlan>(`/events/${eventId}/seating`),
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
      <EventNav eventId={eventId} active="seating" t={t.nav} />
      {event.features.seating ? (
        <SeatingBoard eventId={eventId} initial={plan} locale={locale} t={t.seating} sides={t.side} />
      ) : (
        <UpgradeNotice eventId={eventId} t={t.plans} />
      )}
    </div>
  );
}
