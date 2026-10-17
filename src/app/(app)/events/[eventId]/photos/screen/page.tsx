import { notFound } from "next/navigation";
import type { HostEvent } from "@api/contract";
import { getLocale, getMessages } from "@/i18n";
import { apiGet } from "@/lib/api";
import { WallScreen } from "./wall-screen";

export default async function WallScreenPage({ params }: PageProps<"/events/[eventId]/photos/screen">) {
  const { eventId } = await params;
  const [t, locale, { event }] = await Promise.all([getMessages(), getLocale(), apiGet<{ event: HostEvent }>(`/events/${eventId}`)]);
  if (!event.features.photoWall) notFound();
  const title = locale === "en" && event.titleEn ? event.titleEn : event.titleKm;
  return <WallScreen eventId={eventId} title={title} byLabel={t.wall.by} emptyLabel={t.wall.empty} />;
}
