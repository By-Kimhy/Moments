"use client";

import { useActionState } from "react";
import type { HostEvent } from "@api/contract";
import { Field, Message, Select, TextArea, buttonClass } from "@/components/form";
import type { FormState } from "@/lib/api";
import type { Messages } from "@/i18n/km";

type Template = { id: string; name: string };

/** Create and edit form for an event. Dates are entered in Phnom Penh time. */
export function EventForm({
  action,
  t,
  status,
  templates,
  event,
  dateTime,
  submitLabel,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  t: Messages["eventForm"];
  status?: Messages["status"];
  templates: Template[];
  event?: HostEvent;
  dateTime?: { date: string; time: string };
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const v = state?.values;
  const e = state?.errors;
  const value = (key: keyof HostEvent & string) => v?.[key] ?? ((event?.[key] as string | null | undefined) ?? "");
  const schedule =
    v?.schedule ?? event?.schedule.map((s) => [s.time, s.titleKm, s.titleEn].filter(Boolean).join(" | ")).join("\n") ?? "";

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Field label={t.titleKm} name="titleKm" defaultValue={value("titleKm")} errors={e?.titleKm} required />
      <Field label={t.titleEn} name="titleEn" defaultValue={value("titleEn")} errors={e?.titleEn} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t.groomNameKm} name="groomNameKm" defaultValue={value("groomNameKm")} errors={e?.groomNameKm} />
        <Field label={t.groomNameEn} name="groomNameEn" defaultValue={value("groomNameEn")} errors={e?.groomNameEn} />
        <Field label={t.brideNameKm} name="brideNameKm" defaultValue={value("brideNameKm")} errors={e?.brideNameKm} />
        <Field label={t.brideNameEn} name="brideNameEn" defaultValue={value("brideNameEn")} errors={e?.brideNameEn} />
        <Field label={t.date} name="date" type="date" defaultValue={v?.date ?? dateTime?.date} errors={e?.date} required />
        <Field label={t.time} name="time" type="time" defaultValue={v?.time ?? dateTime?.time ?? "07:00"} />
        <Field label={t.venueKm} name="venueKm" defaultValue={value("venueKm")} errors={e?.venueKm} />
        <Field label={t.venueEn} name="venueEn" defaultValue={value("venueEn")} errors={e?.venueEn} />
      </div>
      <Field label={t.mapUrl} name="mapUrl" type="url" inputMode="url" defaultValue={value("mapUrl")} errors={e?.mapUrl} />
      <TextArea label={t.schedule} name="schedule" hint={t.scheduleHint} defaultValue={schedule} errors={e?.schedule} rows={5} />
      <Field label={t.khqrAccountName} name="khqrAccountName" defaultValue={value("khqrAccountName")} errors={e?.khqrAccountName} />
      <Select label={t.template} name="templateId" defaultValue={value("templateId")} errors={e?.templateId}>
        <option value="">—</option>
        {templates.map((tpl) => (
          <option key={tpl.id} value={tpl.id}>
            {tpl.name}
          </option>
        ))}
      </Select>
      {status && event && (
        <Select label={t.status} name="status" defaultValue={v?.status ?? event.status}>
          {(["DRAFT", "PUBLISHED", "ARCHIVED"] as const).map((s) => (
            <option key={s} value={s}>
              {status[s]}
            </option>
          ))}
        </Select>
      )}
      <Message text={state?.message} />
      <button className={buttonClass} disabled={pending}>
        {submitLabel}
      </button>
    </form>
  );
}
