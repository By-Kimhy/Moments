"use client";

import { useActionState } from "react";
import { shortlistVendor } from "@/app/actions/vendors";
import { Message, secondaryButtonClass } from "@/components/form";
import type { Messages } from "@/i18n/km";

const input = "rounded-lg border border-line bg-white px-2 py-2 text-sm dark:bg-zinc-900";

/** Status and note of one shortlisted vendor. */
export function ShortlistRow({ eventId, vendorId, status, note, t }: { eventId: string; vendorId: string; status: "CONSIDERING" | "BOOKED"; note: string | null; t: Messages["vendors"] }) {
  const [state, action, pending] = useActionState(shortlistVendor.bind(null, vendorId), undefined);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="eventId" value={eventId} />
      <select name="status" defaultValue={status} aria-label={t.shortlistStatus} className={input}>
        <option value="CONSIDERING">{t.shortlist.CONSIDERING}</option>
        <option value="BOOKED">{t.shortlist.BOOKED}</option>
      </select>
      <input name="note" defaultValue={note ?? ""} placeholder={t.note} className={`${input} min-w-0 flex-1`} />
      <button className={secondaryButtonClass} disabled={pending}>
        {t.save}
      </button>
      <Message text={state?.message} />
    </form>
  );
}
