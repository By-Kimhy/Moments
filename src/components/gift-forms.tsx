"use client";

import { useActionState } from "react";
import { Field, Message, Select, buttonClass } from "@/components/form";
import type { Messages } from "@/i18n/km";
import type { FormState } from "@/lib/api";

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

/** Amount, currency, method and note; with a guest picker when recording a new gift. */
export function GiftForm({
  action,
  t,
  desk,
  guests,
  initial,
  submitLabel,
}: {
  action: Action;
  t: Messages["giftBook"];
  desk: Messages["desk"];
  guests?: { id: string; name: string }[];
  initial?: { amount: string; currency: string; method: string; note: string };
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const v = state?.values ?? initial;
  return (
    <form action={formAction} className="flex flex-col gap-3">
      {guests && (
        <>
          <Select label={t.guest} name="guestId" defaultValue={v && "guestId" in v ? String(v.guestId) : ""}>
            <option value="">—</option>
            {guests.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </Select>
          <Field label={t.giverName} name="giverName" defaultValue={state?.values?.giverName} errors={state?.errors?.giverName} />
        </>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label={t.amount} name="amount" inputMode="text" defaultValue={v?.amount} errors={state?.errors?.amount} required />
        <Select label={t.currency} name="currency" defaultValue={v?.currency ?? "USD"}>
          <option value="USD">{desk.usd}</option>
          <option value="KHR">{desk.khr}</option>
        </Select>
      </div>
      <Select label={t.method} name="method" defaultValue={v?.method ?? "CASH"}>
        <option value="CASH">{desk.cash}</option>
        <option value="KHQR">{desk.khqr}</option>
      </Select>
      <Field label={t.note} name="note" defaultValue={v?.note} />
      <Message text={state?.message} />
      <button className={buttonClass} disabled={pending}>
        {submitLabel}
      </button>
    </form>
  );
}

export function VoidForm({ action, t }: { action: Action; t: Messages["giftBook"] }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <Field label={t.reason} name="reason" errors={state?.errors?.reason} required />
      <Message text={state?.message} />
      <button className="self-start rounded-lg border border-red-300 px-4 py-2 text-red-700 disabled:opacity-50" disabled={pending}>
        {t.void}
      </button>
    </form>
  );
}
