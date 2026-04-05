// -------------------------------
// BACKYARD TIMER SERVICE WORKER
// Fjernes all CDN-caching for å hindre addAll-feil
// -------------------------------

const CACHE_NAME = "backyard-cache-v3";

// Lokale filer som garantert finnes på samme origin
const ASSETS = [
  "/",
  "/index.html",
  "/app.js",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png"
];

// INSTALL — cache alt lokalt
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .catch(err => console.error("[SW] Cache addAll error:", err))
  );
  self.skipWaiting();
});

// ACTIVATE — slett gammel cache
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// FETCH — cache-first for lokale filer
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);

  // Kun cache lokale filer. Aldri cache CDN/content fra andre domener.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request)
        .then(cached => {
          if (cached) {
            // stale-while-revalidate
            event.waitUntil(
              fetch(event.request).then(response => {
                caches.open(CACHE_NAME).then(cache => {
                  cache.put(event.request, response.clone());
                });
              })
            );
            return cached;
          }
          return fetch(event.request);
        })
    );
  }
});
