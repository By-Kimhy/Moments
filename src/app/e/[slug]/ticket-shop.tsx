"use client";

import { useActionState, useState } from "react";
import type { PublicTicketEvent } from "@api/contract";
import { formatAmount } from "@api/lib/money";
import { placeOrder } from "@/app/actions/shop";
import { Field, Message, buttonClass } from "@/components/form";
import type { Messages } from "@/i18n/km";
import { fill } from "@/i18n/format";

type Props = { slug: string; language: "km" | "en"; ticketTypes: PublicTicketEvent["ticketTypes"]; t: Messages["shop"] };

export function TicketShop({ slug, language, ticketTypes, t }: Props) {
  const [state, action, pending] = useActionState(placeOrder.bind(null, slug, language), undefined);
  const [qty, setQty] = useState<Record<string, number>>({});
  const chosen = ticketTypes.filter((tt) => (qty[tt.id] ?? 0) > 0);
  const currency = chosen[0]?.currency;
  const total = chosen.reduce((s, tt) => s + tt.price * qty[tt.id], 0);
  const set = (id: string, n: number) => setQty((q) => ({ ...q, [id]: n }));
  const khmer = language === "km";

  return (
    <form action={action} className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold">{t.buy}</h2>
      <ul className="flex flex-col gap-2">
        {ticketTypes.map((tt) => {
          const max = Math.min(tt.maxPerOrder, tt.available);
          const n = qty[tt.id] ?? 0;
          // One currency per order: other currencies wait until this one is cleared.
          const blocked = Boolean(currency && currency !== tt.currency);
          return (
            <li key={tt.id} className="flex items-center justify-between gap-3 rounded-xl border border-line p-3">
              <span>
                <span className="font-semibold">{tt.name}</span> · {formatAmount(tt.price, tt.currency, khmer)}
                {tt.description && <span className="block text-sm text-muted">{tt.description}</span>}
                <span className="block text-xs text-muted">{!tt.onSale ? t.notYet : tt.available === 0 ? t.soldOut : fill(t.left, { count: tt.available })}</span>
              </span>
              {tt.onSale && tt.available > 0 && (
                <span className="flex items-center gap-2">
                  <button type="button" disabled={n === 0} onClick={() => set(tt.id, n - 1)} className="size-10 rounded-full border border-line text-xl disabled:opacity-30">
                    −
                  </button>
                  <span className="w-6 text-center text-lg font-bold">{n}</span>
                  <button type="button" disabled={n >= max || blocked} onClick={() => set(tt.id, n + 1)} className="size-10 rounded-full border border-line text-xl disabled:opacity-30">
                    +
                  </button>
                  <input type="hidden" name={`qty:${tt.id}`} value={n} />
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {chosen.length > 0 && (
        <>
          <p className="text-right text-lg">
            {t.total}: <span className="font-bold">{formatAmount(total, currency!, khmer)}</span>
          </p>
          <Field label={t.yourName} name="buyerName" autoComplete="name" defaultValue={state?.values?.buyerName} errors={state?.errors?.buyerName} required />
          <Field label={t.yourPhone} name="buyerPhone" type="tel" inputMode="tel" autoComplete="tel" hint={t.phoneHint} defaultValue={state?.values?.buyerPhone} errors={state?.errors?.buyerPhone} required />
        </>
      )}
      <Message text={state?.message ?? (state?.errors?.items ?? []).join(" ")} />
      <button className={buttonClass} disabled={pending || chosen.length === 0}>
        {chosen.length ? t.order : t.chooseTickets}
      </button>
    </form>
  );
}
