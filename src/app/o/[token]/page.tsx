import { notFound } from "next/navigation";
import type { OrderPage } from "@api/contract";
import { formatAmount } from "@api/lib/money";
import { getMessages } from "@/i18n";
import { fill } from "@/i18n/format";
import { ApiError, api } from "@/lib/api";
import { invitationDate } from "@/lib/dates";
import { invitationLocale } from "@/lib/invitation";
import { AutoRefresh } from "./auto-refresh";

export const metadata = { title: "Moments", robots: { index: false, follow: false } };

// The buyer's private order page: how to pay while waiting, then the QR e-tickets.
export default async function OrderPage({ params, searchParams }: PageProps<"/o/[token]">) {
  const [{ token }, { lang }] = await Promise.all([params, searchParams]);
  let data: OrderPage;
  try {
    data = await api.get<OrderPage>(`/orders/${encodeURIComponent(token)}`);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
  const locale = await invitationLocale(lang);
  const t = await getMessages(locale);
  const s = t.shop;
  const { order, event } = data;
  const km = locale === "km";
  const accent = event.planner?.brandColor ?? "#9b2c2c";
  const { date, time } = invitationDate(event.startsAt, locale);
  const amount = formatAmount(order.total, order.currency, km);
  const holdUntil = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Phnom_Penh", hour: "2-digit", minute: "2-digit" }).format(order.expiresAt);

  return (
    <div lang={locale} className="min-h-screen bg-background">
      <div className="mx-auto flex max-w-md flex-col gap-5 px-4 pb-16 pt-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: accent }}>
            {km ? event.titleKm : event.titleEn || event.titleKm}
          </h1>
          <p className="text-muted">
            {date} · {time}
          </p>
        </div>
        <div className="rounded-2xl border border-line p-4">
          <p className="text-sm text-muted">
            {s.reference}: <span className="font-mono font-bold text-foreground">{order.reference}</span> · {order.buyerName}
          </p>
          <ul className="mt-2 text-sm">
            {order.items.map((i) => (
              <li key={i.name}>
                {i.quantity}× {i.name} · {formatAmount(i.unitPrice, order.currency, km)}
              </li>
            ))}
          </ul>
          <p className="mt-2 font-semibold">
            {s.total}: {amount}
          </p>
        </div>

        {order.status === "PENDING_PAYMENT" && (
          <section className="flex flex-col items-center gap-3 rounded-2xl border-2 p-4 text-center" style={{ borderColor: accent }}>
            <AutoRefresh />
            <h2 className="text-xl font-semibold">{s.payTitle}</h2>
            <p>{fill(s.payHint, { amount })}</p>
            <p className="rounded-xl bg-black/5 px-6 py-3 font-mono text-3xl font-bold tracking-widest" data-testid="reference">
              {order.reference}
            </p>
            {event.khqrImageKey && (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element -- the QR must not be re-compressed */}
                <img src={`/api/files/${event.khqrImageKey}`} alt="KHQR" className="w-56 rounded-xl bg-white p-2" />
                {event.khqrAccountName && <p className="text-sm">{event.khqrAccountName}</p>}
                <a href={`/api/files/${event.khqrImageKey}`} download="khqr.png" className="text-sm underline">
                  {t.invite.saveQr}
                </a>
              </>
            )}
            <p className="text-sm">{fill(s.holdUntil, { time: holdUntil })}</p>
            <p className="text-sm text-muted">{s.waiting}</p>
          </section>
        )}

        {order.status === "PAID" && (
          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-semibold text-emerald-700">{s.paid}</h2>
            <p className="text-sm text-muted">{s.showAtDoor}</p>
            {order.tickets.map((ticket, i) => (
              <div key={ticket.code} className={`flex flex-col items-center gap-2 rounded-2xl border border-line p-4 ${ticket.used ? "opacity-50" : ""}`}>
                <p className="font-semibold">
                  {i + 1}/{order.tickets.length} · {ticket.type}
                </p>
                {/* eslint-disable-next-line @next/next/no-img-element -- SVG from the API */}
                <img src={`/api/orders/${token}/tickets/${ticket.code}/qr.svg`} alt="QR" className="w-56 rounded-xl bg-white p-2" />
                {ticket.used && <p className="text-sm font-semibold">{s.used}</p>}
              </div>
            ))}
            <p className="text-center text-sm text-muted">{s.save}</p>
          </section>
        )}

        {order.status === "EXPIRED" && <p className="rounded-xl bg-amber-50 p-4 text-amber-900">{s.expired}</p>}
        {order.status === "CANCELLED" && <p className="rounded-xl bg-red-50 p-4 text-red-800">{s.cancelled}</p>}
      </div>
    </div>
  );
}
