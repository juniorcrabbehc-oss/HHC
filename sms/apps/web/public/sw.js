// Minimal hand-rolled service worker (Phase 2). See the Phase 2 report for
// why this was used instead of next-pwa.
//
// This SW only carries the app-shell-while-offline story. The actual
// offline *data* story (queueing attendance marks, syncing them later)
// lives entirely in src/lib/offline/ (Dexie outbox + sync-engine.ts) and
// never depends on this file — writes go straight to IndexedDB whether or
// not this service worker is installed.
const CACHE_NAME = "sms-shell-v1";
const APP_SHELL = ["/", "/manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .catch(() => {
        // Best-effort — a failed pre-cache shouldn't block install.
      }),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

// Network-first, falling back to cache (then the app shell) when offline.
// Only GET requests are intercepted — all writes (attendance marks, CA
// scores, ...) go through the Dexie outbox and their bulk sync endpoints,
// never through this service worker's fetch handler.
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        caches
          .open(CACHE_NAME)
          .then((cache) => cache.put(request, copy))
          .catch(() => {});
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match("/"))),
  );
});

// Background Sync (Chrome/Edge/Android): the browser can fire this even if
// no tab is open. We don't run Dexie/IndexedDB logic here directly — it's
// simpler to keep the sync logic in one place (sync-engine.ts, running in
// the page). Instead, tell every open client to sync; sync-engine.ts's
// startSyncEngine() listens for this message. On iOS Safari (no Background
// Sync support) the online-event + 30s interval in sync-engine.ts is the
// fallback and doesn't depend on this handler at all.
self.addEventListener("sync", (event) => {
  if (event.tag === "outbox-sync") {
    event.waitUntil(
      self.clients.matchAll().then((clients) => {
        clients.forEach((client) => client.postMessage({ type: "SMS_SYNC_NOW" }));
      }),
    );
  }
});
