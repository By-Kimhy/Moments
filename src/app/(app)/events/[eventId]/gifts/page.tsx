import Link from "next/link";
import type { GiftsResponse, GuestsResponse, HostEvent } from "@api/contract";
import { formatAmount } from "@api/lib/money";
import { addGift, confirmGift, rejectGift } from "@/app/actions/gifts";
import { EventNav } from "@/components/event-nav";
import { buttonClass } from "@/components/form";
import { GiftForm } from "@/components/gift-forms";
import { getLocale, getMessages } from "@/i18n";
import { fill } from "@/i18n/format";
import { apiGet } from "@/lib/api";
import { formatDateTime } from "@/lib/dates";

type Money = { USD: number; KHR: number };
const both = (m: Money) => [m.USD && formatAmount(m.USD, "USD"), m.KHR && formatAmount(m.KHR, "KHR")].filter(Boolean).join(" + ") || "—";

export default async function GiftsPage({ params, searchParams }: PageProps<"/events/[eventId]/gifts">) {
  const [{ eventId }, query] = await Promise.all([params, searchParams]);
  const filters = Object.fromEntries((["q", "status", "currency", "method"] as const).map((k) => [k, typeof query[k] === "string" ? (query[k] as string) : ""]));
  const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString();
  const [t, locale, { event }, { gifts, totals }, pendingData, { guests }] = await Promise.all([
    getMessages(),
    getLocale(),
    apiGet<{ event: HostEvent }>(`/events/${eventId}`),
    apiGet<GiftsResponse>(`/events/${eventId}/gifts${qs ? `?${qs}` : ""}`),
    apiGet<GiftsResponse>(`/events/${eventId}/gifts?status=PENDING`),
    apiGet<GuestsResponse>(`/events/${eventId}/guests`),
  ]);
  const g = t.giftBook;
  const title = locale === "en" && event.titleEn ? event.titleEn : event.titleKm;
  const input = "rounded-lg border border-line bg-white px-3 py-2 text-sm text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100";

  return (
    <div className="flex flex-col gap-6 py-8">
      <div>
        <Link href="/dashboard" className="text-sm text-muted">
          ← {t.dashboard.title}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">{title}</h1>
      </div>
      <EventNav eventId={eventId} active="gifts" t={t.nav} />

      <section className="grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-accent p-4 text-white">
          <div className="text-xs opacity-80">{g.total} (USD)</div>
          <div className="text-2xl font-bold">{formatAmount(totals.total.USD, "USD")}</div>
        </div>
        <div className="rounded-xl bg-accent p-4 text-white">
          <div className="text-xs opacity-80">{g.total} (KHR)</div>
          <div className="text-2xl font-bold">{formatAmount(totals.total.KHR, "KHR")}</div>
        </div>
        <p className="col-span-2 text-sm text-muted">
          {fill(g.count, { count: totals.count })}
          {totals.pendingCount > 0 && ` · ${fill(g.pendingTotal, { amount: both(totals.pending) })}`}
        </p>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <dl className="rounded-xl border border-line p-4 text-sm">
          <dt className="mb-2 font-semibold">{g.bySide}</dt>
          {(["GROOM", "BRIDE", "BOTH", "NONE"] as const).map((side) => (
            <dd key={side} className="flex justify-between gap-2">
              <span className="text-muted">{side === "NONE" ? g.noSide : t.side[side]}</span>
              <span>{both(totals.bySide[side])}</span>
            </dd>
          ))}
        </dl>
        <dl className="rounded-xl border border-line p-4 text-sm">
          <dt className="mb-2 font-semibold">{g.byMethod}</dt>
          <dd className="flex justify-between gap-2">
            <span className="text-muted">{t.desk.cash}</span>
            <span>{both(totals.byMethod.CASH)}</span>
          </dd>
          <dd className="flex justify-between gap-2">
            <span className="text-muted">{t.desk.khqr}</span>
            <span>{both(totals.byMethod.KHQR)}</span>
          </dd>
        </dl>
      </section>

      {pendingData.gifts.length > 0 && (
        <section className="flex flex-col gap-3 rounded-xl bg-amber-50 p-4 text-amber-950">
          <h2 className="font-semibold">{g.pendingTitle}</h2>
          <p className="text-sm">{g.pendingHint}</p>
          <ul className="divide-y divide-amber-200">
            {pendingData.gifts.map((gift) => (
              <li key={gift.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  <span className="font-semibold">{formatAmount(gift.amount, gift.currency)}</span> · {gift.guestName}
                  {gift.note && <span className="block text-sm">“{gift.note}”</span>}
                </span>
                <span className="flex gap-2">
                  <form action={confirmGift.bind(null, eventId, gift.id)}>
                    <button className="rounded-lg bg-emerald-700 px-3 py-1.5 text-sm text-white">{g.confirm}</button>
                  </form>
                  <form action={rejectGift.bind(null, eventId, gift.id)}>
                    <button className="rounded-lg border border-amber-400 px-3 py-1.5 text-sm">{g.reject}</button>
                  </form>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <details className="rounded-xl border border-line p-4">
        <summary className="cursor-pointer font-semibold">{g.add}</summary>
        <div className="mt-4">
          <GiftForm action={addGift.bind(null, eventId)} t={g} desk={t.desk} guests={guests.map((x) => ({ id: x.id, name: x.name }))} submitLabel={g.add} />
        </div>
      </details>

      <form className="flex flex-wrap gap-2">
        <input name="q" defaultValue={filters.q} placeholder={g.search} className={`${input} min-w-0 flex-1`} />
        <select name="status" defaultValue={filters.status} className={input}>
          <option value="">{g.allStatus}</option>
          {(["CONFIRMED", "PENDING", "REJECTED", "VOIDED"] as const).map((s) => (
            <option key={s} value={s}>
              {g.status[s]}
            </option>
          ))}
        </select>
        <select name="currency" defaultValue={filters.currency} className={input}>
          <option value="">{g.allCurrency}</option>
          <option value="USD">USD</option>
          <option value="KHR">KHR</option>
        </select>
        <select name="method" defaultValue={filters.method} className={input}>
          <option value="">{g.allMethods}</option>
          <option value="CASH">{t.desk.cash}</option>
          <option value="KHQR">{t.desk.khqr}</option>
        </select>
        <button className={buttonClass}>{t.guests.filter}</button>
      </form>

      {gifts.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line p-8 text-center text-muted">{g.empty}</p>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {gifts.map((gift) => (
            <li key={gift.id}>
              <Link href={`/events/${eventId}/gifts/${gift.id}`} className={`flex items-start justify-between gap-2 px-4 py-3 ${gift.voidedAt || gift.status === "REJECTED" ? "text-muted line-through" : ""}`}>
                <span>
                  <span className="font-medium">{gift.guestName}</span>
                  <span className="block text-sm text-muted">
                    {[gift.side && t.side[gift.side], gift.method === "CASH" ? t.desk.cash : t.desk.khqr, g.source[gift.source], gift.recordedBy, formatDateTime(gift.recordedAt, locale)]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="font-semibold">{formatAmount(gift.amount, gift.currency)}</span>
                  {gift.status !== "CONFIRMED" && <span className="block text-xs">{g.status[gift.voidedAt ? "VOIDED" : gift.status]}</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
