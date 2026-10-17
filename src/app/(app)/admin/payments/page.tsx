import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getMessages } from "@/i18n";
import { fill } from "@/i18n/format";
import { apiGet } from "@/lib/api";
import { requireUser } from "@/lib/dal";
import { formatDateTime } from "@/lib/dates";
import { buttonClass, secondaryButtonClass } from "@/components/form";
import type { AdminPlanOrdersResponse } from "@api/contract";
import { formatAmount } from "@api/lib/money";
import { confirmPlanOrder, rejectPlanOrder } from "@/app/actions/plans";
import { AdminHeader } from "../admin-header";

export default async function AdminPaymentsPage({ searchParams }: PageProps<"/admin/payments">) {
  const user = await requireUser();
  if (!user.isAdmin) notFound();
  await searchParams;
  const [t, locale, { orders }] = await Promise.all([getMessages(), getLocale(), apiGet<AdminPlanOrdersResponse>("/admin/plan-orders")]);
  return (
    <div className="flex flex-col gap-6 py-8">
      <AdminHeader active="payments" t={t} />
      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">{t.plans.adminTitle}</h2>
        {orders.length === 0 && <p className="text-sm text-muted">{t.admin.empty}</p>}
        <ul className="flex flex-col gap-2">
          {orders.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line p-3" data-testid="plan-order">
              <div className="flex flex-col text-sm">
                <span className="font-medium">
                  {o.reference} · {t.plans.purposes[o.purpose]} ·{" "}
                  {o.target.link ? (
                    <Link href={o.target.link} className="underline">
                      {locale === "en" && o.target.titleEn ? o.target.titleEn : o.target.titleKm}
                    </Link>
                  ) : (
                    o.target.titleKm
                  )}
                  {o.plan ? ` → ${t.plans.names[o.plan]}` : ""}
                  {o.units ? ` · ${fill(o.purpose === "VENDOR_FEATURED" ? t.plans.days : t.plans.monthsCount, { count: o.units })}` : ""}
                  {" · "}
                  {formatAmount(o.amount, o.currency, locale === "km")}
                </span>
                <span className="text-muted">
                  {o.payer && `${fill(t.plans.payer, { name: o.payer.name, phone: o.payer.phone ?? "" })} · `}
                  {formatDateTime(o.createdAt, locale)}
                </span>
              </div>
              <div className="flex gap-2">
                <form action={confirmPlanOrder.bind(null, o.id)}>
                  <button className={buttonClass}>{t.plans.confirm}</button>
                </form>
                <form action={rejectPlanOrder.bind(null, o.id)}>
                  <button className={secondaryButtonClass}>{t.plans.cancel}</button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
