"use client";

import type { CSSProperties } from "react";
import { Errors } from "@/components/form";
import { Ornament, type OrnamentName } from "@/components/invitation/ornaments";

export type TemplateOption = {
  id: string;
  slug: string;
  name: string;
  config: { background: string; accent: string; text: string; ornament?: OrnamentName };
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
          const theme = { "--inv-bg": tpl.config.background, "--inv-accent": tpl.config.accent, background: tpl.config.background, color: tpl.config.text } as CSSProperties;
          return (
            <label key={tpl.id} className={`block ${locked ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}>
              <input type="radio" name="templateId" value={tpl.id} defaultChecked={tpl.id === fallback} disabled={locked} className="peer sr-only" />
              <span
                style={theme}
                className="flex h-24 flex-col items-center justify-center gap-1 overflow-hidden rounded-xl border-2 border-transparent px-2 text-center ring-1 ring-line peer-checked:border-accent peer-focus-visible:border-accent"
              >
                <span className="pointer-events-none w-full scale-75">
                  <Ornament name={tpl.config.ornament} />
                </span>
                <span className="font-moul text-xs" style={{ color: tpl.config.accent }}>
                  ក ♥ ខ
                </span>
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
