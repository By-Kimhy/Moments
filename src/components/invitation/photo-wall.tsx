"use client";

import { useCallback, useEffect, useState } from "react";
import type { GuestWallResponse } from "@api/contract";
import type { Messages } from "@/i18n/km";

const REFRESH_MS = 30_000;

/** On the invitation during the day: send photos, and see everyone's. */
export function PhotoWall({ token, t }: { token: string; t: Messages["invite"] }) {
  const [photos, setPhotos] = useState<GuestWallResponse["photos"]>([]);
  const [status, setStatus] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/invitations/${token}/photos`, { cache: "no-store" });
    if (res.ok) setPhotos(((await res.json()) as GuestWallResponse).photos);
  }, [token]);

  useEffect(() => {
    // Loading the wall is this effect's job; new photos come in every 30 seconds.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  async function send(files: FileList | null) {
    if (!files?.length) return;
    const body = new FormData();
    for (const file of Array.from(files).slice(0, 10)) body.append("photos", file, file.name);
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch(`/api/invitations/${token}/photos`, {
        method: "POST",
        body,
        headers: { "Accept-Language": document.documentElement.lang === "en" ? "en" : "km" },
      });
      const data = await res.json().catch(() => ({}));
      setStatus(res.ok ? { text: t.wallSent, ok: true } : { text: data.error ?? res.statusText, ok: false });
      if (res.ok) await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3" data-testid="photo-wall">
      <p className="text-center text-sm opacity-80">{t.wallHint}</p>
      <label className="cursor-pointer self-center rounded-full bg-[var(--inv-accent)] px-5 py-2.5 font-medium text-[var(--inv-bg)]">
        {busy ? t.wallSending : t.wallSend}
        <input type="file" accept="image/*" multiple className="sr-only" disabled={busy} onChange={(e) => (void send(e.target.files), (e.target.value = ""))} />
      </label>
      {status && <p className={`text-center text-sm ${status.ok ? "" : "text-red-300"}`}>{status.text}</p>}
      {photos.length === 0 ? (
        <p className="text-center text-sm opacity-70">{t.wallEmpty}</p>
      ) : (
        <div className="grid grid-cols-3 gap-1">
          {photos.map((p) => (
            // eslint-disable-next-line @next/next/no-img-element -- stored photos are already resized WebP
            <img key={p.id} src={`/api/files/${p.key}`} alt={t.wallBy.replace("{name}", p.by)} title={t.wallBy.replace("{name}", p.by)} loading="lazy" className="aspect-square w-full rounded-md object-cover" />
          ))}
        </div>
      )}
    </div>
  );
}
