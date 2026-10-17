import Link from "next/link";
import type { HostEvent, WishesResponse } from "@api/contract";
import { setWishHidden } from "@/app/actions/wishes";
import { EventNav } from "@/components/event-nav";
import { secondaryButtonClass } from "@/components/form";
import { getLocale, getMessages } from "@/i18n";
import { apiGet } from "@/lib/api";
import { formatDateTime } from "@/lib/dates";

// Every wish from the guests, and the wish book to download.
export default async function WishesPage({ params }: PageProps<"/events/[eventId]/wishes">) {
  const { eventId } = await params;
  const [t, locale, { event }, { wishes }] = await Promise.all([
    getMessages(),
    getLocale(),
    apiGet<{ event: HostEvent }>(`/events/${eventId}`),
    apiGet<WishesResponse>(`/events/${eventId}/wishes`),
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
      <EventNav eventId={eventId} active="wishes" t={t.nav} type={event.type} />
      <p className="text-sm text-muted">{t.wishes.hint}</p>
      {wishes.length > 0 && (
        <a href={`/api/events/${eventId}/wishes/book.pdf`} className={`${secondaryButtonClass} self-start`}>
          {t.wishes.download}
        </a>
      )}
      {wishes.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line p-8 text-center text-muted">{t.wishes.empty}</p>
      ) : (
        <ul className="flex flex-col gap-3" data-testid="wishes">
          {wishes.map((w) => (
            <li key={`${w.kind}-${w.id}`} className={`flex flex-col gap-1 rounded-xl border border-line p-4 ${w.hidden ? "opacity-50" : ""}`}>
              <p className="whitespace-pre-line">“{w.text}”</p>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
                <span>
                  — {w.guest} · {t.wishes.kinds[w.kind]} · {formatDateTime(w.at, locale)}
                  {w.hidden && ` · ${t.wishes.hidden}`}
                </span>
                {w.kind === "WISH" && (
                  <form action={setWishHidden.bind(null, eventId, w.id, !w.hidden)}>
                    <button className="underline">{w.hidden ? t.wishes.show : t.wishes.hide}</button>
                  </form>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
