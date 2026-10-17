import Link from "next/link";
import type { GiftView } from "@api/contract";
import { formatAmount } from "@api/lib/money";
import { updateGift, voidGift } from "@/app/actions/gifts";
import { GiftForm, VoidForm } from "@/components/gift-forms";
import { getLocale, getMessages } from "@/i18n";
import { fill } from "@/i18n/format";
import { apiGet } from "@/lib/api";
import { formatDateTime } from "@/lib/dates";

type History = { action: string; at: Date; by: string | null; before: Record<string, unknown> | null; after: Record<string, unknown> | null };

const describe = (value: Record<string, unknown> | null) =>
  value && typeof value.amount === "number" && typeof value.currency === "string"
    ? formatAmount(value.amount, value.currency as "USD" | "KHR")
    : value && typeof value.reason === "string"
      ? value.reason
      : "";

export default async function GiftPage({ params }: PageProps<"/events/[eventId]/gifts/[giftId]">) {
  const { eventId, giftId } = await params;
  const [t, locale, { gift, history }] = await Promise.all([
    getMessages(),
    getLocale(),
    apiGet<{ gift: GiftView; history: History[] }>(`/events/${eventId}/gifts/${giftId}/history`),
  ]);
  const g = t.giftBook;
  const editable = !gift.voidedAt && gift.status !== "REJECTED";
  return (
    <div className="flex flex-col gap-6 py-8">
      <div>
        <Link href={`/events/${eventId}/gifts`} className="text-sm text-muted">
          ← {g.title}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">
          {gift.guestName} · {formatAmount(gift.amount, gift.currency)}
        </h1>
        <p className="text-sm text-muted">
          {[g.status[gift.voidedAt ? "VOIDED" : gift.status], g.source[gift.source], gift.recordedBy && fill(g.recordedBy, { name: gift.recordedBy }), formatDateTime(gift.recordedAt, locale)]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {gift.note && <p className="mt-2">“{gift.note}”</p>}
        {gift.voidedAt && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{fill(g.cancelled, { reason: gift.voidReason ?? "" })}</p>}
      </div>

      {editable && (
        <section className="flex flex-col gap-3">
          <h2 className="font-semibold">{g.edit}</h2>
          <GiftForm
            action={updateGift.bind(null, eventId, giftId)}
            t={g}
            desk={t.desk}
            initial={{
              amount: gift.currency === "USD" ? (gift.amount / 100).toFixed(2) : String(gift.amount),
              currency: gift.currency,
              method: gift.method,
              note: gift.note ?? "",
            }}
            submitLabel={t.common.save}
          />
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">{g.history}</h2>
        <ol className="flex flex-col gap-2 border-l-2 border-line pl-4 text-sm">
          {history.map((h, i) => (
            <li key={i}>
              <span className="font-medium">{g.actions[h.action as keyof typeof g.actions] ?? h.action}</span>
              {h.by && ` · ${h.by}`} · <span className="text-muted">{formatDateTime(h.at, locale)}</span>
              {(describe(h.before) || describe(h.after)) && (
                <span className="block text-muted">
                  {describe(h.before)}
                  {describe(h.before) && describe(h.after) && " → "}
                  {describe(h.after)}
                </span>
              )}
            </li>
          ))}
        </ol>
      </section>

      {!gift.voidedAt && (
        <section className="flex flex-col gap-2 rounded-xl border border-red-200 p-4">
          <h2 className="font-semibold">{g.voidTitle}</h2>
          <p className="text-sm text-muted">{g.voidHint}</p>
          <VoidForm action={voidGift.bind(null, eventId, giftId)} t={g} />
        </section>
      )}
    </div>
  );
}
