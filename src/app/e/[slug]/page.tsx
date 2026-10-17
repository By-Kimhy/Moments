import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import type { PublicTicketEvent } from "@api/contract";
import { getMessages } from "@/i18n";
import { ApiError, api } from "@/lib/api";
import { invitationDate } from "@/lib/dates";
import { invitationLocale } from "@/lib/invitation";
import { TicketShop } from "./ticket-shop";

const getEvent = cache(async (slug: string) => {
  try {
    return await api.get<PublicTicketEvent>(`/public/events/${encodeURIComponent(slug)}`);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
});

export async function generateMetadata({ params, searchParams }: PageProps<"/e/[slug]">): Promise<Metadata> {
  const [{ slug }, { lang }] = await Promise.all([params, searchParams]);
  const { event } = await getEvent(slug);
  const en = lang === "en";
  const title = (en ? event.titleEn || event.titleKm : event.titleKm) ?? "";
  const { date, time } = invitationDate(event.startsAt, en ? "en" : "km");
  const description = [`${date} ${time}`, en ? event.venueEn || event.venueKm : event.venueKm || event.venueEn].filter(Boolean).join(" · ");
  const image = event.photos[0] ? `/api/files/${event.photos[0].key}/og.jpg` : "/og-default.png";
  return { title, description, openGraph: { title, description, images: [{ url: image, width: 1200, height: 630 }] } };
}

export default async function TicketPage({ params, searchParams }: PageProps<"/e/[slug]">) {
  const [{ slug }, { lang }] = await Promise.all([params, searchParams]);
  const [{ event, ticketTypes }, locale] = await Promise.all([getEvent(slug), invitationLocale(lang)]);
  const t = await getMessages(locale);
  const km = locale === "km";
  const pick = (a: string | null, b: string | null) => (km ? a || b : b || a) ?? "";
  const { date, time } = invitationDate(event.startsAt, locale);
  const accent = event.planner?.brandColor ?? "#9b2c2c";
  return (
    <div lang={locale} className="min-h-screen bg-background" style={{ ["--color-accent" as string]: accent }}>
      <div className="mx-auto flex max-w-xl flex-col gap-5 px-4 pb-16 pt-4">
        <div className="flex justify-end">
          <Link href={`/e/${slug}?lang=${km ? "en" : "km"}`} className="rounded-full border border-line px-3 py-1 text-sm">
            {t.invite.switchLang}
          </Link>
        </div>
        {event.photos[0] && (
          // eslint-disable-next-line @next/next/no-img-element -- stored photos are already resized
          <img src={`/api/files/${event.photos[0].key}`} alt="" className="aspect-video w-full rounded-2xl object-cover" />
        )}
        <h1 className="text-3xl font-bold" style={{ color: accent }}>
          {pick(event.titleKm, event.titleEn)}
        </h1>
        <div className="rounded-2xl border border-line p-4">
          <p className="font-semibold">{date}</p>
          <p>
            {t.invite.time} {time}
          </p>
          {pick(event.venueKm, event.venueEn) && <p className="mt-2">{pick(event.venueKm, event.venueEn)}</p>}
          {event.mapUrl && (
            <a href={event.mapUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm underline">
              {t.invite.map}
            </a>
          )}
        </div>
        {pick(event.descriptionKm, event.descriptionEn) && <p className="whitespace-pre-line">{pick(event.descriptionKm, event.descriptionEn)}</p>}
        <TicketShop slug={slug} language={locale} ticketTypes={ticketTypes} t={t.shop} />
        <p className="text-center text-xs text-muted">{event.planner ? t.invite.plannedBy.replace("{name}", event.planner.name) : t.invite.footer}</p>
      </div>
    </div>
  );
}
