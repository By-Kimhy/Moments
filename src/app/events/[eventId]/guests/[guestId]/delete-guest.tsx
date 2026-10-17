"use client";

import { useActionState } from "react";
import { deleteGuest } from "@/app/actions/guests";
import { Message } from "@/components/form";

export function DeleteGuest({ eventId, guestId, label }: { eventId: string; guestId: string; label: string }) {
  const [state, action, pending] = useActionState(deleteGuest.bind(null, eventId, guestId), undefined);
  return (
    <form action={action} className="flex flex-col gap-2">
      <Message text={state?.message} />
      <button className="self-start text-sm text-red-700 underline" disabled={pending}>
        {label}
      </button>
    </form>
  );
}
