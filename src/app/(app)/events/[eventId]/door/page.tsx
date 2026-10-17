import Link from "next/link";
import type { HostEvent } from "@api/contract";
import { DoorApp } from "@/components/desk/door-app";
import { EventNav } from "@/components/event-nav";
import { getLocale, getMessages } from "@/i18n";
import { apiGet } from "@/lib/api";
import { requireUser } from "@/lib/dal";

// The door for the organizer; helpers with the helper code get the same door at /desk.
export default async function DoorPage({ params }: PageProps<"/events/[eventId]/door">) {
  const { eventId } = await params;
  const [t, locale, { event }, user] = await Promise.all([getMessages(), getLocale(), apiGet<{ event: HostEvent }>(`/events/${eventId}`), requireUser()]);
  const title = locale === "en" && event.titleEn ? event.titleEn : event.titleKm;
  return (
    <div className="flex flex-col gap-6 py-8">
      <div>
        <Link href="/dashboard" className="text-sm text-muted">
          ← {t.dashboard.title}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">{title}</h1>
      </div>
      <EventNav eventId={eventId} active="door" t={t.nav} type="TICKETED" />
      <DoorApp eventId={eventId} memberName={user.name} t={t.door} desk={t.desk} />
    </div>
  );
}
