import Link from "next/link";
import type { EventsResponse } from "@api/contract";
import { logout } from "@/app/actions/auth";
import { buttonClass } from "@/components/form";
import { getLocale, getMessages } from "@/i18n";
import { fill } from "@/i18n/format";
import { apiGet } from "@/lib/api";
import { formatDateTime } from "@/lib/dates";
import { requireUser } from "@/lib/dal";

export const metadata = { title: "Moments" };

export default async function Dashboard() {
  const user = await requireUser();
  const [t, locale, { events }] = await Promise.all([getMessages(), getLocale(), apiGet<EventsResponse>("/events")]);
  return (
    <div className="flex flex-col gap-6 py-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t.dashboard.title}</h1>
          <p className="text-sm text-muted">{user.name}</p>
        </div>
        <Link href="/events/new" className={buttonClass}>
          {t.dashboard.newEvent}
        </Link>
      </div>
      {events.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line p-8 text-center text-muted">{t.dashboard.empty}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {events.map((e) => (
            <li key={e.id}>
              <Link href={`/events/${e.id}`} className="block rounded-xl border border-line p-4 hover:bg-black/5">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-semibold">{locale === "en" && e.titleEn ? e.titleEn : e.titleKm}</span>
                  <span className="shrink-0 rounded-full bg-black/5 px-2 py-0.5 text-xs">{t.status[e.status]}</span>
                </div>
                <div className="mt-1 text-sm text-muted">
                  {formatDateTime(e.startsAt, locale)} · {fill(t.dashboard.guests, { count: e.guestCount })}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <form action={logout}>
        <button className="text-sm text-muted underline">{t.common.signOut}</button>
      </form>
    </div>
  );
}
