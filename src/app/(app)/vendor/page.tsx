import Link from "next/link";
import type { MyVendorsResponse } from "@api/contract";
import { categoryName } from "@/components/vendor-card";
import { getLocale, getMessages } from "@/i18n";
import { fill } from "@/i18n/format";
import { apiGet } from "@/lib/api";
import { requireUser } from "@/lib/dal";
import { CreateVendorForm } from "./forms";

// A vendor's own business pages, and creating one.
export default async function MyVendors() {
  await requireUser();
  const [t, locale, { vendors }] = await Promise.all([getMessages(), getLocale(), apiGet<MyVendorsResponse>("/vendors/mine")]);
  return (
    <div className="flex flex-col gap-6 py-8">
      <div>
        <Link href="/dashboard" className="text-sm text-muted">
          ← {t.dashboard.title}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">{t.vendors.mine}</h1>
      </div>
      {vendors.length > 0 && (
        <ul className="flex flex-col gap-2">
          {vendors.map((v) => (
            <li key={v.id}>
              <Link href={`/vendor/${v.id}`} className="flex items-center justify-between gap-3 rounded-xl border border-line p-4 hover:bg-black/5">
                <span>
                  <span className="font-semibold">{v.name}</span>
                  <span className="block text-sm text-muted">{categoryName(v.category, locale)}</span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1 text-xs">
                  <span className="rounded-full bg-black/5 px-2 py-0.5">{t.vendors.status[v.status]}</span>
                  {v.unreadEnquiries > 0 && <span className="rounded-full bg-accent px-2 py-0.5 text-white">{fill(t.vendors.unread, { count: v.unreadEnquiries })}</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <section className="flex flex-col gap-3 rounded-xl border border-line p-4">
        <p className="text-sm text-muted">{t.vendors.mineIntro}</p>
        <CreateVendorForm t={t.vendors} locale={locale} />
      </section>
    </div>
  );
}
