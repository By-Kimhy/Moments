"use client";

import { useActionState, useState } from "react";
import type { GuestGift } from "@api/contract";
import { formatAmount } from "@api/lib/money";
import { type GuestGiftState, submitGuestGift } from "@/app/actions/invitation";
import type { Messages } from "@/i18n/km";

/** Under the KHQR: "I sent a gift" — amount and a wish — and the status of what was sent. */
export function GuestGiftForm({ token, gifts: initial, language, t }: { token: string; gifts: GuestGift[]; language: "km" | "en"; t: Messages["invite"] }) {
  const [state, action, pending] = useActionState<GuestGiftState, FormData>(submitGuestGift.bind(null, token, language), undefined);
  const [open, setOpen] = useState(false);
  const gifts = state?.gifts ?? initial;
  const field = "rounded-lg border border-[var(--inv-accent)]/50 bg-transparent px-3 py-2.5 text-base";
  const label = { PENDING: t.giftPending, CONFIRMED: t.giftConfirmed, REJECTED: t.giftRejected };

  return (
    <div className="flex w-full flex-col gap-3">
      {gifts.length > 0 && (
        <div className="text-left text-sm">
          <p className="font-semibold">{t.yourGifts}</p>
          <ul>
            {gifts.map((g) => (
              <li key={g.id}>
                {formatAmount(g.amount, g.currency, language === "km")} — {label[g.status]}
              </li>
            ))}
          </ul>
        </div>
      )}
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="rounded-xl border-2 border-[var(--inv-accent)] px-4 py-2.5 font-semibold">
          {t.sentGift}
        </button>
      ) : (
        <form
          action={async (formData) => {
            action(formData);
            setOpen(false);
          }}
          className="flex flex-col gap-3 text-left"
        >
          <p className="text-sm opacity-80">{t.sentGiftHint}</p>
          <div className="flex gap-2">
            <input name="amount" required inputMode="decimal" placeholder={t.amount} aria-label={t.amount} className={`${field} min-w-0 flex-1`} />
            <select name="currency" defaultValue="USD" className={field}>
              <option value="USD" className="text-black">
                $ USD
              </option>
              <option value="KHR" className="text-black">
                ៛ KHR
              </option>
            </select>
          </div>
          <textarea name="note" rows={2} maxLength={500} placeholder={t.message} className={field} />
          <button disabled={pending} className="rounded-xl bg-[var(--inv-accent)] px-4 py-3 font-semibold text-[var(--inv-bg)] disabled:opacity-50">
            {t.sendGift}
          </button>
        </form>
      )}
      {state?.error && <p className="rounded-lg bg-red-100 px-3 py-2 text-sm text-red-800">{state.error}</p>}
    </div>
  );
}
