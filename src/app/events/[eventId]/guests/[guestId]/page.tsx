import Link from "next/link";
import type { GuestView } from "@api/contract";
import { newGuestLink, updateGuest } from "@/app/actions/guests";
import { GuestForm } from "@/components/guest-form";
import { ShareLink } from "@/components/share-link";
import { getMessages } from "@/i18n";
import { fill } from "@/i18n/format";
import { apiGet } from "@/lib/api";
import { DeleteGuest } from "./delete-guest";

export default async function GuestPage({ params }: PageProps<"/events/[eventId]/guests/[guestId]">) {
  const { eventId, guestId } = await params;
  const [t, { guest }, { groups }] = await Promise.all([
    getMessages(),
    apiGet<{ guest: GuestView }>(`/events/${eventId}/guests/${guestId}`),
    apiGet<{ groups: string[] }>(`/events/${eventId}/guests/groups`),
  ]);
  return (
    <div className="flex flex-col gap-6 py-8">
      <div>
        <Link href={`/events/${eventId}/guests`} className="text-sm text-muted">
          ← {t.guests.title}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">{t.guests.editTitle}</h1>
      </div>

      <div className="flex flex-col gap-1 rounded-xl border border-line p-4 text-sm">
        <span>
          {t.rsvp[guest.rsvpStatus]}
          {guest.rsvpStatus === "ATTENDING" && guest.rsvpCount ? ` · ${fill(t.guests.people, { count: guest.rsvpCount })}` : ""}
        </span>
        {guest.rsvpMessage && (
          <p>
            <span className="text-muted">{t.guests.rsvpMessage}: </span>
            {guest.rsvpMessage}
          </p>
        )}
        <code className="break-all text-xs text-muted">{guest.inviteUrl}</code>
        <ShareLink
          url={guest.inviteUrl}
          text={fill(t.guests.shareText, { name: guest.name })}
          labels={{ copy: t.guests.copyLink, copied: t.guests.copied, telegram: t.guests.shareTelegram }}
        />
        <form action={newGuestLink.bind(null, eventId, guestId)} className="mt-2">
          <button className="underline">{t.guests.newLink}</button> <span className="text-muted">{t.guests.newLinkHint}</span>
        </form>
      </div>

      <GuestForm action={updateGuest.bind(null, eventId, guestId)} t={t.guests} sides={t.side} guest={guest} groups={groups} submitLabel={t.common.save} />

      {guest.giftCount === 0 && !guest.checkedIn && <DeleteGuest eventId={eventId} guestId={guestId} label={t.guests.delete} />}
    </div>
  );
}
