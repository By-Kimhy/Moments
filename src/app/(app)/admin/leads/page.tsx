import Link from "next/link";
import { notFound } from "next/navigation";
import type { AdminLeadsResponse } from "@api/contract";
import { secondaryButtonClass } from "@/components/form";
import { categoryName, provinceName } from "@/components/vendor-card";
import { getLocale, getMessages } from "@/i18n";
import { fill } from "@/i18n/format";
import { apiGet } from "@/lib/api";
import { requireUser } from "@/lib/dal";
import { localDigits } from "@/lib/dates";
import { AdminHeader } from "../admin-header";

// Enquiries each vendor received in a month: the basis for charging per lead.
export default async function AdminLeadsPage({ searchParams }: PageProps<"/admin/leads">) {
  const user = await requireUser();
  if (!user.isAdmin) notFound();
  const { month } = await searchParams;
  const query = typeof month === "string" ? `?month=${encodeURIComponent(month)}` : "";
  const [t, locale, data] = await Promise.all([getMessages(), getLocale(), apiGet<AdminLeadsResponse>(`/admin/leads${query}`)]);
  const monthName = (key: string) => new Intl.DateTimeFormat(locale === "km" ? "km-KH" : "en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${key}-01T00:00:00Z`));
  const n = (v: number) => localDigits(String(v), locale);
  return (
    <div className="flex flex-col gap-6 py-8">
      <AdminHeader active="leads" t={t} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">
          {t.admin.leadsTitle} · {monthName(data.month)}
        </h2>
        <a href={`/api/admin/leads?month=${data.month}&format=csv`} className={secondaryButtonClass}>
          {t.admin.downloadCsv}
        </a>
      </div>
      <nav className="-mx-4 flex gap-1 overflow-x-auto px-4 text-sm">
        {[...data.months].reverse().map((m) => (
          <Link key={m} href={`/admin/leads?month=${m}`} className={`shrink-0 rounded-full px-3 py-1 ${m === data.month ? "bg-accent text-white" : "bg-black/5"}`}>
            {monthName(m)}
          </Link>
        ))}
      </nav>
      <p className="text-sm text-muted">{fill(t.admin.leadsTotal, { count: n(data.total) })}</p>
      {data.leads.length === 0 ? (
        <p className="text-sm text-muted">{t.admin.empty}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line rounded-xl border border-line" data-testid="leads">
          {data.leads.map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-3 p-3">
              <div className="flex flex-col text-sm">
                <Link href={`/vendors/${l.slug}`} className="font-medium underline">
                  {l.name}
                </Link>
                <span className="text-muted">
                  {categoryName(l.category, locale)} · {provinceName(l.province, locale)} · {l.owner.name} {l.owner.phone}
                </span>
              </div>
              <span className="text-lg font-semibold tabular-nums">{n(l.enquiries)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
