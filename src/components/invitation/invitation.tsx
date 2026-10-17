// The invitation card guests see, in one of three styles. Colours and fonts come from the
// template's config; the layout differs a little per style.
import type { CSSProperties, ReactNode } from "react";
import type { GuestGift, InvitationEvent, InvitationGuest } from "@api/contract";
import type { Messages } from "@/i18n/km";
import { invitationDate, localDigits } from "@/lib/dates";
import { GuestGiftForm } from "./guest-gift-form";
import { PhotoWall } from "./photo-wall";
import { WishForm } from "./wish-form";
import { RsvpForm } from "./rsvp-form";

const fileUrl = (key: string) => `/api/files/${key}`;

const FONT_CLASS: Record<string, string> = { Moul: "font-moul", Battambang: "font-serif", "Kantumruy Pro": "font-sans" };

type Props = {
  event: InvitationEvent;
  guest: InvitationGuest;
  gifts: GuestGift[];
  /** After the wedding: the thank-you text for this guest; replaces the reply and entry QR. */
  thankYou?: string | null;
  token: string | null; // null for the host's preview
  locale: "km" | "en";
  t: Messages["invite"];
  langSwitch: ReactNode;
  notice?: string;
};

export function Invitation({ event, guest, gifts, thankYou, token, locale, t, langSwitch, notice }: Props) {
  const { style, config } = event.template;
  const km = locale === "km";
  const pick = (kmText: string | null, enText: string | null) => (km ? kmText || enText : enText || kmText) ?? "";
  const groom = pick(event.groomNameKm, event.groomNameEn);
  const bride = pick(event.brideNameKm, event.brideNameEn);
  const venue = pick(event.venueKm, event.venueEn);
  const guestName = km ? guest.name : guest.nameAlt || guest.name;
  const { date, time } = invitationDate(event.startsAt, locale);
  const [cover, ...gallery] = event.photos;
  const heading = FONT_CLASS[config.headingFont] ?? "font-moul";
  const body = FONT_CLASS[config.bodyFont] ?? "font-sans";
  const traditional = style === "TRADITIONAL";
  const theme = { "--inv-bg": config.background, "--inv-accent": config.accent, "--inv-text": config.text } as CSSProperties;

  const card = "rounded-2xl p-5 bg-[color-mix(in_srgb,var(--inv-text)_7%,transparent)]";
  const sectionTitle = `${heading} mb-3 text-center text-lg text-[var(--inv-accent)]`;

  return (
    <div style={theme} className={`${body} min-h-full flex-1 bg-[var(--inv-bg)] text-[var(--inv-text)]`}>
      {notice && <p className="bg-amber-100 px-4 py-2 text-center text-sm text-amber-900">{notice}</p>}
      <div className="mx-auto flex max-w-md flex-col gap-6 px-4 pb-12 pt-4">
        <div className="flex justify-end">{langSwitch}</div>

        <section
          className={`relative flex flex-col items-center gap-4 text-center ${
            traditional ? "rounded-3xl border-2 border-[var(--inv-accent)] p-6 outline outline-1 outline-offset-4 outline-[var(--inv-accent)]" : ""
          }`}
        >
          {cover && (
            // eslint-disable-next-line @next/next/no-img-element -- stored photos are already resized WebP
            <img
              src={fileUrl(cover.key)}
              alt=""
              className={`w-full object-cover ${style === "MODERN" ? "aspect-[4/5] rounded-t-full" : style === "MINIMAL" ? "aspect-[4/3]" : "aspect-square rounded-2xl"}`}
            />
          )}
          <p className="text-sm opacity-80">{t.dear}</p>
          <p className={`${heading} text-2xl text-[var(--inv-accent)]`}>{guestName}</p>
          {guest.tableName && (
            <p className="rounded-full border border-[var(--inv-accent)] px-4 py-1 text-sm text-[var(--inv-accent)]">
              {t.yourTable.replace("{table}", localDigits(guest.tableName, locale))}
            </p>
          )}
          <p className="text-sm opacity-80">{t.invitedTo}</p>
          {groom || bride ? (
            <div className="flex flex-col items-center gap-1">
              {groom && (
                <p className={`${heading} text-xl`}>
                  <span className="block text-xs opacity-70">{t.groom}</span>
                  {groom}
                </p>
              )}
              {groom && bride && <span className="text-[var(--inv-accent)]">{t.and}</span>}
              {bride && (
                <p className={`${heading} text-xl`}>
                  <span className="block text-xs opacity-70">{t.bride}</span>
                  {bride}
                </p>
              )}
            </div>
          ) : (
            <h1 className={`${heading} text-2xl`}>{pick(event.titleKm, event.titleEn)}</h1>
          )}
        </section>

        {thankYou && (
          <section className={`${card} flex flex-col gap-3 text-center`}>
            <h2 className={sectionTitle}>🙏 {t.thankYou}</h2>
            <p className="whitespace-pre-line">{thankYou}</p>
          </section>
        )}

        <section className={`${card} flex flex-col gap-3 text-center`}>
          <div>
            <p className="text-xs opacity-70">{t.date}</p>
            <p className="text-lg font-semibold">{date}</p>
            <p>
              {t.time} {time}
            </p>
          </div>
          {venue && (
            <div>
              <p className="text-xs opacity-70">{t.venue}</p>
              <p className="font-semibold">{venue}</p>
            </div>
          )}
          {event.mapUrl && (
            <a
              href={event.mapUrl}
              target="_blank"
              rel="noreferrer"
              className="mx-auto rounded-full border border-[var(--inv-accent)] px-4 py-1.5 text-sm text-[var(--inv-accent)]"
            >
              {t.map}
            </a>
          )}
        </section>

        {event.schedule.length > 0 && (
          <section className={card}>
            <h2 className={sectionTitle}>{t.schedule}</h2>
            <ol className="flex flex-col gap-2">
              {event.schedule.map((item, i) => (
                <li key={i} className="flex gap-3">
                  <span className="w-14 shrink-0 font-semibold text-[var(--inv-accent)]">{localDigits(item.time, locale)}</span>
                  <span>{pick(item.titleKm, item.titleEn)}</span>
                </li>
              ))}
            </ol>
          </section>
        )}

        {!thankYou && (
          <section className={card}>
            <h2 className={sectionTitle}>{t.rsvpTitle}</h2>
            <RsvpForm token={token} guest={guest} open={event.rsvpOpen} language={locale} t={t} />
          </section>
        )}

        {gallery.length > 0 && (
          <section>
            <h2 className={sectionTitle}>{t.photos}</h2>
            <div className="grid grid-cols-2 gap-2">
              {gallery.map((photo) => (
                // eslint-disable-next-line @next/next/no-img-element -- stored photos are already resized WebP
                <img key={photo.key} src={fileUrl(photo.key)} alt="" loading="lazy" className="aspect-square w-full rounded-xl object-cover" />
              ))}
            </div>
          </section>
        )}

        {token && event.status !== "ARCHIVED" && (
          <section className={card}>
            <h2 className={sectionTitle}>{t.wishTitle}</h2>
            <WishForm token={token} t={t} />
          </section>
        )}

        {token && event.photoWall && (
          <section className={card}>
            <h2 className={sectionTitle}>{t.wallTitle}</h2>
            <PhotoWall token={token} t={t} />
          </section>
        )}

        {event.khqrImageKey && (
          <section className={`${card} flex flex-col items-center gap-3 text-center`}>
            <h2 className={sectionTitle}>{t.gift}</h2>
            <p className="text-sm opacity-80">{t.giftHint}</p>
            {/* eslint-disable-next-line @next/next/no-img-element -- the QR must not be re-compressed */}
            <img src={fileUrl(event.khqrImageKey)} alt="KHQR" className="w-56 rounded-xl bg-white p-2" />
            {event.khqrAccountName && (
              <p className="text-sm">
                {t.accountName}: <span className="font-semibold">{event.khqrAccountName}</span>
              </p>
            )}
            <a href={fileUrl(event.khqrImageKey)} download="khqr.png" className="text-sm underline">
              {t.saveQr}
            </a>
            {token && event.status !== "ARCHIVED" && <GuestGiftForm token={token} gifts={gifts} language={locale} t={t} />}
          </section>
        )}

        {token && !thankYou && (
          <section className={`${card} flex flex-col items-center gap-3 text-center`}>
            <h2 className={sectionTitle}>{t.entry}</h2>
            {/* eslint-disable-next-line @next/next/no-img-element -- SVG from the API */}
            <img src={`/api/invitations/${token}/qr.svg`} alt="QR" className="w-44 rounded-xl bg-white p-2" />
            <p className="text-sm opacity-80">{t.entryHint}</p>
          </section>
        )}

        {event.planner ? (
          <div className="flex flex-col items-center gap-2 text-center text-xs opacity-80">
            {event.planner.logoKey && (
              // eslint-disable-next-line @next/next/no-img-element -- stored logo, already resized
              <img src={fileUrl(event.planner.logoKey)} alt="" className="size-12 rounded-lg object-cover" />
            )}
            <span>{t.plannedBy.replace("{name}", event.planner.name)}</span>
          </div>
        ) : (
          event.branding && <p className="text-center text-xs opacity-60">{t.footer}</p>
        )}
      </div>
    </div>
  );
}
