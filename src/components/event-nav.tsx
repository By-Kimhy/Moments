import Link from "next/link";
import type { Messages } from "@/i18n/km";

/** Tabs across the top of an event's pages. */
export function EventNav({ eventId, active, t }: { eventId: string; active: "overview" | "guests" | "checkin" | "gifts" | "reports"; t: Messages["nav"] }) {
  const tabs = [
    { key: "overview", href: `/events/${eventId}`, label: t.overview },
    { key: "guests", href: `/events/${eventId}/guests`, label: t.guests },
    { key: "checkin", href: `/events/${eventId}/checkin`, label: t.checkin },
    { key: "gifts", href: `/events/${eventId}/gifts`, label: t.gifts },
    { key: "reports", href: `/events/${eventId}/reports`, label: t.reports },
  ] as const;
  return (
    <nav className="-mx-4 flex gap-1 overflow-x-auto border-b border-line px-4">
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          className={`shrink-0 border-b-2 px-3 py-2 text-sm ${tab.key === active ? "border-accent font-semibold text-accent" : "border-transparent text-muted"}`}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
