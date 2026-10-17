import type { Metadata } from "next";
import Link from "next/link";
import type { VendorDirectoryResponse } from "@api/contract";
import { CATEGORY_KEYS, PROVINCE_KEYS, PROVINCES, VENDOR_CATEGORIES } from "@api/lib/vendor-catalog";
import { secondaryButtonClass } from "@/components/form";
import { VendorCard } from "@/components/vendor-card";
import { getLocale, getMessages } from "@/i18n";
import { fill } from "@/i18n/format";
import { apiGet } from "@/lib/api";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages();
  return { title: `${t.vendors.title} · Moments`, description: t.vendors.intro };
}

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

// The public vendor directory, rendered on the server so search engines can read it.
export default async function VendorDirectory({ searchParams }: PageProps<"/vendors">) {
  const sp = await searchParams;
  const filters = { category: one(sp.category), province: one(sp.province), q: one(sp.q), page: one(sp.page) || "1" };
  const query = new URLSearchParams(Object.entries(filters).filter(([, v]) => v));
  const [t, locale, data] = await Promise.all([getMessages(), getLocale(), apiGet<VendorDirectoryResponse>(`/vendors?${query}`)]);
  const pageLink = (page: number) => `/vendors?${new URLSearchParams({ ...Object.fromEntries(query), page: String(page) })}`;
  const pages = Math.ceil(data.total / data.pageSize);
  const select = "rounded-lg border border-line bg-white px-3 py-2.5 text-base dark:bg-zinc-900";
  return (
    <div className="flex flex-col gap-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold">{t.vendors.title}</h1>
        <p className="mt-1 text-muted">{t.vendors.intro}</p>
      </div>
      <form className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]" role="search">
        <select name="category" defaultValue={filters.category} aria-label={t.vendors.category} className={select}>
          <option value="">{t.vendors.allCategories}</option>
          {CATEGORY_KEYS.map((c) => (
            <option key={c} value={c}>
              {VENDOR_CATEGORIES[c][locale]}
            </option>
          ))}
        </select>
        <select name="province" defaultValue={filters.province} aria-label={t.vendors.province} className={select}>
          <option value="">{t.vendors.allProvinces}</option>
          {PROVINCE_KEYS.map((p) => (
            <option key={p} value={p}>
              {PROVINCES[p][locale]}
            </option>
          ))}
        </select>
        <input name="q" defaultValue={filters.q} placeholder={t.vendors.search} className={select} />
        <button className={secondaryButtonClass}>{t.vendors.filter}</button>
      </form>
      <p className="text-sm text-muted">{fill(t.vendors.results, { count: data.total })}</p>
      {data.vendors.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line p-8 text-center text-muted">{t.vendors.none}</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {data.vendors.map((v) => (
            <li key={v.slug} className="flex">
              <VendorCard vendor={v} locale={locale} t={t.vendors} />
            </li>
          ))}
        </ul>
      )}
      {pages > 1 && (
        <nav className="flex justify-between">
          {data.page > 1 ? <Link href={pageLink(data.page - 1)}>{t.vendors.previous}</Link> : <span />}
          {data.page < pages && <Link href={pageLink(data.page + 1)}>{t.vendors.next}</Link>}
        </nav>
      )}
      <Link href="/vendor" className="text-sm text-muted underline">
        {t.vendors.forVendors}
      </Link>
    </div>
  );
}
