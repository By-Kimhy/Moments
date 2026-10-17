"use client";

import { useEffect, useState } from "react";
import type { GuestWishesResponse } from "@api/contract";
import type { Messages } from "@/i18n/km";

/** On the invitation: write a wish for the couple, and see the ones already sent. */
export function WishForm({ token, t }: { token: string; t: Messages["invite"] }) {
  const [wishes, setWishes] = useState<GuestWishesResponse["wishes"]>([]);
  const [text, setText] = useState("");
  const [status, setStatus] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    void fetch(`/api/invitations/${token}/wishes`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { wishes: [] }))
      .then((d: GuestWishesResponse) => live && setWishes(d.wishes));
    return () => {
      live = false;
    };
  }, [token]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch(`/api/invitations/${token}/wishes`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept-Language": document.documentElement.lang === "en" ? "en" : "km" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setWishes((w) => [...w, data.wish]);
        setText("");
        setStatus({ text: t.wishSent, ok: true });
      } else {
        setStatus({ text: data.fieldErrors?.text?.[0] ?? data.error ?? res.statusText, ok: false });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={send} className="flex flex-col gap-3" data-testid="wish-form">
      <p className="text-center text-sm opacity-80">{t.wishHint}</p>
      {wishes.length > 0 && (
        <div className="text-sm">
          <p className="font-semibold">{t.yourWishes}</p>
          <ul className="flex flex-col gap-1">
            {wishes.map((w) => (
              <li key={w.id} className="whitespace-pre-line">
                “{w.text}”
              </li>
            ))}
          </ul>
        </div>
      )}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        maxLength={1000}
        required
        className="rounded-lg border border-[var(--inv-accent)]/50 bg-transparent px-3 py-2.5 text-base"
      />
      {status && <p className={`text-center text-sm ${status.ok ? "" : "text-red-300"}`}>{status.text}</p>}
      <button disabled={busy || !text.trim()} className="self-center rounded-full bg-[var(--inv-accent)] px-5 py-2.5 font-medium text-[var(--inv-bg)] disabled:opacity-50">
        {t.wishSend}
      </button>
    </form>
  );
}
