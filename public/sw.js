// Moments service worker: lets the guest desk open without internet at the venue.
// - App files (/_next/static, icons, fonts) and uploaded images: cache first; they never change
//   under the same URL.
// - The desk pages (/desk, /events/<id>/checkin): network first, falling back to the copy kept
//   from the last visit. The desk's data lives in IndexedDB (see src/lib/offline/outbox.ts).
// - Everything else (other pages, the API, Server Actions) goes straight to the network.
const VERSION = "v2";
const STATIC = `static-${VERSION}`;
const PAGES = `pages-${VERSION}`;
const OFFLINE = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(PAGES).then((cache) => cache.add(OFFLINE)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== STATIC && k !== PAGES).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  // Signing out or leaving the desk: forget the saved pages.
  if (event.data?.type === "clear-pages") {
    event.waitUntil(caches.delete(PAGES).then(() => caches.open(PAGES)).then((cache) => cache.add(OFFLINE)));
  }
  // The first visit loads before this worker exists; the page then sends what it loaded so the
  // desk can open offline straight away, without waiting for a second visit.
  if (event.data?.type === "warm" && Array.isArray(event.data.urls)) {
    event.waitUntil(warm(event.data.urls));
  }
});

async function warm(urls) {
  for (const href of urls) {
    const url = new URL(href, self.location.origin);
    if (url.origin !== self.location.origin) continue;
    try {
      if (isStatic(url) && !(await caches.match(url.href))) {
        const response = await fetch(url.href);
        if (response.ok) await (await caches.open(STATIC)).put(url.href, response);
      } else if (isDeskPage(url)) {
        const response = await fetch(url.href, { credentials: "include" });
        if (response.ok && !response.redirected) await (await caches.open(PAGES)).put(url.pathname, response);
      }
    } catch {
      // Offline already: nothing to add now.
    }
  }
}

const isDeskPage = (url) => url.pathname === "/desk" || /^\/events\/[0-9a-f-]{36}\/(checkin|door)$/.test(url.pathname);
const isStatic = (url) => url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || url.pathname.startsWith("/api/files/");

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (isStatic(url)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(STATIC).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
    return;
  }

  if (request.mode === "navigate" && isDeskPage(url)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Keep only real desk pages, not a redirect to the login or join form.
          if (response.ok && !response.redirected) {
            const copy = response.clone();
            caches.open(PAGES).then((cache) => cache.put(url.pathname, copy));
          }
          return response;
        })
        .catch(async () => (await caches.match(url.pathname)) ?? (await caches.match(OFFLINE))),
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(async () => (await caches.match(OFFLINE)) ?? Response.error()));
  }
});
