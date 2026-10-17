import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getMessages } from "@/i18n";
import { fill } from "@/i18n/format";
import { apiGet } from "@/lib/api";
import { requireUser } from "@/lib/dal";
import { formatDateTime } from "@/lib/dates";
import { buttonClass, secondaryButtonClass } from "@/components/form";
import type { AdminVendorsResponse, VendorStatus } from "@api/contract";
import { featureVendor, moderateVendor } from "@/app/actions/vendors";
import { categoryName, provinceName } from "@/components/vendor-card";
import { AdminHeader } from "../admin-header";

const STATUSES: VendorStatus[] = ["PENDING_REVIEW", "PUBLISHED", "SUSPENDED", "DRAFT"];
const smallInput = "rounded-lg border border-line bg-white px-2 py-1.5 text-sm dark:bg-zinc-900";

export default async function AdminVendorsPage({ searchParams }: PageProps<"/admin/vendors">) {
  const user = await requireUser();
  if (!user.isAdmin) notFound();
  const { status: raw } = await searchParams;
  const status = STATUSES.find((s) => s === raw) ?? "PENDING_REVIEW";
  const [t, locale, { vendors, counts }] = await Promise.all([getMessages(), getLocale(), apiGet<AdminVendorsResponse>(`/admin/vendors?status=${status}`)]);
  return (
    <div className="flex flex-col gap-6 py-8">
      <AdminHeader active="vendors" t={t} />
      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">{t.admin.vendors}</h2>
        <nav className="-mx-4 flex gap-1 overflow-x-auto border-b border-line px-4">
          {STATUSES.map((s) => (
            <Link
              key={s}
              href={`/admin/vendors?status=${s}`}
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
    </div>
  );
}
