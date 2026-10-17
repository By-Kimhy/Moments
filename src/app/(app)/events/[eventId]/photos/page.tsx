import Link from "next/link";
import type { HostEvent, HostWallResponse } from "@api/contract";
import { deleteWallPhoto, setWallPhotoHidden } from "@/app/actions/photo-wall";
import { EventNav } from "@/components/event-nav";
import { buttonClass } from "@/components/form";
import { UpgradeNotice } from "@/components/upgrade-notice";
import { getLocale, getMessages } from "@/i18n";
import { fill } from "@/i18n/format";
import { apiGet } from "@/lib/api";
import { localDigits } from "@/lib/dates";

// Guests' photos of the day, for the hosts to look through, hide or delete.
export default async function PhotosPage({ params }: PageProps<"/events/[eventId]/photos">) {
  const { eventId } = await params;
  const [t, locale, { event }] = await Promise.all([getMessages(), getLocale(), apiGet<{ event: HostEvent }>(`/events/${eventId}`)]);
  const wall = event.features.photoWall ? await apiGet<HostWallResponse>(`/events/${eventId}/photo-wall`) : null;
  const title = locale === "en" && event.titleEn ? event.titleEn : event.titleKm;
  return (
    <div className="flex flex-col gap-6 py-8">
      <div>
        <Link href="/dashboard" className="text-sm text-muted">
          ← {t.dashboard.title}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">{title}</h1>
      </div>
      <EventNav eventId={eventId} active="photos" t={t.nav} type={event.type} />
      {!wall ? (
        <UpgradeNotice eventId={eventId} t={t.plans} />
      ) : (
        <>
          <p className="text-sm text-muted">{t.wall.hint}</p>
          {!wall.open && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{t.wall.closed}</p>}
          <div className="flex items-center justify-between gap-3">
            <span className="font-medium">{fill(t.wall.count, { count: localDigits(String(wall.photos.length), locale) })}</span>
            <Link href={`/events/${eventId}/photos/screen`} className={buttonClass}>
              {t.wall.screen}
            </Link>
          </div>
          {wall.photos.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line p-8 text-center text-muted">{t.wall.empty}</p>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3" data-testid="host-wall">
              {wall.photos.map((p) => (
                <li key={p.id} className={`flex flex-col gap-1 ${p.hidden ? "opacity-40" : ""}`}>
                  <a href={`/api/files/${p.key}`} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element -- stored photos are already resized WebP */}
                    <img src={`/api/files/${p.key}`} alt="" loading="lazy" className="aspect-square w-full rounded-lg object-cover" />
                  </a>
                  <span className="truncate text-xs text-muted">
                    {fill(t.wall.by, { name: p.by })}
                    {p.hidden && ` · ${t.wall.hidden}`}
                  </span>
                  <div className="flex gap-3 text-xs">
                    <form action={setWallPhotoHidden.bind(null, eventId, p.id, !p.hidden)}>
                      <button className="underline">{p.hidden ? t.wall.show : t.wall.hide}</button>
                    </form>
                    <form action={deleteWallPhoto.bind(null, eventId, p.id)}>
                      <button className="text-red-700 underline">{t.wall.delete}</button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
