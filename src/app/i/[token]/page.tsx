import type { Metadata } from "next";
import Link from "next/link";
import { Invitation } from "@/components/invitation/invitation";
import { OpenTracker } from "@/components/invitation/open-tracker";
import { getMessages } from "@/i18n";
import { invitationDate } from "@/lib/dates";
import { getInvitation, invitationLocale } from "@/lib/invitation";

// What Telegram and Facebook show when the link is shared: the event title, the guest's name,
// date and venue, and the cover photo. Bots don't send a language, so this is in Khmer
// unless the link has ?lang=en.
export async function generateMetadata({ params, searchParams }: PageProps<"/i/[token]">): Promise<Metadata> {
  const [{ token }, { lang }] = await Promise.all([params, searchParams]);
  const { event, guest } = await getInvitation(token);
  const locale = lang === "en" ? "en" : "km";
  const t = await getMessages(locale);
  const title = (locale === "en" ? event.titleEn || event.titleKm : event.titleKm) ?? "";
  const { date, time } = invitationDate(event.startsAt, locale);
  const venue = locale === "en" ? event.venueEn || event.venueKm : event.venueKm || event.venueEn;
  const description = [`${t.invite.dear} ${guest.name}`, `${date} ${time}`, venue].filter(Boolean).join(" · ");
  const image = event.photos[0] ? `/api/files/${event.photos[0].key}/og.jpg` : "/og-default.png";
  return {
    title,
    description,
    // Personal links: keep them out of search engines.
    robots: { index: false, follow: false },
    openGraph: { title, description, type: "website", images: [{ url: image, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export default async function InvitationPage({ params, searchParams }: PageProps<"/i/[token]">) {
  const [{ token }, { lang }] = await Promise.all([params, searchParams]);
  const [{ event, guest }, locale] = await Promise.all([getInvitation(token), invitationLocale(lang)]);
  const t = await getMessages(locale);
  const other = locale === "km" ? "en" : "km";
  return (
    <div lang={locale} className="flex min-h-screen flex-col">
      <OpenTracker token={token} />
      <Invitation
        event={event}
        guest={guest}
        token={token}
        locale={locale}
        t={t.invite}
        notice={event.status === "DRAFT" ? t.invite.draft : undefined}
        langSwitch={
          <Link href={`/i/${token}?lang=${other}`} className="rounded-full border border-[var(--inv-accent)] px-3 py-1 text-sm">
            {t.invite.switchLang}
          </Link>
        }
      />
    </div>
  );
}
