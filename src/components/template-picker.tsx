"use client";

import type { CSSProperties } from "react";
import { Errors } from "@/components/form";
import { FONT_CLASS } from "@/components/invitation/fonts";
import type { HeroLayout } from "@/components/invitation/hero";
import { Ornament, type OrnamentName } from "@/components/invitation/ornaments";

export type TemplateOption = {
  id: string;
  slug: string;
  name: string;
  config: {
    background: string;
    accent: string;
    text: string;
    headingFont: string;
    ornament?: OrnamentName;
    layout?: HeroLayout;
    pattern?: "silk";
  };
};

/** Invitation templates as small cards in their own colours, with their ornament. */
export function TemplatePicker({
  label,
  templates,
  defaultValue,
  errors,
  paidLabel,
}: {
  label: string;
  templates: TemplateOption[];
  defaultValue?: string;
  errors?: string[];
  /** Set when only the traditional template is included: the others are shown locked. */
  paidLabel?: string;
}) {
  const fallback = defaultValue || templates.find((t) => t.slug === "traditional")?.id;
  return (
    <fieldset className="flex flex-col gap-2 text-sm">
      <legend className="mb-1 font-medium">{label}</legend>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" data-testid="template-picker">
        {templates.map((tpl) => {
          const locked = Boolean(paidLabel) && tpl.slug !== "traditional";
          const theme = {
            "--inv-bg": tpl.config.background,
            "--inv-accent": tpl.config.accent,
            background: tpl.config.background,
            color: tpl.config.text,
          } as CSSProperties;
          return (
            <label key={tpl.id} className={`block ${locked ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}>
              <input type="radio" name="templateId" value={tpl.id} defaultChecked={tpl.id === fallback} disabled={locked} className="peer sr-only" />
              <span
                style={theme}
                className="relative flex h-28 items-center justify-center overflow-hidden rounded-xl border-2 border-transparent ring-1 ring-line peer-checked:border-accent peer-focus-visible:border-accent"
              >
                <LayoutSketch
                  layout={tpl.config.layout}
                  ornament={tpl.config.ornament}
                  font={FONT_CLASS[tpl.config.headingFont] ?? "font-moul"}
                  accent={tpl.config.accent}
                />
              </span>
              <span className="mt-1 block truncate text-xs">
                {tpl.name}
                {locked && ` ${paidLabel}`}
              </span>
            </label>
          );
        })}
      </div>
      <Errors errors={errors} />
    </fieldset>
  );
}

/** A tiny drawing of the template's layout, with its ornament and heading font. */
function LayoutSketch({ layout, ornament, font, accent }: { layout?: HeroLayout; ornament?: OrnamentName; font: string; accent: string }) {
  const names = (
    <span className={`${font} text-sm leading-tight`} style={{ color: accent }}>
      ក ♥ ខ
    </span>
  );
  const deco = ornament ? (
    <span className="pointer-events-none block w-24 scale-75">
      <Ornament name={ornament} />
    </span>
  ) : null;
  const photo = (shape: string) => <span className={`block opacity-40 ${shape}`} style={{ background: accent }} />;
  switch (layout) {
    case "arch":
      return (
        <span className="flex flex-col items-center gap-1">
          {photo("h-10 w-8 rounded-t-full")}
          {names}
        </span>
      );
    case "monogram":
      return (
        <span className="flex flex-col items-center">
          <span className="flex size-12 items-center justify-center rounded-full border-2" style={{ borderColor: accent }}>
            {names}
          </span>
          {deco}
        </span>
      );
    case "split":
      return (
        <span className="flex w-full flex-col items-center gap-1">
          {photo("h-6 w-20 rounded")}
          <span className="flex items-center gap-2">
            <span className={`${font} text-xs`} style={{ color: accent }}>
              ក
            </span>
            <span className="h-5 w-px" style={{ background: accent }} />
            <span className={`${font} text-xs`} style={{ color: accent }}>
              ខ
            </span>
          </span>
          {deco}
        </span>
      );
    case "ribbon":
      return (
        <span className="flex flex-col items-center gap-1">
          {deco}
          {[0, 1].map((i) => (
            <span
              key={i}
              className="block h-3 w-20"
              style={{
                background: accent,
                clipPath: "polygon(0 0,100% 0,94% 50%,100% 100%,0 100%,6% 50%)",
              }}
            />
          ))}
        </span>
      );
    case "poster":
      return (
        <span className="absolute inset-0 flex flex-col items-center justify-end bg-gradient-to-t from-black/70 to-transparent pb-2">
          {deco}
          <span className={`${font} text-sm text-white`}>ក ♥ ខ</span>
        </span>
      );
    case "frame":
      return (
        <span className="absolute inset-2 flex flex-col items-center justify-center border" style={{ borderColor: accent }}>
          {["left-0 top-0", "right-0 top-0", "left-0 bottom-0", "right-0 bottom-0"].map((c) => (
            <span key={c} className={`absolute size-2 ${c}`} style={{ background: accent }} />
          ))}
          {deco}
          {names}
        </span>
      );
    case "stitched":
      return (
        <span className="absolute inset-2 flex flex-col items-center justify-center rounded-2xl border-2 border-dotted" style={{ borderColor: accent }}>
          {deco}
          {names}
        </span>
      );
    case "plain":
      return (
        <span className="flex flex-col items-center gap-1">
          {photo("h-8 w-20")}
          {deco}
          {names}
        </span>
      );
    default:
      return (
        <span className="absolute inset-2 flex flex-col items-center justify-center rounded-xl border" style={{ borderColor: accent }}>
          {deco}
          {names}
        </span>
      );
  }
}
