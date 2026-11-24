// The top of an invitation: the guest's name and the couple, in one of the template's layouts.
// Each layout arranges the same content differently, so templates differ in shape, not only in
// colour.
import type { ReactNode } from "react";
import type { Messages } from "@/i18n/km";
import { localDigits } from "@/lib/dates";
import { Ornament, type OrnamentName } from "./ornaments";

export type HeroLayout = "classic" | "plain" | "frame" | "arch" | "monogram" | "split" | "ribbon" | "poster" | "stitched";

type Props = {
  layout: HeroLayout;
  ornament?: OrnamentName;
  heading: string; // font class for names
  coverKey: string | null;
  guestName: string;
  tableName: string | null;
  groom: string;
  bride: string;
  title: string;
  locale: "km" | "en";
  t: Messages["invite"];
};

const fileUrl = (key: string) => `/api/files/${key}`;

/** The first letter as a reader sees it (a Khmer consonant with its vowel and marks). */
function initial(name: string) {
  const first = name.trim().split(/\s+/).pop() ?? "";
  const segments = [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(first)];
  return segments[0]?.segment ?? "";
}

function Cover({ coverKey, className }: { coverKey: string | null; className: string }) {
  if (!coverKey) return null;
  // eslint-disable-next-line @next/next/no-img-element -- stored photos are already resized WebP
  return <img src={fileUrl(coverKey)} alt="" className={`w-full object-cover ${className}`} />;
}

/** "Dear …, you are invited to the wedding of" — the same words in every layout. */
function Greeting({ p, light = false }: { p: Props; light?: boolean }) {
  return (
    <>
      <p className="text-sm opacity-80">{p.t.dear}</p>
      <p className={`${p.heading} text-2xl ${light ? "" : "text-[var(--inv-accent)]"}`}>{p.guestName}</p>
      {p.tableName && (
        <p className="rounded-full border border-current px-4 py-1 text-sm opacity-90">
          {p.t.yourTable.replace("{table}", localDigits(p.tableName, p.locale))}
        </p>
      )}
      <p className="text-sm opacity-80">{p.t.invitedTo}</p>
    </>
  );
}

function Couple({ p, size = "text-xl" }: { p: Props; size?: string }) {
  if (!p.groom && !p.bride) return <h1 className={`${p.heading} text-2xl`}>{p.title}</h1>;
  return (
    <div className="flex flex-col items-center gap-1">
      {p.groom && (
        <p className={`${p.heading} ${size}`}>
          <span className="block text-xs opacity-70">{p.t.groom}</span>
          {p.groom}
        </p>
      )}
      {p.groom && p.bride && <span className="text-[var(--inv-accent)]">{p.t.and}</span>}
      {p.bride && (
        <p className={`${p.heading} ${size}`}>
          <span className="block text-xs opacity-70">{p.t.bride}</span>
          {p.bride}
        </p>
      )}
    </div>
  );
}

/** Kbach-style corner pieces for the frame layout. */
function Corner({ className }: { className: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      className={`absolute h-12 w-12 text-[var(--inv-accent)] ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M4 44V12a8 8 0 0 1 8-8h32" />
      <path d="M10 44V18c0-5 3-8 8-8h26" strokeOpacity=".5" />
      <path d="M4 4c8 2 12 6 12 12-6 0-10-4-12-12Z" fill="currentColor" fillOpacity=".6" />
      <circle cx="22" cy="22" r="2" fill="currentColor" />
    </svg>
  );
}

const wrap = (children: ReactNode, className = "") => (
  <section className={`relative flex flex-col items-center gap-4 text-center ${className}`}>{children}</section>
);

export function Hero(p: Props) {
  switch (p.layout) {
    // Ornate frame with decorated corners.
    case "frame":
      return wrap(
        <>
          <Corner className="left-1 top-1" />
          <Corner className="right-1 top-1 -scale-x-100" />
          <Corner className="bottom-1 left-1 -scale-y-100" />
          <Corner className="bottom-1 right-1 -scale-100" />
          <Ornament name={p.ornament} />
          <Greeting p={p} />
          <Couple p={p} size="text-2xl" />
          <Cover coverKey={p.coverKey} className="aspect-[4/3] rounded-lg" />
        </>,
        "rounded-sm border border-[var(--inv-accent)] px-8 py-12",
      );

    // The photo in a tall temple-style arch, names below.
    case "arch":
      return wrap(
        <>
          <Ornament name={p.ornament} />
          {p.coverKey ? (
            <Cover coverKey={p.coverKey} className="aspect-[3/4] w-3/4 rounded-t-full border-4 border-[var(--inv-accent)]" />
          ) : (
            <div className="aspect-[3/4] w-3/4 rounded-t-full border-4 border-[var(--inv-accent)] bg-[color-mix(in_srgb,var(--inv-accent)_12%,transparent)]" />
          )}
          <Greeting p={p} />
          <Couple p={p} size="text-2xl" />
        </>,
      );

    // The couple's initials, large, in a ring.
    case "monogram":
      return wrap(
        <>
          <div className="flex size-44 items-center justify-center rounded-full border-2 border-[var(--inv-accent)] outline outline-1 outline-offset-4 outline-[var(--inv-accent)]">
            <span className={`${p.heading} text-5xl leading-none text-[var(--inv-accent)]`}>
              {p.groom || p.bride ? `${initial(p.groom)}${p.groom && p.bride ? " · " : ""}${initial(p.bride)}` : initial(p.title)}
            </span>
          </div>
          <Ornament name={p.ornament} />
          <Greeting p={p} />
          <Couple p={p} />
          <Cover coverKey={p.coverKey} className="aspect-square rounded-full" />
        </>,
      );

    // Groom and bride side by side, divided by the ornament.
    case "split":
      return wrap(
        <>
          <Cover coverKey={p.coverKey} className="aspect-[16/10] rounded-xl" />
          <Greeting p={p} />
          {p.groom && p.bride ? (
            <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-3">
              <p className={`${p.heading} text-xl`}>
                <span className="block text-xs opacity-70">{p.t.groom}</span>
                {p.groom}
              </p>
              <span className="h-20 w-px bg-[var(--inv-accent)]" />
              <p className={`${p.heading} text-xl`}>
                <span className="block text-xs opacity-70">{p.t.bride}</span>
                {p.bride}
              </p>
            </div>
          ) : (
            <Couple p={p} />
          )}
          <Ornament name={p.ornament} />
        </>,
      );

    // Names on ribbon banners.
    case "ribbon": {
      const ribbon = (text: string, label: string) => (
        <div className="flex w-full flex-col items-center">
          <span className="text-xs opacity-70">{label}</span>
          <span
            className={`${p.heading} w-[90%] bg-[var(--inv-accent)] px-8 py-2 text-xl text-[var(--inv-bg)]`}
            style={{
              clipPath: "polygon(0 0, 100% 0, 94% 50%, 100% 100%, 0 100%, 6% 50%)",
            }}
          >
            {text}
          </span>
        </div>
      );
      return wrap(
        <>
          <Ornament name={p.ornament} />
          <Greeting p={p} />
          {p.groom || p.bride ? (
            <>
              {p.groom && ribbon(p.groom, p.t.groom)}
              {p.groom && p.bride && <span className="text-[var(--inv-accent)]">{p.t.and}</span>}
              {p.bride && ribbon(p.bride, p.t.bride)}
            </>
          ) : (
            <Couple p={p} />
          )}
          <Cover coverKey={p.coverKey} className="aspect-[4/3] rounded-2xl" />
        </>,
      );
    }

    // A full-width photo with the names written over it.
    case "poster":
      return wrap(
        <div className="relative -mx-4 w-[calc(100%+2rem)] overflow-hidden">
          {p.coverKey ? <Cover coverKey={p.coverKey} className="aspect-[3/4]" /> : <div className="aspect-[3/4] bg-[var(--inv-accent)]" />}
          <div className="absolute inset-0 flex flex-col items-center justify-end gap-3 bg-gradient-to-t from-black/80 via-black/30 to-transparent p-6 pb-10 text-white">
            <Ornament name={p.ornament} />
            <Greeting p={p} light />
            <Couple p={p} size="text-2xl" />
          </div>
        </div>,
      );

    // A card with a stitched edge, like embroidered cloth.
    case "stitched":
      return wrap(
        <>
          <Cover coverKey={p.coverKey} className="aspect-square rounded-xl" />
          <Ornament name={p.ornament} />
          <Greeting p={p} />
          <Couple p={p} />
        </>,
        "rounded-[2rem] border-[3px] border-dotted border-[var(--inv-accent)] bg-[color-mix(in_srgb,var(--inv-accent)_8%,var(--inv-bg))] px-6 py-10 outline outline-1 outline-offset-[6px] outline-[var(--inv-accent)]",
      );

    // No border at all: photo, then the words, for minimal templates.
    case "plain":
      return wrap(
        <>
          <Cover coverKey={p.coverKey} className="aspect-[4/3]" />
          <Ornament name={p.ornament} />
          <Greeting p={p} />
          <Couple p={p} />
        </>,
      );

    // The original: centred, the ornament above and below.
    default:
      return wrap(
        <>
          <Cover coverKey={p.coverKey} className="aspect-square rounded-2xl" />
          <Ornament name={p.ornament} />
          <Greeting p={p} />
          <Couple p={p} />
          {p.ornament !== "angkor" && p.ornament !== "palm" && <Ornament name={p.ornament} flip />}
        </>,
        "rounded-3xl border-2 border-[var(--inv-accent)] p-6 outline outline-1 outline-offset-4 outline-[var(--inv-accent)]",
      );
  }
}
