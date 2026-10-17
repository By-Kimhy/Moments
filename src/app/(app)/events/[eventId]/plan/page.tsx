import Link from "next/link";
import type { HostEvent, PlanResponse } from "@api/contract";
import { formatAmount } from "@api/lib/money";
import { cancelPlanOrder, orderPlan } from "@/app/actions/plans";
import { EventNav } from "@/components/event-nav";
import { PendingPayment } from "@/components/platform-payment";
import { buttonClass, secondaryButtonClass } from "@/components/form";
import { getLocale, getMessages } from "@/i18n";
import { fill } from "@/i18n/format";
import { apiGet } from "@/lib/api";
import { formatDateTime, localDigits } from "@/lib/dates";

// The event's plan: what each plan includes, upgrading, and paying the platform's KHQR.
export default async function PlanPage({ params }: PageProps<"/events/[eventId]/plan">) {
  const { eventId } = await params;
  const [t, locale, { event }, data] = await Promise.all([
    getMessages(),
    getLocale(),
    apiGet<{ event: HostEvent }>(`/events/${eventId}`),
    apiGet<PlanResponse>(`/events/${eventId}/plan`),
  ]);
  const tp = t.plans;
  const title = locale === "en" && event.titleEn ? event.titleEn : event.titleKm;
  const money = (cents: number) => formatAmount(cents, "USD", locale === "km");
  const count = (n: number) => localDigits(n.toLocaleString("en-US"), locale);
  const fixed = data.effectivePlan === "PLANNER" || event.type === "TICKETED";
  return (
    <div className="flex flex-col gap-6 py-8">
      <div>
        <Link href={`/events/${eventId}`} className="text-sm text-muted">
          ← {title}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">{tp.title}</h1>
      </div>
      <EventNav eventId={eventId} active="overview" t={t.nav} type={event.type} />
      <p className="font-medium" data-testid="current-plan">
        {fill(tp.current, { plan: tp.names[data.effectivePlan] })}
        {!fixed && <span className="ml-2 text-sm font-normal text-muted">· {fill(tp.guestsUsed, { used: count(data.guests), max: count(data.features.maxGuests) })}</span>}
      </p>
      {fixed && <p className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900">{data.effectivePlan === "PLANNER" ? tp.plannerHint : tp.ticketedHint}</p>}

      {data.pending && (
        <PendingPayment
          order={data.pending}
          title={fill(tp.payTitle, { plan: tp.names[data.pending.plan ?? "STANDARD"] })}
          platformKhqr={data.platformKhqr}
          cancel={cancelPlanOrder.bind(null, eventId, data.pending.id)}
          t={tp}
          locale={locale}
        />
      )}

      {!fixed && (
        <ul className="grid gap-3 sm:grid-cols-3">
          {data.plans.map((p) => {
            const current = p.plan === data.plan;
            return (
              <li key={p.plan} className={`flex flex-col gap-3 rounded-xl border p-4 ${current ? "border-accent bg-accent/5" : "border-line"}`}>
                <div>
                  <h2 className="text-lg font-semibold">{tp.names[p.plan]}</h2>
                  <p className="text-sm text-muted">{fill(tp.perEvent, { price: money(p.price) })}</p>
                </div>
                <ul className="flex flex-1 flex-col gap-1 text-sm">
                  <li>✓ {fill(tp.guests, { count: count(p.maxGuests) })}</li>
                  <li>✓ {p.allTemplates ? tp.templatesAll : tp.templatesOne}</li>
                  <li className={p.seating ? "" : "text-muted line-through"}>{p.seating ? "✓" : "✗"} {tp.seating}</li>
                  <li className={p.branding ? "text-muted line-through" : ""}>{p.branding ? "✗" : "✓"} {tp.noBranding}</li>
                </ul>
                {current ? (
                  <span className="rounded-full bg-accent px-3 py-1 text-center text-sm text-white">{tp.included}</span>
                ) : (
                  p.upgradePrice !== null &&
                  p.plan !== "FREE" && (
                    <form action={orderPlan.bind(null, eventId, p.plan)}>
                      <button className={`${data.pending?.plan === p.plan ? secondaryButtonClass : buttonClass} w-full`}>
                        {fill(tp.upgrade, { plan: tp.names[p.plan], price: money(p.upgradePrice) })}
                      </button>
                    </form>
                  )
                )}
              </li>
            );
          })}
        </ul>
      )}

      {data.orders.some((o) => o.status !== "PENDING") && (
        <section className="flex flex-col gap-2">
          <h2 className="font-semibold">{tp.history}</h2>
          <ul className="flex flex-col divide-y divide-line text-sm">
            {data.orders
              .filter((o) => o.status !== "PENDING")
              .map((o) => (
                <li key={o.id} className="flex justify-between gap-2 py-2">
                  <span>
                    {tp.names[o.plan ?? "STANDARD"]} · {money(o.amount)} · <span className="font-mono">{o.reference}</span>
                  </span>
                  <span className="text-muted">
                    {tp.orderStatus[o.status]} {o.paidAt && `· ${formatDateTime(o.paidAt, locale)}`}
                  </span>
                </li>
              ))}
          </ul>
        </section>
      )}
    </div>
  );
}
