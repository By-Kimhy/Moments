"use client";

import { useActionState } from "react";
import type { GuestView } from "@api/contract";
import { Field, Message, Select, buttonClass } from "@/components/form";
import type { FormState } from "@/lib/api";
import type { Messages } from "@/i18n/km";

/** Add and edit form for one guest. */
export function GuestForm({
  action,
  t,
  sides,
  guest,
  groups,
  submitLabel,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  t: Messages["guests"];
  sides: Messages["side"];
  guest?: GuestView;
  groups: string[];
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const v = state?.values;
  const e = state?.errors;
  const value = (k: keyof GuestView) => v?.[k] ?? (guest?.[k] === null || guest?.[k] === undefined ? "" : String(guest[k]));
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t.name} name="name" defaultValue={value("name")} errors={e?.name} required />
        <Field label={t.nameAlt} name="nameAlt" defaultValue={value("nameAlt")} errors={e?.nameAlt} />
        <Field label={t.phone} name="phone" type="tel" inputMode="tel" defaultValue={value("phone")} errors={e?.phone} />
        <Select label={t.side} name="side" defaultValue={value("side") || "BOTH"} errors={e?.side}>
          {(["GROOM", "BRIDE", "BOTH"] as const).map((s) => (
            <option key={s} value={s}>
              {sides[s]}
            </option>
          ))}
        </Select>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{t.group}</span>
          <input
            name="group"
            list="guest-groups"
            defaultValue={value("group")}
            placeholder={t.groupHint}
            className="w-full rounded-lg border border-line bg-white px-3 py-2.5 text-base text-zinc-900 outline-none focus:border-accent dark:bg-zinc-900 dark:text-zinc-100"
          />
          <datalist id="guest-groups">
            {groups.map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
        </label>
        <Field label={t.invitedCount} name="invitedCount" inputMode="numeric" defaultValue={value("invitedCount") || "1"} errors={e?.invitedCount} />
        <Field label={t.tableNo} name="tableNo" defaultValue={value("tableNo")} errors={e?.tableNo} />
      </div>
      <Message text={state?.message} />
      <button className={buttonClass} disabled={pending}>
        {submitLabel}
      </button>
    </form>
  );
}
