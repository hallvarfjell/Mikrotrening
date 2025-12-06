
const CACHE_NAME = 'desk-microflows-v1';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './js/app.js',
  './js/timer.js',
  './js/state.js',
  './js/storage.js',
  './js/tcx.js',
  './data/workouts/nakke_5min.json',
  './data/workouts/skuldre_4min.json',
  './data/workouts/handledd_3min.json',
  './data/workouts/core_4min.json',
  './assets/icon-192.png',
  './assets/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => (k !== CACHE_NAME) ? caches.delete(k) : null))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  event.respondWith(
    caches.match(req).then(res => res || fetch(req))
  );
});
