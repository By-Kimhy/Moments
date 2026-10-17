import Link from "next/link";
import type { InvitationEvent, InvitationGuest } from "@api/contract";
import { Invitation } from "@/components/invitation/invitation";
import { getMessages } from "@/i18n";
import { apiGet } from "@/lib/api";
import { invitationLocale } from "@/lib/invitation";

// The host's preview of the invitation, with a sample guest. Replies can't be sent from here.
export default async function PreviewPage({ params, searchParams }: PageProps<"/events/[eventId]/preview">) {
  const [{ eventId }, { lang }] = await Promise.all([params, searchParams]);
  const [data, locale] = await Promise.all([
    apiGet<{ event: InvitationEvent; guest: InvitationGuest }>(`/events/${eventId}/preview`),
    invitationLocale(lang),
  ]);
  const t = await getMessages(locale);
  const other = locale === "km" ? "en" : "km";
  return (
    <div className="-mx-4 flex flex-1 flex-col">
      <div className="px-4 py-3">
        <Link href={`/events/${eventId}`} className="text-sm text-muted">
          ← {t.nav.overview}
        </Link>
      </div>
      <Invitation
        event={data.event}
        guest={data.guest}
        gifts={[]}
        token={null}
        locale={locale}
        t={t.invite}
        notice={t.invite.preview}
        langSwitch={
          <Link href={`/events/${eventId}/preview?lang=${other}`} className="rounded-full border border-[var(--inv-accent)] px-3 py-1 text-sm">
            {t.invite.switchLang}
          </Link>
        }
      />
    </div>
  );
}
