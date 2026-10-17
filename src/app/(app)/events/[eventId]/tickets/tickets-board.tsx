"use client";

import { useState } from "react";
import type { OrdersResponse, TicketTypeRow } from "@api/contract";
import { type Currency, formatAmount, parseAmount } from "@api/lib/money";
import { buttonClass, secondaryButtonClass } from "@/components/form";
import type { Messages } from "@/i18n/km";
import { fill } from "@/i18n/format";
import { ClientApiError, clientApi } from "@/lib/client-api";

type Props = { eventId: string; initialTypes: TicketTypeRow[]; initialOrders: OrdersResponse; t: Messages["tickets"]; usd: string; khr: string };

const both = (m: { USD: number; KHR: number }) => [m.USD && formatAmount(m.USD, "USD"), m.KHR && formatAmount(m.KHR, "KHR")].filter(Boolean).join(" + ") || "—";
const time = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Phnom_Penh", dateStyle: "short", timeStyle: "short" }).format(d);

export function TicketsBoard({ eventId, initialTypes, initialOrders, t, usd, khr }: Props) {
  const [types, setTypes] = useState(initialTypes);
  const [orders, setOrders] = useState(initialOrders);
  const [q, setQ] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const base = `/events/${eventId}`;
  const input = "rounded-lg border border-line bg-white px-3 py-2 text-sm text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100";

  const reload = async (query = q) => {
    const [ty, or] = await Promise.all([
      clientApi<{ ticketTypes: TicketTypeRow[] }>(`${base}/ticket-types`),
      clientApi<OrdersResponse>(`${base}/orders${query ? `?q=${encodeURIComponent(query)}` : ""}`),
    ]);
    setTypes(ty.ticketTypes);
    setOrders(or);
  };
  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setNotice(null);
    try {
      await fn();
      await reload();
    } catch (e) {
      setNotice(e instanceof ClientApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  const waiting = orders.orders.filter((o) => o.status === "PENDING_PAYMENT");
  const others = orders.orders.filter((o) => o.status !== "PENDING_PAYMENT");
  const s = orders.summary;

  return (
    <div className="flex flex-col gap-6">
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {(
          [
            [t.ticketsSold, s.ticketsSold],
            [t.revenue, both(s.revenue)],
            [t.fees, both(s.fees)],
            [t.waitingTitle, s.waiting],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="rounded-xl border border-line p-3">
            <dt className="text-xs text-muted">{label}</dt>
            <dd className="text-lg font-semibold">{value}</dd>
          </div>
        ))}
      </dl>
      {notice && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{notice}</p>}

      {waiting.length > 0 && (
        <section className="flex flex-col gap-3 rounded-xl bg-amber-50 p-4 text-amber-950">
          <h2 className="font-semibold">
            {t.waitingTitle} ({waiting.length})
          </h2>
          <p className="text-sm">{t.waitingHint}</p>
          <ul className="divide-y divide-amber-200">
            {waiting.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  <span className="font-mono text-lg font-bold">{o.reference}</span> · <span className="font-semibold">{formatAmount(o.total, o.currency)}</span>
                  <span className="block text-sm">
                    {o.buyerName} · {o.buyerPhone} · {o.items.map((i) => `${i.quantity}× ${i.name}`).join(", ")}
                  </span>
                </span>
                <span className="flex gap-2">
                  <button type="button" disabled={busy} className="rounded-lg bg-emerald-700 px-3 py-1.5 text-sm text-white" onClick={() => run(() => clientApi(`${base}/orders/${o.id}/confirm`, { method: "POST" }))}>
                    {t.confirm}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    className="rounded-lg border border-amber-400 px-3 py-1.5 text-sm"
                    onClick={() => {
                      const reason = window.prompt(t.cancelReason);
                      if (reason?.trim()) run(() => clientApi(`${base}/orders/${o.id}/cancel`, { method: "POST", body: { reason } }));
                    }}
                  >
                    {t.cancel}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">{t.types}</h2>
        <ul className="flex flex-col gap-2">
          {types.map((type) => (
            <li key={type.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line p-3">
              <span>
                <span className="font-semibold">{type.name}</span> · {formatAmount(type.price, type.currency)}
                <span className="block text-sm text-muted">
                  {[fill(t.sold, { count: type.sold }), fill(t.held, { count: type.held }), fill(t.left, { count: type.available }), !type.onSale && t.notOnSale].filter(Boolean).join(" · ")}
                </span>
              </span>
              <span className="flex gap-3 text-sm">
                <button type="button" className="underline" disabled={busy} onClick={() => run(() => clientApi(`${base}/ticket-types/${type.id}`, { method: "PATCH", body: { active: !type.active } }))}>
                  {type.active ? t.stopSales : t.resumeSales}
                </button>
                {type.sold + type.held === 0 && (
                  <button type="button" className="text-red-700 underline" disabled={busy} onClick={() => run(() => clientApi(`${base}/ticket-types/${type.id}`, { method: "DELETE" }))}>
                    {t.delete}
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
        <details className="rounded-xl border border-line p-4" open={types.length === 0}>
          <summary className="cursor-pointer font-medium">{t.addType}</summary>
          <form
            className="mt-3 grid gap-3 sm:grid-cols-2"
            action={(form) => {
              const currency = (form.get("currency") === "KHR" ? "KHR" : "USD") as Currency;
              const price = form.get("price") === "0" ? 0 : parseAmount(String(form.get("price") ?? ""), currency);
              if (price === null) {
                setNotice(t.price);
                return;
              }
              run(() =>
                clientApi(`${base}/ticket-types`, {
                  method: "POST",
                  body: {
                    name: form.get("name"),
                    description: form.get("description"),
                    price,
                    currency,
                    quantity: form.get("quantity"),
                    maxPerOrder: form.get("maxPerOrder"),
                    salesEnd: form.get("salesEnd") ? new Date(`${form.get("salesEnd")}+07:00`).toISOString() : null,
                  },
                }),
              );
            }}
          >
            <label className="flex flex-col gap-1 text-sm">
              {t.name}
              <input name="name" required className={input} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              {t.description}
              <input name="description" className={input} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              {t.price}
              <input name="price" required inputMode="decimal" className={input} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              {t.currency}
              <select name="currency" className={input}>
                <option value="USD">{usd}</option>
                <option value="KHR">{khr}</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              {t.quantity}
              <input name="quantity" type="number" min={1} required className={input} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              {t.maxPerOrder}
              <input name="maxPerOrder" type="number" min={1} max={100} defaultValue={10} className={input} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              {t.salesEnd}
              <input name="salesEnd" type="datetime-local" className={input} />
            </label>
            <button className={`${buttonClass} self-end`} disabled={busy}>
              {t.addType}
            </button>
          </form>
        </details>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">{t.orders}</h2>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => reload(q));
          }}
        >
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.search} className={`${input} min-w-0 flex-1`} />
          <button className={secondaryButtonClass}>🔍</button>
        </form>
        {others.length === 0 ? (
          <p className="text-sm text-muted">{t.none}</p>
        ) : (
          <ul className="divide-y divide-line rounded-xl border border-line">
            {others.map((o) => (
              <li key={o.id} className={`flex items-start justify-between gap-2 px-4 py-3 ${o.status === "PAID" ? "" : "text-muted"}`}>
                <span>
                  <span className="font-mono font-semibold">{o.reference}</span> · {o.buyerName}
                  <span className="block text-xs text-muted">
                    {[o.items.map((i) => `${i.quantity}× ${i.name}`).join(", "), o.buyerPhone, time(o.createdAt), o.status === "PAID" && fill(t.entered, { count: o.ticketsEntered }), o.cancelledReason]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="font-semibold">{formatAmount(o.total, o.currency)}</span>
                  <span className="block text-xs">{t.statuses[o.status]}</span>
                  {o.status === "PAID" && (
                    <button
                      type="button"
                      className="text-xs text-red-700 underline"
                      onClick={() => {
                        const reason = window.prompt(t.cancelReason);
                        if (reason?.trim()) run(() => clientApi(`${base}/orders/${o.id}/cancel`, { method: "POST", body: { reason } }));
                      }}
                    >
                      {t.cancel}
                    </button>
                  )}
                  {o.status === "EXPIRED" && (
                    <button type="button" className="block text-xs text-emerald-700 underline" onClick={() => run(() => clientApi(`${base}/orders/${o.id}/confirm`, { method: "POST" }))}>
                      {t.confirm}
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
