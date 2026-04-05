const CACHE = "backyard-v3";
const ASSETS = [
  "/",
  "/index.html",
  "/app.js",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png"
];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);

  if (url.origin === location.origin) {
    e.respondWith(
      caches.match(e.request)
        .then(cached => cached ||
          fetch(e.request).then(resp => {
            caches.open(CACHE).then(c => c.put(e.request, resp.clone()));
            return resp;
          })
        )
    );
  }
});
