import Link from "next/link";
import type { HostEvent, ThankYouResponse } from "@api/contract";
import { EventNav } from "@/components/event-nav";
import { getLocale, getMessages } from "@/i18n";
import { apiGet } from "@/lib/api";
import { ThankYouBoard } from "./thank-you-board";

export default async function ThankYouPage({ params }: PageProps<"/events/[eventId]/thank-you">) {
  const { eventId } = await params;
  const [t, locale, { event }, data] = await Promise.all([
    getMessages(),
    getLocale(),
    apiGet<{ event: HostEvent }>(`/events/${eventId}`),
    apiGet<ThankYouResponse>(`/events/${eventId}/thank-you`),
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
      <EventNav eventId={eventId} active="thanks" t={t.nav} />
      <ThankYouBoard eventId={eventId} initial={data} t={t.thanks} />
    </div>
  );
}
