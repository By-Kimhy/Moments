import Link from "next/link";
import { notFound } from "next/navigation";
import type { HostEvent, MembersResponse } from "@api/contract";
import { publishEvent, removeMember, rotateHelperCode } from "@/app/actions/events";
import { EventNav } from "@/components/event-nav";
import { buttonClass, secondaryButtonClass } from "@/components/form";
import { getLocale, getMessages } from "@/i18n";
import { apiGet } from "@/lib/api";
import { formatDateTime } from "@/lib/dates";
import { fill } from "@/i18n/format";
import { CohostForm } from "./cohost-form";
import { MediaSection } from "./media-section";
import { TelegramSection } from "./telegram-section";

export default async function EventPage({ params }: PageProps<"/events/[eventId]">) {
  const { eventId } = await params;
  const [t, locale, data] = await Promise.all([getMessages(), getLocale(), apiGet<{ event: HostEvent; role: string }>(`/events/${eventId}`)]);
  if (data.role !== "OWNER") notFound();
  const { event } = data;
  const [{ members }, telegram] = await Promise.all([
    apiGet<MembersResponse>(`/events/${eventId}/members`),
    apiGet<{ enabled: boolean; connected: boolean; botUsername: string | null }>(`/events/${eventId}/telegram`),
  ]);
  const hosts = members.filter((m) => m.role === "OWNER");
  const helpers = members.filter((m) => m.role === "HELPER");
  const title = locale === "en" && event.titleEn ? event.titleEn : event.titleKm;
  const venue = locale === "en" && event.venueEn ? event.venueEn : event.venueKm;

  return (
    <div className="flex flex-col gap-8 py-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/dashboard" className="text-sm text-muted">
            ← {t.dashboard.title}
          </Link>
          <h1 className="mt-1 text-2xl font-semibold">{title}</h1>
          <span className="mt-1 inline-block rounded-full bg-black/5 px-2 py-0.5 text-xs">{t.status[event.status]}</span>
        </div>
        <Link href={`/events/${eventId}/edit`} className={secondaryButtonClass}>
          {t.common.edit}
        </Link>
      </div>

      <EventNav eventId={eventId} active="overview" t={t.nav} type={event.type} />

      {event.status === "DRAFT" && (
        <div className="flex flex-col gap-3 rounded-xl bg-amber-50 p-4 text-amber-900">
          <p className="text-sm">{t.event.draftHint}</p>
          <form action={publishEvent.bind(null, eventId)}>
            <button className={buttonClass}>{t.event.publish}</button>
          </form>
        </div>
      )}
      {event.type === "TICKETED" ? (
        event.slug && (
          <Link href={`/e/${event.slug}`} className={`${secondaryButtonClass} self-start`}>
            {t.tickets.publicPage}
          </Link>
        )
      ) : (
        <Link href={`/events/${eventId}/preview`} className={`${secondaryButtonClass} self-start`}>
          {t.event.preview}
        </Link>
      )}

      <dl className="grid gap-3 rounded-xl border border-line p-4 sm:grid-cols-2">
        <div>
          <dt className="text-sm text-muted">{t.event.when}</dt>
          <dd>{formatDateTime(event.startsAt, locale)}</dd>
        </div>
        {venue && (
          <div>
            <dt className="text-sm text-muted">{t.event.where}</dt>
            <dd>{event.mapUrl ? <a href={event.mapUrl} className="underline" target="_blank" rel="noreferrer">{venue}</a> : venue}</dd>
          </div>
        )}
      </dl>

      {event.type === "WEDDING" && (
        <Link href={`/events/${eventId}/plan`} className="flex items-center justify-between gap-3 rounded-xl border border-line p-4 hover:bg-black/5" data-testid="plan-link">
          <span>{fill(t.plans.current, { plan: t.plans.names[event.effectivePlan] })}</span>
          {event.effectivePlan !== "PREMIUM" && event.effectivePlan !== "PLANNER" && <span className="text-sm font-medium text-accent">{t.plans.needsUpgrade} →</span>}
        </Link>
      )}

      <TelegramSection eventId={eventId} status={telegram} t={t.telegram} />

      <MediaSection event={event} t={t.media} removeLabel={t.common.remove} />

      <section className="rounded-xl border border-line p-4">
        <h2 className="font-semibold">{t.event.helperCode}</h2>
        <p className="my-2 font-mono text-3xl tracking-[0.3em]">{event.helperCode}</p>
        <p className="text-sm text-muted">{t.event.helperCodeHint}</p>
        <form action={rotateHelperCode.bind(null, eventId)} className="mt-3">
          <button className="text-sm underline">{t.event.newCode}</button>
        </form>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">{t.event.hosts}</h2>
        <MemberList members={hosts} eventId={eventId} removeLabel={t.common.remove} removedLabel={t.event.removed} viaLabel={t.planner.viaPlanner} />
        <details className="rounded-xl border border-line p-4">
          <summary className="cursor-pointer font-medium">{t.event.addCohost}</summary>
          <p className="my-2 text-sm text-muted">{t.event.cohostHint}</p>
          <CohostForm eventId={eventId} t={t.event} />
        </details>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">{t.event.helpers}</h2>
        {helpers.length === 0 ? (
          <p className="text-sm text-muted">{t.event.noHelpers}</p>
        ) : (
          <MemberList members={helpers} eventId={eventId} removeLabel={t.common.remove} removedLabel={t.event.removed} viaLabel={t.planner.viaPlanner} />
        )}
      </section>
    </div>
  );
}

function MemberList({
  members,
  eventId,
  removeLabel,
  removedLabel,
  viaLabel,
}: {
  members: MembersResponse["members"];
  eventId: string;
  removeLabel: string;
  removedLabel: string;
  viaLabel: string;
}) {
  return (
    <ul className="divide-y divide-line rounded-xl border border-line">
      {members.map((m) => (
        <li key={m.id} className="flex items-center justify-between gap-2 px-4 py-3">
          <div>
            <div className={m.revokedAt ? "text-muted line-through" : ""}>{m.displayName}</div>
            {m.phone && <div className="text-sm text-muted">{m.phone}</div>}
          </div>
          {m.revokedAt ? (
            <span className="text-sm text-muted">{removedLabel}</span>
          ) : m.viaOrganization ? (
            <span className="text-sm text-muted">{viaLabel}</span>
          ) : m.isCreator ? null : (
            <form action={removeMember.bind(null, eventId, m.id)}>
              <button className="text-sm text-red-700 underline">{removeLabel}</button>
            </form>
          )}
        </li>
      ))}
    </ul>
  );
}
