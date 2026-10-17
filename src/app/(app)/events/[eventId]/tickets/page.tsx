import Link from "next/link";
import type { HostEvent, OrdersResponse, TicketTypeRow } from "@api/contract";
import { EventNav } from "@/components/event-nav";
import { getLocale, getMessages } from "@/i18n";
import { apiGet } from "@/lib/api";
import { TicketsBoard } from "./tickets-board";

export default async function TicketsPage({ params }: PageProps<"/events/[eventId]/tickets">) {
  const { eventId } = await params;
  const [t, locale, { event }, types, orders] = await Promise.all([
    getMessages(),
    getLocale(),
    apiGet<{ event: HostEvent }>(`/events/${eventId}`),
    apiGet<{ ticketTypes: TicketTypeRow[] }>(`/events/${eventId}/ticket-types`),
    apiGet<OrdersResponse>(`/events/${eventId}/orders`),
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
      <EventNav eventId={eventId} active="tickets" t={t.nav} type="TICKETED" />
      {!event.slug && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{t.tickets.needSlug}</p>}
      {!event.khqrImageKey && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{t.tickets.needKhqr}</p>}
      {event.slug && (
        <Link href={`/e/${event.slug}`} className="self-start text-sm underline">
          {t.tickets.publicPage}: /e/{event.slug}
        </Link>
      )}
      <TicketsBoard eventId={eventId} initialTypes={types.ticketTypes} initialOrders={orders} t={t.tickets} usd={t.desk.usd} khr={t.desk.khr} />
    </div>
  );
}
