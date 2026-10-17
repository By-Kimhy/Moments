import Link from "next/link";
import type { GuestsResponse, HostEvent } from "@api/contract";
import { addGuest } from "@/app/actions/guests";
import { EventNav } from "@/components/event-nav";
import { buttonClass, secondaryButtonClass } from "@/components/form";
import { GuestForm } from "@/components/guest-form";
import { ShareLink } from "@/components/share-link";
import { getLocale, getMessages } from "@/i18n";
import { fill } from "@/i18n/format";
import { apiGet } from "@/lib/api";

const RSVP_STYLE = {
  PENDING: "bg-black/5",
  ATTENDING: "bg-emerald-100 text-emerald-800",
  DECLINED: "bg-zinc-200 text-zinc-600",
} as const;

export default async function GuestsPage({ params, searchParams }: PageProps<"/events/[eventId]/guests">) {
  const [{ eventId }, query] = await Promise.all([params, searchParams]);
  const filters = Object.fromEntries(
    (["q", "side", "rsvp", "group"] as const).map((k) => [k, typeof query[k] === "string" ? (query[k] as string) : ""]),
  );
  const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString();
  const [t, locale, { event }, data] = await Promise.all([
    getMessages(),
    getLocale(),
    apiGet<{ event: HostEvent }>(`/events/${eventId}`),
    apiGet<GuestsResponse>(`/events/${eventId}/guests${qs ? `?${qs}` : ""}`),
  ]);
  const { guests, summary, groups } = data;
  const title = locale === "en" && event.titleEn ? event.titleEn : event.titleKm;
  const stats = [
    [t.guests.summary.guests, summary.guests],
    [t.guests.summary.invited, summary.invitedPeople],
    [t.guests.summary.attending, summary.attendingPeople],
    [t.guests.summary.declined, summary.declined],
    [t.guests.summary.pending, summary.pending],
    [t.guests.summary.opened, summary.opened],
  ] as const;
  const inputClass = "rounded-lg border border-line bg-white px-3 py-2 text-sm text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100";

  return (
    <div className="flex flex-col gap-6 py-8">
      <div>
        <Link href="/dashboard" className="text-sm text-muted">
          ← {t.dashboard.title}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">{title}</h1>
      </div>
      <EventNav eventId={eventId} active="guests" t={t.nav} />
      {event.status === "DRAFT" && (
        <Link href={`/events/${eventId}`} className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900 underline-offset-2 hover:underline">
          {t.event.draftHint}
        </Link>
      )}

      <dl className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {stats.map(([label, value]) => (
          <div key={label} className="rounded-xl border border-line p-3">
            <dt className="text-xs text-muted">{label}</dt>
            <dd className="text-xl font-semibold">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="flex flex-wrap gap-2">
        <Link href={`/events/${eventId}/guests/import`} className={secondaryButtonClass}>
          {t.guests.import}
        </Link>
        <a href={`/api/events/${eventId}/guests/export.csv`} className={secondaryButtonClass}>
          {t.guests.export}
        </a>
      </div>

      <details className="rounded-xl border border-line p-4" open={summary.guests === 0}>
        <summary className="cursor-pointer font-semibold">{t.guests.add}</summary>
        <div className="mt-4">
          <GuestForm action={addGuest.bind(null, eventId)} t={t.guests} sides={t.side} groups={groups} submitLabel={t.guests.add} />
        </div>
      </details>

      {summary.guests > 0 && (
        <form className="flex flex-wrap gap-2">
          <input name="q" defaultValue={filters.q} placeholder={t.guests.search} className={`${inputClass} min-w-0 flex-1`} />
          <select name="side" defaultValue={filters.side} className={inputClass}>
            <option value="">{t.guests.allSides}</option>
            {(["GROOM", "BRIDE", "BOTH"] as const).map((s) => (
              <option key={s} value={s}>
                {t.side[s]}
              </option>
            ))}
          </select>
          <select name="rsvp" defaultValue={filters.rsvp} className={inputClass}>
            <option value="">{t.guests.allRsvp}</option>
            {(["ATTENDING", "DECLINED", "PENDING"] as const).map((s) => (
              <option key={s} value={s}>
                {t.rsvp[s]}
              </option>
            ))}
          </select>
          {groups.length > 0 && (
            <select name="group" defaultValue={filters.group} className={inputClass}>
              <option value="">{t.guests.allGroups}</option>
              {groups.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          )}
          <button className={buttonClass}>{t.guests.filter}</button>
        </form>
      )}

      {guests.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line p-8 text-center text-muted">
          {summary.guests === 0 ? t.guests.empty : t.guests.noMatch}
        </p>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {guests.map((g) => (
            <li key={g.id} className="flex flex-col gap-1 px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <Link href={`/events/${eventId}/guests/${g.id}`} className="font-medium underline-offset-2 hover:underline">
                  {g.name}
                  {g.nameAlt && <span className="ml-2 text-sm font-normal text-muted">{g.nameAlt}</span>}
                </Link>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${RSVP_STYLE[g.rsvpStatus]}`}>
                  {t.rsvp[g.rsvpStatus]}
                  {g.rsvpStatus === "ATTENDING" && g.rsvpCount ? ` · ${g.rsvpCount}` : ""}
                </span>
              </div>
              <div className="text-sm text-muted">
                {[t.side[g.side], g.group, fill(t.guests.people, { count: g.invitedCount }), g.phone, g.openedAt && t.guests.opened, g.checkedIn && t.guests.checkedIn]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
              <ShareLink
                url={g.inviteUrl}
                text={fill(t.guests.shareText, { name: g.name })}
                labels={{ copy: t.guests.copyLink, copied: t.guests.copied, telegram: t.guests.shareTelegram }}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
