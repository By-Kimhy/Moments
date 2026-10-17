import Link from "next/link";
import type { OrganizationResponse, PlannerEvent, PlannerEventsResponse } from "@api/contract";
import { formatAmount } from "@api/lib/money";
import { removeStaff } from "@/app/actions/planner";
import { getLocale, getMessages } from "@/i18n";
import type { Messages } from "@/i18n/km";
import { fill } from "@/i18n/format";
import { apiGet } from "@/lib/api";
import { formatDateTime } from "@/lib/dates";
import { AddStaffForm, ClientEventForm, OrganizationSettings } from "../forms";

export default async function PlannerDashboard({ params }: PageProps<"/planner/[orgId]">) {
  const { orgId } = await params;
  const [t, locale, org, events] = await Promise.all([
    getMessages(),
    getLocale(),
    apiGet<OrganizationResponse>(`/organizations/${orgId}`),
    apiGet<PlannerEventsResponse>(`/organizations/${orgId}/events`),
  ]);
  const p = t.planner;
  return (
    <div className="flex flex-col gap-8 py-8">
      <div className="flex items-center gap-3">
        {org.organization.logoKey && (
          // eslint-disable-next-line @next/next/no-img-element -- stored logo, already resized
          <img src={`/api/files/${org.organization.logoKey}`} alt="" className="size-12 rounded-lg object-cover" />
        )}
        <div>
          <Link href="/dashboard" className="text-sm text-muted">
            ← {t.dashboard.title}
          </Link>
          <h1 className="text-2xl font-semibold" style={{ color: org.organization.brandColor }}>
            {org.organization.name}
          </h1>
        </div>
      </div>

      <EventList title={p.upcoming} events={events.upcoming} t={t} locale={locale} />

      <details className="rounded-xl border border-line p-4" open={events.upcoming.length === 0}>
        <summary className="cursor-pointer font-semibold">{p.newEvent}</summary>
        <div className="mt-4">
          <ClientEventForm orgId={orgId} t={p} dateLabel={t.eventForm.date} timeLabel={t.eventForm.time} titleLabel={t.eventForm.titleKm} />
        </div>
      </details>

      {events.past.length > 0 && <EventList title={p.past} events={events.past} t={t} locale={locale} />}

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">{p.team}</h2>
        <ul className="divide-y divide-line rounded-xl border border-line">
          {org.members.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-2 px-4 py-3">
              <span>
                {m.name} {m.isMe && <span className="text-muted">{p.you}</span>}
                <span className="block text-sm text-muted">
                  {p.roles[m.role]} · {m.phone}
                </span>
              </span>
              {org.role === "OWNER" && !m.isMe && (
                <form action={removeStaff.bind(null, orgId, m.id)}>
                  <button className="text-sm text-red-700 underline">{p.remove}</button>
                </form>
              )}
            </li>
          ))}
        </ul>
        {org.role === "OWNER" && (
          <details className="rounded-xl border border-line p-4">
            <summary className="cursor-pointer font-medium">{p.addStaff}</summary>
            <div className="mt-4">
              <AddStaffForm orgId={orgId} t={p} />
            </div>
          </details>
        )}
      </section>

      {org.role === "OWNER" && (
        <details className="rounded-xl border border-line p-4">
          <summary className="cursor-pointer font-semibold">{p.settings}</summary>
          <div className="mt-4">
            <OrganizationSettings orgId={orgId} t={p} name={org.organization.name} brandColor={org.organization.brandColor} />
          </div>
        </details>
      )}
    </div>
  );
}

function EventList({ title, events, t, locale }: { title: string; events: PlannerEvent[]; t: Messages; locale: "km" | "en" }) {
  const p = t.planner;
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-semibold">
        {title} ({events.length})
      </h2>
      {events.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line p-6 text-center text-muted">{p.noEvents}</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {events.map((e) => (
            <li key={e.id}>
              <Link href={`/events/${e.id}`} className="flex h-full flex-col gap-2 rounded-xl border border-line p-4 hover:bg-black/5">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-semibold">{locale === "en" && e.titleEn ? e.titleEn : e.titleKm}</span>
                  <span className="shrink-0 rounded-full bg-black/5 px-2 py-0.5 text-xs">{t.status[e.status]}</span>
                </div>
                <span className="text-sm text-muted">{formatDateTime(e.startsAt, locale)}</span>
                <div className="h-1.5 overflow-hidden rounded-full bg-black/10" title={fill(p.replies, { rate: e.replyRate })}>
                  <div className="h-full bg-accent" style={{ width: `${e.replyRate}%` }} />
                </div>
                <span className="text-sm">
                  {[
                    fill(p.guests, { count: e.guests }),
                    fill(p.replies, { rate: e.replyRate }),
                    fill(p.coming, { count: e.attendingPeople }),
                    e.arrivedPeople > 0 && fill(p.arrived, { count: e.arrivedPeople }),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                {(e.giftTotal.USD > 0 || e.giftTotal.KHR > 0 || e.pendingGifts > 0) && (
                  <span className="text-sm font-semibold">
                    🎁 {[e.giftTotal.USD && formatAmount(e.giftTotal.USD, "USD"), e.giftTotal.KHR && formatAmount(e.giftTotal.KHR, "KHR")].filter(Boolean).join(" + ")}
                    {e.pendingGifts > 0 && <span className="ml-2 font-normal text-amber-700">{fill(p.pending, { count: e.pendingGifts })}</span>}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
