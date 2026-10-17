"use client";

import { useCallback, useEffect, useState } from "react";
import type { HostWallResponse } from "@api/contract";
import { clientApi } from "@/lib/client-api";

const REFRESH_MS = 15_000;
const SLIDE_MS = 6_000;

/** Full screen for a projector or TV at the venue: the newest photos, one after another. */
export function WallScreen({ eventId, title, byLabel, emptyLabel }: { eventId: string; title: string; byLabel: string; emptyLabel: string }) {
  const [photos, setPhotos] = useState<HostWallResponse["photos"]>([]);
  const [index, setIndex] = useState(0);

  const load = useCallback(async () => {
    const wall = await clientApi<HostWallResponse>(`/events/${eventId}/photo-wall`);
    setPhotos(wall.photos.filter((p) => !p.hidden).slice(0, 60));
  }, [eventId]);

  useEffect(() => {
    // Fetching the photos is this effect's job; it checks for new ones every 15 seconds.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    const timer = setInterval(() => void load().catch(() => {}), REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    const timer = setInterval(() => setIndex((i) => i + 1), SLIDE_MS);
    return () => clearInterval(timer);
  }, []);

  const current = photos.length ? photos[index % photos.length] : null;
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black text-white" data-testid="wall-screen">
      <div className="flex items-center justify-between px-6 py-3">
        <h1 className="text-xl font-semibold">{title}</h1>
        <span className="text-sm opacity-70">{photos.length ? `${(index % photos.length) + 1} / ${photos.length}` : ""}</span>
      </div>
      <div className="relative flex flex-1 items-center justify-center overflow-hidden">
        {current ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- stored photos are already resized WebP */}
            <img key={current.id} src={`/api/files/${current.key}`} alt="" className="max-h-full max-w-full animate-[fadein_0.8s_ease] object-contain" />
            <span className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-4 py-1.5 text-lg">{byLabel.replace("{name}", current.by)}</span>
          </>
        ) : (
          <p className="text-2xl opacity-70">{emptyLabel}</p>
        )}
      </div>
      <div className="flex gap-1 overflow-hidden px-2 pb-2">
        {photos.slice(0, 12).map((p) => (
          // eslint-disable-next-line @next/next/no-img-element -- stored photos are already resized WebP
          <img key={p.id} src={`/api/files/${p.key}`} alt="" className={`h-16 w-16 shrink-0 rounded object-cover ${p.id === current?.id ? "ring-2 ring-white" : "opacity-60"}`} />
        ))}
      </div>
    </div>
  );
}
