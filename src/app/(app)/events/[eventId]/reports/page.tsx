import Link from "next/link";
import type { HostEvent, ReportSummary } from "@api/contract";
import { formatAmount } from "@api/lib/money";
import { EventNav } from "@/components/event-nav";
import { buttonClass, secondaryButtonClass } from "@/components/form";
import { getLocale, getMessages } from "@/i18n";
import { apiGet } from "@/lib/api";

const both = (m: { USD: number; KHR: number }) => [m.USD && formatAmount(m.USD, "USD"), m.KHR && formatAmount(m.KHR, "KHR")].filter(Boolean).join(" + ") || "—";

export default async function ReportsPage({ params, searchParams }: PageProps<"/events/[eventId]/reports">) {
  const [{ eventId }, query] = await Promise.all([params, searchParams]);
  const side = ["GROOM", "BRIDE", "BOTH"].includes(String(query.side)) ? String(query.side) : "";
  const locale = await getLocale();
  const lang = query.lang === "en" || query.lang === "km" ? String(query.lang) : locale;
  const [t, { event }, { report }] = await Promise.all([
    getMessages(),
    apiGet<{ event: HostEvent }>(`/events/${eventId}`),
    apiGet<{ report: ReportSummary }>(`/events/${eventId}/reports/summary${side ? `?side=${side}` : ""}`),
  ]);
  const r = t.reports;
  const title = locale === "en" && event.titleEn ? event.titleEn : event.titleKm;
  const download = (ext: string) => `/api/events/${eventId}/reports/gift-book.${ext}?${new URLSearchParams({ ...(side ? { side } : {}), lang })}`;
  const a = report.attendance;
  const input = "rounded-lg border border-line bg-white px-3 py-2 text-sm text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100";

  return (
    <div className="flex flex-col gap-6 py-8">
      <div>
        <Link href="/dashboard" className="text-sm text-muted">
          ← {t.dashboard.title}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">{title}</h1>
      </div>
      <EventNav eventId={eventId} active="reports" t={t.nav} />

      <form className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-sm">
          {r.side}
          <select name="side" defaultValue={side} className={input}>
            <option value="">{r.both}</option>
            <option value="GROOM">{t.side.GROOM}</option>
            <option value="BRIDE">{t.side.BRIDE}</option>
            <option value="BOTH">{t.side.BOTH}</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {r.language}
          <select name="lang" defaultValue={lang} className={input}>
            <option value="km">ខ្មែរ</option>
            <option value="en">English</option>
          </select>
        </label>
        <button className={buttonClass}>{r.show}</button>
      </form>

      <section className="grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-accent p-4 text-white">
          <div className="text-xs opacity-80">{t.giftBook.total} (USD)</div>
          <div className="text-2xl font-bold">{formatAmount(report.totals.total.USD, "USD")}</div>
        </div>
        <div className="rounded-xl bg-accent p-4 text-white">
          <div className="text-xs opacity-80">{t.giftBook.total} (KHR)</div>
          <div className="text-2xl font-bold">{formatAmount(report.totals.total.KHR, "KHR")}</div>
        </div>
      </section>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          <a href={download("xlsx")} className={buttonClass}>
            {r.excel}
          </a>
          <a href={download("pdf")} className={secondaryButtonClass}>
            {r.pdf}
          </a>
        </div>
        <p className="text-sm text-muted">{r.hint}</p>
      </div>

      <section className="grid gap-3 sm:grid-cols-2">
        <dl className="rounded-xl border border-line p-4 text-sm">
          <dt className="mb-2 font-semibold">{r.attendance}</dt>
          {(
            [
              [t.guests.summary.guests, a.invitedGuests],
              [t.guests.summary.invited, a.invitedPeople],
              [t.guests.summary.attending, a.attendingPeople],
              [t.guests.summary.declined, a.declinedGuests],
              [t.desk.arrived, a.checkedInPeople],
              [t.desk.walkIn, a.walkIns],
            ] as const
          ).map(([label, value]) => (
            <dd key={label} className="flex justify-between gap-2">
              <span className="text-muted">{label}</span>
              <span>{value}</span>
            </dd>
          ))}
        </dl>
        <dl className="rounded-xl border border-line p-4 text-sm">
          <dt className="mb-2 font-semibold">{r.byGroup}</dt>
          {report.totals.byGroup.map((g) => (
            <dd key={g.group} className="flex justify-between gap-2">
              <span className="text-muted">
                {g.group || r.noGroup} ({g.count})
              </span>
              <span>{both(g.total)}</span>
            </dd>
          ))}
        </dl>
      </section>

      <section>
        <h2 className="mb-2 font-semibold">
          {r.givers} ({report.byGiver.length})
        </h2>
        <ul className="divide-y divide-line rounded-xl border border-line">
          {report.byGiver.map((g, i) => (
            <li key={`${g.name}-${i}`} className="flex justify-between gap-2 px-4 py-2 text-sm">
              <span>
                {g.name}
                <span className="block text-xs text-muted">{[g.side ? t.side[g.side] : t.giftBook.noSide, g.group].filter(Boolean).join(" · ")}</span>
              </span>
              <span className="font-semibold">{both({ USD: g.usd, KHR: g.khr })}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
