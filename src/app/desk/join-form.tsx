"use client";

import { useActionState } from "react";
import { joinDesk } from "@/app/actions/desk";
import { Field, Message, buttonClass } from "@/components/form";
import type { Messages } from "@/i18n/km";

export function JoinForm({ t }: { t: Messages["desk"] }) {
  const [state, action, pending] = useActionState(joinDesk, undefined);
  return (
    <form action={action} className="flex flex-col gap-4">
      <Field label={t.code} name="code" inputMode="numeric" autoComplete="off" defaultValue={state?.values?.code} errors={state?.errors?.code} required autoFocus />
      <Field label={t.name} name="name" autoComplete="name" defaultValue={state?.values?.name} errors={state?.errors?.name} required />
      <Message text={state?.message} />
      <button className={buttonClass} disabled={pending}>
        {t.join}
      </button>
    </form>
  );
}
