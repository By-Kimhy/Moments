"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

/** Registers the service worker (production builds only; it would cache dev files). */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js")
      .then(() => navigator.serviceWorker.ready)
      .then(() => warmOfflineCache())
      .catch(() => {});
  }, []);
  return null;
}

/**
 * Asks the service worker to keep this page and the app files it loaded, so it opens without
 * internet next time. The desk calls this once it is showing (not the join form).
 */
export function warmOfflineCache() {
  if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
  navigator.serviceWorker.ready
    .then((registration) => {
      const urls = [location.href, ...performance.getEntriesByType("resource").map((e) => e.name)];
      registration.active?.postMessage({ type: "warm", urls });
    })
    .catch(() => {});
}

/** Tells the service worker to forget saved pages (after signing out or leaving the desk). */
export function clearSavedPages() {
  navigator.serviceWorker?.controller?.postMessage({ type: "clear-pages" });
}

type InstallEvent = Event & { prompt: () => Promise<void> };

/** "Install the app" on Android/desktop Chrome; on iPhone, a hint to use Share → Add to Home Screen. */
export function InstallButton({ label, iosHint }: { label: string; iosHint: string }) {
  const [prompt, setPrompt] = useState<InstallEvent | null>(null);
  // Read on the client only (false while rendering on the server), so hydration matches.
  const ios = useSyncExternalStore(
    () => () => {},
    () =>
      /iphone|ipad/i.test(navigator.userAgent) &&
      !(window.matchMedia?.("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone),
    () => false,
  );

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (prompt) {
    return (
      <button
        type="button"
        onClick={async () => {
          await prompt.prompt();
          setPrompt(null);
        }}
        className="rounded-lg border border-line px-3 py-1.5 text-sm"
      >
        {label}
      </button>
    );
  }
  return ios ? <p className="text-xs text-muted">{iosHint}</p> : null;
}
