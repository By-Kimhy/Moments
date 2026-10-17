import Link from "next/link";
import { notFound } from "next/navigation";
import type { AdminReportsResponse } from "@api/contract";
import { moderateVendor, resolveReport, setReviewHidden } from "@/app/actions/vendors";
import { buttonClass, secondaryButtonClass } from "@/components/form";
import { getLocale, getMessages } from "@/i18n";
import { fill } from "@/i18n/format";
import { apiGet } from "@/lib/api";
import { requireUser } from "@/lib/dal";
import { formatDateTime } from "@/lib/dates";
import { AdminHeader } from "../admin-header";

// Reports from hosts about vendors and reviews, oldest first.
export default async function AdminReportsPage() {
  const user = await requireUser();
  if (!user.isAdmin) notFound();
  const [t, locale, { reports }] = await Promise.all([getMessages(), getLocale(), apiGet<AdminReportsResponse>("/admin/reports")]);
  return (
    <div className="flex flex-col gap-6 py-8">
      <AdminHeader active="reports" t={t} />
      <h2 className="font-semibold">{t.admin.reportsTitle}</h2>
      {reports.length === 0 && <p className="text-sm text-muted">{t.admin.empty}</p>}
      <ul className="flex flex-col gap-3">
        {reports.map((r) => (
          <li key={r.id} className="flex flex-col gap-2 rounded-xl border border-line p-4" data-testid="report">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="rounded-full bg-red-50 px-2 py-0.5 text-sm text-red-800">{t.vendors.reportReasons[r.reason]}</span>
              <span className="text-xs text-muted">
                {fill(t.admin.reportedBy, { name: r.reporter })} · {formatDateTime(r.createdAt, locale)}
              </span>
            </div>
            <Link href={`/vendors/${r.vendor.slug}`} className="font-semibold underline">
              {r.vendor.name}
            </Link>
            {r.review && (
              <blockquote className="border-l-2 border-line pl-3 text-sm">
                <span className="text-muted">{fill(t.admin.aboutReview, { name: r.review.author })} · {"★".repeat(r.review.rating)}</span>
                {r.review.text && <p>{r.review.text}</p>}
              </blockquote>
            )}
            {r.note && <p className="text-sm">“{r.note}”</p>}
            <div className="flex flex-wrap gap-2">
              <form action={resolveReport.bind(null, r.id)}>
                <button className={buttonClass}>{t.admin.resolve}</button>
              </form>
              {r.review && !r.review.hidden && (
                <form action={setReviewHidden.bind(null, r.review.id, true)}>
                  <button className={secondaryButtonClass}>{t.admin.hide}</button>
                </form>
              )}
              {!r.review && r.vendor.status === "PUBLISHED" && (
                <form action={moderateVendor.bind(null, r.vendor.id, "suspend")}>
                  <input type="hidden" name="note" value={r.note ?? t.vendors.reportReasons[r.reason]} />
                  <button className={`${secondaryButtonClass} text-red-700`}>{t.admin.suspend}</button>
                </form>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
