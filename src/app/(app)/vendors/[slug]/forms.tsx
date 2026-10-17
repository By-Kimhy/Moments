"use client";

import { useActionState } from "react";
import { reportVendor, saveReview, sendEnquiry, shortlistVendor } from "@/app/actions/vendors";
import { Field, Message, Select, TextArea, buttonClass } from "@/components/form";
import type { Messages } from "@/i18n/km";

type T = Messages["vendors"];
type EventOption = { id: string; title: string };

const Done = ({ text }: { text: string }) => <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{text}</p>;

export function EnquiryForm({ slug, name, phone, events, t }: { slug: string; name: string; phone: string; events: EventOption[]; t: T }) {
  const [state, action, pending] = useActionState(sendEnquiry.bind(null, slug), undefined);
  if (state?.done) return <Done text={t.sent} />;
  const v = state?.values;
  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label={t.yourName} name="name" defaultValue={v?.name ?? name} errors={state?.errors?.name} required />
        <Field label={t.yourPhone} name="phone" type="tel" inputMode="tel" defaultValue={v?.phone ?? phone} errors={state?.errors?.phone} required />
        <Field label={t.eventDate} name="eventDate" type="date" defaultValue={v?.eventDate} errors={state?.errors?.eventDate} />
        {events.length > 0 && (
          <Select label={t.forEvent} name="eventId" defaultValue={v?.eventId ?? events[0].id}>
            <option value="">{t.noEvent}</option>
            {events.map((e) => (
              <option key={e.id} value={e.id}>
                {e.title}
              </option>
            ))}
          </Select>
        )}
      </div>
      <TextArea label={t.message} name="message" defaultValue={v?.message} errors={state?.errors?.message} />
      <Message text={state?.message} />
      <button className={`${buttonClass} self-start`} disabled={pending}>
        {t.send}
      </button>
    </form>
  );
}

export function ReviewForm({ slug, initial, t }: { slug: string; initial: { rating: number; text: string | null } | null; t: T }) {
  const [state, action, pending] = useActionState(saveReview.bind(null, slug), undefined);
  const rating = state?.values?.rating ?? String(initial?.rating ?? 5);
  return (
    <form action={action} className="mt-3 flex flex-col gap-3">
      <fieldset className="flex flex-col gap-1 text-sm">
        <legend className="font-medium">{t.rating}</legend>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <label key={n} className="flex cursor-pointer items-center gap-1 rounded-lg border border-line px-3 py-2 has-[:checked]:border-accent has-[:checked]:bg-accent/10">
              <input type="radio" name="rating" value={n} defaultChecked={rating === String(n)} className="sr-only" />
              {n}★
            </label>
          ))}
        </div>
      </fieldset>
      <TextArea label={t.reviewText} name="text" defaultValue={state?.values?.text ?? initial?.text ?? ""} errors={state?.errors?.text} rows={3} />
      <Message text={state?.message} />
      {state?.done && <Done text={t.saved} />}
      <button className={`${buttonClass} self-start`} disabled={pending}>
        {t.saveReview}
      </button>
    </form>
  );
}

export function ShortlistForm({ vendorId, events, t }: { vendorId: string; events: EventOption[]; t: T }) {
  const [state, action, pending] = useActionState(shortlistVendor.bind(null, vendorId), undefined);
  return (
    <form action={action} className="mt-3 flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <Select label={t.forEvent} name="eventId" defaultValue={events[0].id}>
          {events.map((e) => (
            <option key={e.id} value={e.id}>
              {e.title}
            </option>
          ))}
        </Select>
        <Select label={t.shortlistStatus} name="status" defaultValue="CONSIDERING">
          <option value="CONSIDERING">{t.shortlist.CONSIDERING}</option>
          <option value="BOOKED">{t.shortlist.BOOKED}</option>
        </Select>
      </div>
      <Field label={t.note} name="note" />
      <Message text={state?.message} />
      {state?.done && <Done text={t.saved} />}
      <button className={`${buttonClass} self-start`} disabled={pending}>
        {t.save}
      </button>
    </form>
  );
}

/** "Report" under the vendor or one review: a reason and an optional note for the admins. */
export function ReportForm({ slug, reviewId, label, t }: { slug: string; reviewId?: string; label: string; t: T }) {
  const [state, action, pending] = useActionState(reportVendor.bind(null, slug, reviewId ?? null), undefined);
  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-muted">{label}</summary>
      {state?.done ? (
        <Done text={t.reported} />
      ) : (
        <form action={action} className="mt-2 flex flex-col gap-2">
          <Select label={t.reportReason} name="reason" defaultValue="FAKE" errors={state?.errors?.reason}>
            {(["FAKE", "INAPPROPRIATE", "SPAM", "OTHER"] as const).map((r) => (
              <option key={r} value={r}>
                {t.reportReasons[r]}
              </option>
            ))}
          </Select>
          <Field label={t.reportNote} name="note" />
          <Message text={state?.message} />
          <button className="self-start rounded-lg border border-line px-3 py-2 text-sm" disabled={pending}>
            {t.reportSend}
          </button>
        </form>
      )}
    </details>
  );
}
