import Link from "next/link";
import type { Messages } from "@/i18n/km";

const TABS = [
  ["overview", ""],
  ["vendors", "/vendors"],
  ["payments", "/payments"],
  ["leads", "/leads"],
  ["reviews", "/reviews"],
  ["reports", "/reports"],
] as const;

/** Title and tabs of the platform admin pages. */
export function AdminHeader({ active, t }: { active: (typeof TABS)[number][0]; t: Messages }) {
  return (
    <>
      <div>
        <Link href="/dashboard" className="text-sm text-muted">
          ← {t.dashboard.title}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">{t.admin.title}</h1>
      </div>
      <nav className="-mx-4 flex gap-1 overflow-x-auto border-b border-line px-4">
        {TABS.map(([key, path]) => (
          <Link
            key={key}
            href={`/admin${path}`}
            className={`shrink-0 border-b-2 px-3 py-2 text-sm ${key === active ? "border-accent font-semibold text-accent" : "border-transparent text-muted"}`}
          >
            {t.admin.tabs[key]}
          </Link>
        ))}
      </nav>
    </>
  );
}
