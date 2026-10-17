import Link from "next/link";
import type { Messages } from "@/i18n/km";

type Tab = "overview" | "guests" | "seating" | "checkin" | "gifts" | "reports" | "thanks" | "tickets" | "door" | "vendors";

/** Tabs across the top of an event's pages; a ticketed event has its own set. */
export function EventNav({ eventId, active, t, type = "WEDDING" }: { eventId: string; active: Tab; t: Messages["nav"]; type?: "WEDDING" | "TICKETED" }) {
  const wedding: [Tab, string, string][] = [
    ["overview", "", t.overview],
    ["guests", "/guests", t.guests],
    ["seating", "/seating", t.seating],
    ["checkin", "/checkin", t.checkin],
    ["gifts", "/gifts", t.gifts],
    ["reports", "/reports", t.reports],
    ["thanks", "/thank-you", t.thanks],
    ["vendors", "/vendors", t.vendors],
  ];
  const ticketed: [Tab, string, string][] = [
    ["overview", "", t.overview],
    ["tickets", "/tickets", t.tickets],
    ["door", "/door", t.door],
    ["vendors", "/vendors", t.vendors],
  ];
  return (
    <nav className="-mx-4 flex gap-1 overflow-x-auto border-b border-line px-4">
      {(type === "TICKETED" ? ticketed : wedding).map(([key, path, label]) => (
        <Link
          key={key}
          href={`/events/${eventId}${path}`}
          className={`shrink-0 border-b-2 px-3 py-2 text-sm ${key === active ? "border-accent font-semibold text-accent" : "border-transparent text-muted"}`}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
