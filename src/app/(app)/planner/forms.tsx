"use client";

import { useActionState } from "react";
import { addStaff, createClientEvent, createOrganization, updateOrganization } from "@/app/actions/planner";
import { Field, Message, Select, buttonClass } from "@/components/form";
import type { Messages } from "@/i18n/km";

type T = Messages["planner"];

export function CreateOrganization({ t }: { t: T }) {
  const [state, action, pending] = useActionState(createOrganization, undefined);
  return (
    <form action={action} className="flex flex-col gap-3">
      <Field label={t.name} name="name" defaultValue={state?.values?.name} errors={state?.errors?.name} required />
      <Message text={state?.message} />
      <button className={`${buttonClass} self-start`} disabled={pending}>
        {t.create}
      </button>
    </form>
  );
}

export function ClientEventForm({ orgId, t, dateLabel, timeLabel, titleLabel }: { orgId: string; t: T; dateLabel: string; timeLabel: string; titleLabel: string }) {
  const [state, action, pending] = useActionState(createClientEvent.bind(null, orgId), undefined);
  const v = state?.values;
  return (
    <form action={action} className="flex flex-col gap-3">
      <Field label={titleLabel} name="titleKm" defaultValue={v?.titleKm} errors={state?.errors?.titleKm} required />
      <div className="grid grid-cols-2 gap-3">
        <Field label={dateLabel} name="date" type="date" defaultValue={v?.date} errors={state?.errors?.date} required />
        <Field label={timeLabel} name="time" type="time" defaultValue={v?.time ?? "07:00"} />
        <Field label={t.clientName} name="clientName" defaultValue={v?.clientName} />
        <Field label={t.clientPhone} name="clientPhone" type="tel" inputMode="tel" defaultValue={v?.clientPhone} errors={state?.errors?.clientPhone} />
      </div>
      <p className="text-xs text-muted">{t.clientHint}</p>
      <Message text={state?.message} />
      <button className={`${buttonClass} self-start`} disabled={pending}>
        {t.newEvent}
      </button>
    </form>
  );
}

export function OrganizationSettings({ orgId, t, name, brandColor }: { orgId: string; t: T; name: string; brandColor: string }) {
  const [state, action, pending] = useActionState(updateOrganization.bind(null, orgId), undefined);
  return (
    <form action={action} className="flex flex-col gap-3">
      <Field label={t.name} name="name" defaultValue={state?.values?.name ?? name} errors={state?.errors?.name} required />
      <label className="flex items-center gap-3 text-sm">
        <span className="font-medium">{t.color}</span>
        <input type="color" name="brandColor" defaultValue={state?.values?.brandColor ?? brandColor} className="h-10 w-16 rounded border border-line" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{t.logo}</span>
        <input type="file" name="logo" accept="image/jpeg,image/png,image/webp" className="text-sm" />
      </label>
      <Message text={state?.message} />
      <button className={`${buttonClass} self-start`} disabled={pending}>
        {t.save}
      </button>
    </form>
  );
}

export function AddStaffForm({ orgId, t }: { orgId: string; t: T }) {
  const [state, action, pending] = useActionState(addStaff.bind(null, orgId), undefined);
  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label={t.staffName} name="name" defaultValue={state?.values?.name} errors={state?.errors?.name} required />
        <Field label={t.staffPhone} name="phone" type="tel" inputMode="tel" defaultValue={state?.values?.phone} errors={state?.errors?.phone} required />
      </div>
      <Select label={t.role} name="role" defaultValue={state?.values?.role ?? "STAFF"}>
        <option value="STAFF">{t.roles.STAFF}</option>
        <option value="OWNER">{t.roles.OWNER}</option>
      </Select>
      <Message text={state?.message} />
      <button className={`${buttonClass} self-start`} disabled={pending}>
        {t.addStaff}
      </button>
    </form>
  );
}
