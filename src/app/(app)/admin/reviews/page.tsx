import Link from "next/link";
import { notFound } from "next/navigation";
import { getMessages } from "@/i18n";
import { apiGet } from "@/lib/api";
import { requireUser } from "@/lib/dal";
import type { AdminReviewsResponse } from "@api/contract";
import { setReviewHidden } from "@/app/actions/vendors";
import { AdminHeader } from "../admin-header";

export default async function AdminReviewsPage({ searchParams }: PageProps<"/admin/reviews">) {
  const user = await requireUser();
  if (!user.isAdmin) notFound();
  await searchParams;
  const [t, { reviews }] = await Promise.all([getMessages(), apiGet<AdminReviewsResponse>("/admin/reviews")]);
  return (
    <div className="flex flex-col gap-6 py-8">
      <AdminHeader active="reviews" t={t} />
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
