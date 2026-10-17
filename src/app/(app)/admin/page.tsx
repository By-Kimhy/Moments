import Link from "next/link";
import { notFound } from "next/navigation";
import type { AdminPlanOrdersResponse, AdminReviewsResponse, AdminVendorsResponse, VendorStatus } from "@api/contract";
import { formatAmount } from "@api/lib/money";
import { confirmPlanOrder, rejectPlanOrder } from "@/app/actions/plans";
import { featureVendor, moderateVendor, setReviewHidden } from "@/app/actions/vendors";
import { buttonClass, secondaryButtonClass } from "@/components/form";
import { categoryName, provinceName } from "@/components/vendor-card";
import { getLocale, getMessages } from "@/i18n";
import { fill } from "@/i18n/format";
import { apiGet } from "@/lib/api";
import { requireUser } from "@/lib/dal";
import { formatDateTime } from "@/lib/dates";

const STATUSES: VendorStatus[] = ["PENDING_REVIEW", "PUBLISHED", "SUSPENDED", "DRAFT"];
const smallInput = "rounded-lg border border-line bg-white px-2 py-1.5 text-sm dark:bg-zinc-900";

// Platform admins: approve vendor listings, feature them, hide reviews.
export default async function AdminPage({ searchParams }: PageProps<"/admin">) {
  const user = await requireUser();
  if (!user.isAdmin) notFound();
  const { status: raw } = await searchParams;
  const status = STATUSES.find((s) => s === raw) ?? "PENDING_REVIEW";
  const [t, locale, { vendors, counts }, { reviews }, { orders }] = await Promise.all([
    getMessages(),
    getLocale(),
    apiGet<AdminVendorsResponse>(`/admin/vendors?status=${status}`),
    apiGet<AdminReviewsResponse>("/admin/reviews"),
    apiGet<AdminPlanOrdersResponse>("/admin/plan-orders"),
  ]);
  return (
    <div className="flex flex-col gap-6 py-8">
      <div>
        <Link href="/dashboard" className="text-sm text-muted">
          ← {t.dashboard.title}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">{t.admin.title}</h1>
      </div>
      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">{t.plans.adminTitle}</h2>
        {orders.length === 0 && <p className="text-sm text-muted">{t.admin.empty}</p>}
        <ul className="flex flex-col gap-2">
          {orders.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line p-3" data-testid="plan-order">
              <div className="flex flex-col text-sm">
                <span className="font-medium">
                  {fill(t.plans.adminOrder, {
                    reference: o.reference,
                    event: locale === "en" && o.event.titleEn ? o.event.titleEn : o.event.titleKm,
                    plan: t.plans.names[o.plan],
                    price: formatAmount(o.amount, o.currency, locale === "km"),
                  })}
                </span>
                <span className="text-muted">
                  {fill(t.admin.owner, { name: o.owner.name, phone: o.owner.phone ?? "" })} · {formatDateTime(o.createdAt, locale)}
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
      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">{t.admin.vendors}</h2>
        <nav className="-mx-4 flex gap-1 overflow-x-auto border-b border-line px-4">
          {STATUSES.map((s) => (
            <Link
              key={s}
              href={`/admin?status=${s}`}
              className={`shrink-0 border-b-2 px-3 py-2 text-sm ${s === status ? "border-accent font-semibold text-accent" : "border-transparent text-muted"}`}
            >
              {t.vendors.status[s]} ({counts[s] ?? 0})
            </Link>
          ))}
        </nav>
        {vendors.length === 0 && <p className="text-sm text-muted">{t.admin.empty}</p>}
        <ul className="flex flex-col gap-3">
          {vendors.map((v) => (
            <li key={v.id} className="flex flex-col gap-2 rounded-xl border border-line p-4" data-testid="admin-vendor">
              <div className="flex gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element -- stored photos are already resized WebP */}
                {v.photos[0] && <img src={`/api/files/${v.photos[0].key}`} alt="" className="h-20 w-28 shrink-0 rounded-lg object-cover" />}
                <div className="flex min-w-0 flex-col">
                  <span className="font-semibold">{v.name}</span>
                  <span className="text-sm text-muted">
                    {categoryName(v.category, locale)} · {provinceName(v.province, locale)} · {fill(t.admin.enquiries, { count: v.enquiries })}
                  </span>
                  <span className="text-sm text-muted">{fill(t.admin.owner, { name: v.owner.name, phone: v.owner.phone ?? "" })}</span>
                  {v.featuredUntil && v.featuredUntil > new Date() && (
                    <span className="text-sm text-amber-700">{fill(t.admin.featuredUntil, { date: formatDateTime(v.featuredUntil, locale) })}</span>
                  )}
                </div>
              </div>
              {(v.descriptionKm || v.descriptionEn) && <p className="line-clamp-3 text-sm">{v.descriptionKm || v.descriptionEn}</p>}
              <div className="flex flex-wrap items-end gap-2">
                {v.status !== "PUBLISHED" && v.status !== "DRAFT" && (
                  <form action={moderateVendor.bind(null, v.id, "approve")}>
                    <button className={buttonClass}>{t.admin.approve}</button>
                  </form>
                )}
                {v.status === "PUBLISHED" && (
                  <>
                    <Link href={`/vendors/${v.slug}`} className={secondaryButtonClass}>
                      {t.vendors.viewPage}
                    </Link>
                    <form action={featureVendor.bind(null, v.id)} className="flex items-center gap-1">
                      <input name="days" type="number" min={0} max={366} defaultValue={30} aria-label={t.admin.days} className={`${smallInput} w-16`} />
                      <button className={secondaryButtonClass}>{t.admin.feature}</button>
                    </form>
                  </>
                )}
              </div>
              {v.status !== "SUSPENDED" && (
                <details>
                  <summary className="cursor-pointer text-sm text-muted">
                    {v.status === "PENDING_REVIEW" ? `${t.admin.return} / ${t.admin.suspend}` : t.admin.suspend}
                  </summary>
                  <form className="mt-2 flex flex-col gap-2">
                    <input name="note" placeholder={t.admin.note} className={smallInput} />
                    <div className="flex gap-2">
                      {v.status === "PENDING_REVIEW" && (
                        <button formAction={moderateVendor.bind(null, v.id, "return")} className={secondaryButtonClass}>
                          {t.admin.return}
                        </button>
                      )}
                      <button formAction={moderateVendor.bind(null, v.id, "suspend")} className={`${secondaryButtonClass} text-red-700`}>
                        {t.admin.suspend}
                      </button>
                    </div>
                  </form>
                </details>
              )}
            </li>
          ))}
        </ul>
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">{t.admin.reviews}</h2>
        {reviews.length === 0 && <p className="text-sm text-muted">{t.admin.empty}</p>}
        <ul className="flex flex-col divide-y divide-line">
          {reviews.map((r) => (
            <li key={r.id} className={`flex items-start justify-between gap-3 py-3 ${r.hidden ? "opacity-50" : ""}`}>
              <div className="flex flex-col">
                <span className="text-sm">
                  <span className="text-amber-500">{"★".repeat(r.rating)}</span> {r.author} →{" "}
                  <Link href={`/vendors/${r.vendor.slug}`} className="underline">
                    {r.vendor.name}
                  </Link>
                </span>
                {r.text && <p className="text-sm">{r.text}</p>}
              </div>
              <form action={setReviewHidden.bind(null, r.id, !r.hidden)}>
                <button className="text-sm text-muted underline">{r.hidden ? t.admin.show : t.admin.hide}</button>
              </form>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
