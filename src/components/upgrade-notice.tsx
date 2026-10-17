import Link from "next/link";
import type { Messages } from "@/i18n/km";

/** Shown where a feature needs a higher plan, with a link to the event's plan page. */
export function UpgradeNotice({ eventId, t }: { eventId: string; t: Messages["plans"] }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-amber-50 p-4 text-amber-900" data-testid="upgrade-notice">
      <p className="text-sm">{t.needsPremium}</p>
      <Link href={`/events/${eventId}/plan`} className="rounded-lg bg-amber-900 px-3 py-2 text-sm font-medium text-white">
        {t.needsUpgrade}
      </Link>
    </div>
  );
}
