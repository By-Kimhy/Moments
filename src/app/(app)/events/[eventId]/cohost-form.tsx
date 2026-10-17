"use client";

import { useActionState } from "react";
import { addCohost } from "@/app/actions/events";
import { Field, Message, buttonClass } from "@/components/form";
import type { Messages } from "@/i18n/km";

export function CohostForm({ eventId, t }: { eventId: string; t: Messages["event"] }) {
  const [state, action, pending] = useActionState(addCohost.bind(null, eventId), undefined);
  return (
    // React clears the fields after each submit; failed ones refill from state.values.
    <form action={action} className="flex flex-col gap-3">
      <Field label={t.cohostName} name="name" defaultValue={state?.values?.name} errors={state?.errors?.name} required />
      <Field label={t.cohostPhone} name="phone" type="tel" inputMode="tel" defaultValue={state?.values?.phone} errors={state?.errors?.phone} required />
      <Message text={state?.message} />
      <button className={buttonClass} disabled={pending}>
        {t.add}
      </button>
    </form>
  );
}
