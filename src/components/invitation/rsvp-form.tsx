"use client";

import { useActionState, useState } from "react";
import type { InvitationGuest } from "@api/contract";
import { type RsvpState, submitRsvp } from "@/app/actions/invitation";
import type { Messages } from "@/i18n/km";
import { fill } from "@/i18n/format";
import { localDigits } from "@/lib/dates";

type Props = {
  token: string | null; // null in the host's preview: the form shows but can't be sent
  guest: InvitationGuest;
  open: boolean;
  language: "km" | "en";
  t: Messages["invite"];
};

export function RsvpForm({ token, guest: initial, open, language, t }: Props) {
  const digits = (s: string) => localDigits(s, language);
  const action = submitRsvp.bind(null, token ?? "", language);
  const [state, formAction, pending] = useActionState<RsvpState, FormData>(action, undefined);
  const guest = state?.ok ? state.guest : initial;
  const replied = guest.rsvpStatus !== "PENDING";
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState<"ATTENDING" | "DECLINED" | null>(replied ? (guest.rsvpStatus as "ATTENDING" | "DECLINED") : null);
  // The form shows until a reply is saved, again after "change reply", and with any error.
  const showForm = open && (editing || !replied || (state !== undefined && !state.ok));

  if (!showForm) {
    return (
      <div className="flex flex-col items-center gap-2 text-center">
        {replied ? (
          <>
            <p className="text-lg">{guest.rsvpStatus === "ATTENDING" ? t.thanksYes : t.thanksNo}</p>
            <p className="text-sm opacity-80">
              {t.yourReply}: {guest.rsvpStatus === "ATTENDING" ? `${t.attending} · ${fill(t.people, { count: digits(String(guest.rsvpCount ?? 1)) })}` : t.declined}
            </p>
          </>
        ) : null}
        {open ? (
          <button type="button" className="text-sm underline" onClick={() => setEditing(true)}>
            {t.change}
          </button>
        ) : (
          <p className="text-sm opacity-80">{t.closed}</p>
        )}
      </div>
    );
  }

  const choice = (value: "ATTENDING" | "DECLINED", label: string) => (
    <button
      type="button"
      onClick={() => setStatus(value)}
      aria-pressed={status === value}
      className={`flex-1 rounded-xl border-2 px-3 py-3 font-semibold transition ${
        status === value ? "border-[var(--inv-accent)] bg-[var(--inv-accent)] text-[var(--inv-bg)]" : "border-[var(--inv-accent)]/50"
      }`}
    >
      {label}
    </button>
  );

  return (
    <form
      action={(formData) => {
        formAction(formData);
        setEditing(false);
      }}
      className="flex flex-col gap-4"
    >
      <div className="flex gap-3">
        {choice("ATTENDING", t.attending)}
        {choice("DECLINED", t.declined)}
      </div>
      <input type="hidden" name="status" value={status ?? ""} />
      {status === "ATTENDING" && guest.invitedCount > 1 && (
        <label className="flex flex-col gap-1 text-sm">
          <span>{t.howMany}</span>
          <select
            name="count"
            defaultValue={String(guest.rsvpCount || guest.invitedCount)}
            className="rounded-lg border border-[var(--inv-accent)]/50 bg-transparent px-3 py-2.5 text-base"
          >
            {Array.from({ length: guest.invitedCount }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n} className="text-black">
                {fill(t.people, { count: digits(String(n)) })}
              </option>
            ))}
          </select>
        </label>
      )}
      {status && (
        <label className="flex flex-col gap-1 text-sm">
          <span>{t.message}</span>
          <textarea
            name="message"
            rows={3}
            maxLength={500}
            defaultValue={guest.rsvpMessage ?? ""}
            className="rounded-lg border border-[var(--inv-accent)]/50 bg-transparent px-3 py-2 text-base"
          />
        </label>
      )}
      {state && !state.ok && (
        <p className="rounded-lg bg-red-100 px-3 py-2 text-sm text-red-800">
          {state.message ?? Object.values(state.errors ?? {}).flat().join(" ")}
        </p>
      )}
      <button
        disabled={!status || pending || !token}
        className="rounded-xl bg-[var(--inv-accent)] px-4 py-3 font-semibold text-[var(--inv-bg)] disabled:opacity-50"
      >
        {t.send}
      </button>
    </form>
  );
}
