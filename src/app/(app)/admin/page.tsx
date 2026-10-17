import { notFound } from "next/navigation";
import type { AdminStats } from "@api/contract";
import { formatAmount } from "@api/lib/money";
import { getLocale, getMessages } from "@/i18n";
import { fill } from "@/i18n/format";
import { apiGet } from "@/lib/api";
import { requireUser } from "@/lib/dal";
import { localDigits } from "@/lib/dates";
import { AdminHeader } from "./admin-header";

// The platform at a glance: users, events, vendors and income.
export default async function AdminOverview() {
  const user = await requireUser();
  if (!user.isAdmin) notFound();
  const [t, locale, stats] = await Promise.all([getMessages(), getLocale(), apiGet<AdminStats>("/admin/stats")]);
  const km = locale === "km";
  const n = (value: number) => localDigits(value.toLocaleString("en-US"), locale);
  const money = (m: { USD: number; KHR: number }) =>
    [m.USD || !m.KHR ? formatAmount(m.USD, "USD", km) : null, m.KHR ? formatAmount(m.KHR, "KHR", km) : null].filter(Boolean).join(" + ");
  const monthName = (key: string) => new Intl.DateTimeFormat(km ? "km-KH" : "en-GB", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${key}-01T00:00:00Z`));
  const tiles = [
    { label: t.admin.users, value: n(stats.users.total), note: fill(t.admin.newUsers, { count: n(stats.users.last30Days) }) },
    { label: t.admin.weddings, value: n(stats.events.byType.WEDDING ?? 0), note: fill(t.admin.upcoming, { count: n(stats.events.upcoming30Days) }) },
    { label: t.admin.ticketed, value: n(stats.events.byType.TICKETED ?? 0), note: "" },
    { label: t.admin.organizations, value: n(stats.organizations), note: "" },
    {
      label: t.admin.vendorsPublished,
      value: n(stats.vendors.byStatus.PUBLISHED ?? 0),
      note: [fill(t.admin.enquiries30, { count: n(stats.vendors.enquiries30Days) }), stats.vendors.byStatus.PENDING_REVIEW ? fill(t.admin.pendingReview, { count: n(stats.vendors.byStatus.PENDING_REVIEW) }) : ""]
        .filter(Boolean)
        .join(" · "),
    },
  ];
  return (
    <div className="flex flex-col gap-6 py-8">
      <AdminHeader active="overview" t={t} />
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3" data-testid="admin-stats">
        {tiles.map((tile) => (
          <div key={tile.label} className="flex flex-col gap-1 rounded-xl border border-line p-3">
            <dt className="text-sm text-muted">{tile.label}</dt>
            <dd className="text-2xl font-semibold">{tile.value}</dd>
            {tile.note && <dd className="text-xs text-muted">{tile.note}</dd>}
          </div>
        ))}
      </dl>

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">{t.admin.income}</h2>
        <dl className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-emerald-50 p-3 text-emerald-950">
            <dt className="text-sm">{t.admin.planIncome}</dt>
            <dd className="text-xl font-semibold" data-testid="plan-income">{money(stats.income.plans)}</dd>
          </div>
          <div className="rounded-xl bg-sky-50 p-3 text-sky-950">
            <dt className="text-sm">{t.admin.ticketFees}</dt>
            <dd className="text-xl font-semibold">{money(stats.income.ticketFees)}</dd>
          </div>
        </dl>
        <div className="-mx-4 overflow-x-auto px-4">
          <table className="w-full min-w-[30rem] text-sm">
            <thead className="text-left text-muted">
              <tr>
                <th className="py-2 font-normal">{t.admin.month}</th>
                <th className="py-2 text-right font-normal">{t.admin.users}</th>
                <th className="py-2 text-right font-normal">{t.admin.newEvents}</th>
                <th className="py-2 text-right font-normal">{t.admin.planIncome}</th>
                <th className="py-2 text-right font-normal">{t.admin.ticketFees}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {[...stats.months].reverse().map((m) => (
                <tr key={m.month}>
                  <td className="py-2">{monthName(m.month)}</td>
                  <td className="py-2 text-right tabular-nums">{n(m.users)}</td>
                  <td className="py-2 text-right tabular-nums">{n(m.events)}</td>
                  <td className="py-2 text-right tabular-nums">{money(m.plans)}</td>
                  <td className="py-2 text-right tabular-nums">{money(m.ticketFees)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">{t.admin.byPlan}</h2>
        <ul className="flex flex-wrap gap-2 text-sm">
          {(["FREE", "STANDARD", "PREMIUM"] as const).map((p) => (
            <li key={p} className="rounded-full bg-black/5 px-3 py-1">
              {t.plans.names[p]}: {n(stats.events.weddingsByPlan[p] ?? 0)}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
