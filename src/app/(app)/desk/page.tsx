import type { DeskMeResponse } from "@api/contract";
import { leaveDesk } from "@/app/actions/desk";
import { getMessages } from "@/i18n";
import { fill } from "@/i18n/format";
import { ApiError, api } from "@/lib/api";
import { DeskApp } from "@/components/desk/desk-app";
import { InstallButton } from "@/components/pwa";
import { SignOutButton } from "@/components/sign-out";
import { JoinForm } from "./join-form";

// Helpers land here: the join form, or (once joined) the desk for their event.
export default async function DeskPage() {
  const t = await getMessages();
  let desk: DeskMeResponse | null = null;
  try {
    desk = await api.get<DeskMeResponse>("/desk/me");
  } catch (e) {
    if (!(e instanceof ApiError && e.status === 401)) throw e;
  }

  if (!desk) {
    return (
      <div className="mx-auto w-full max-w-sm py-12">
        <h1 className="mb-2 text-2xl font-semibold">{t.desk.joinTitle}</h1>
        <p className="mb-6 text-muted">{t.desk.joinHint}</p>
        <JoinForm t={t.desk} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 py-6">
      <div>
        <p className="text-sm text-muted">{fill(t.desk.welcome, { name: desk.helper.displayName })}</p>
        <h1 className="text-xl font-semibold">{desk.event.titleKm}</h1>
      </div>
      <DeskApp eventId={desk.event.id} memberName={desk.helper.displayName} canSeeAllGifts={false} t={t.desk} sides={t.side} rsvp={t.rsvp} />
      <div className="mt-6 flex flex-col items-start gap-3">
        <InstallButton label={t.pwa.install} iosHint={t.pwa.iosHint} />
        <SignOutButton action={leaveDesk} label={t.desk.leave} unsentWarning={t.pwa.unsent} />
      </div>
    </div>
  );
}
