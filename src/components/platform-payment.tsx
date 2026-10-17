import type { PlanOrderView } from "@api/contract";
import { formatAmount } from "@api/lib/money";
import { BakongWaiter } from "@/components/bakong-waiter";
import { fill } from "@/i18n/format";
import type { Messages } from "@/i18n/km";

/** A payment waiting for the platform: the amount, the reference to write, and the KHQR. */
export function PendingPayment({
  order,
  title,
  platformKhqr,
  cancel,
  t,
  locale,
}: {
  order: PlanOrderView;
  title: string;
  platformKhqr: boolean;
  cancel: () => Promise<void>;
  t: Messages["plans"];
  locale: "km" | "en";
}) {
  const price = formatAmount(order.amount, order.currency, locale === "km");
  return (
    <section className="flex flex-col items-center gap-3 rounded-xl border-2 border-accent p-4 text-center" data-testid="plan-payment">
      <h2 className="font-semibold">{title}</h2>
      <p className="text-3xl font-semibold">{price}</p>
      <p className="text-sm text-muted">{order.khqr ? fill(t.autoHint, { price }) : platformKhqr ? fill(t.payHint, { price }) : t.noKhqr}</p>
      <p className="text-sm">
        {t.reference}:{" "}
        <span className="font-mono text-2xl font-bold tracking-widest" data-testid="plan-reference">
          {order.reference}
        </span>
      </p>
      {order.khqr ? (
        // eslint-disable-next-line @next/next/no-img-element -- SVG from the API
        <img src={`/api/platform/orders/${order.id}/khqr.svg`} alt="KHQR" className="w-56 rounded-xl bg-white p-2" />
      ) : (
        platformKhqr && (
          // eslint-disable-next-line @next/next/no-img-element -- the QR must not be re-compressed
          <img src="/api/platform/khqr" alt="KHQR" className="w-56 rounded-xl bg-white p-2" />
        )
      )}
      {order.khqr ? <BakongWaiter orderId={order.id} label={t.autoWaiting} /> : <p className="rounded-full bg-amber-50 px-3 py-1 text-sm text-amber-900">{t.waiting}</p>}
      <form action={cancel}>
        <button className="text-sm text-muted underline">{t.cancel}</button>
      </form>
    </section>
  );
}
