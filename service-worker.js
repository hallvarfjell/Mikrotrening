const CACHE='intervall-cache-v29';
const ASSETS=[
  './','./index.html','./builder.html','./results.html','./log.html','./settings.html','./help.html',
  './style.css','./main.js','./builder.js','./results.js','./manifest.json',
  './supabase-init.js','./cloud-sync.js','./cloud-sessions.js','./tcx.js'
];
self.addEventListener('install',e=>{ self.skipWaiting(); e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS))); });
self.addEventListener('activate',e=>{ e.waitUntil((async()=>{ const keys=await caches.keys(); await Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))); await self.clients.claim(); })()); });
self.addEventListener('fetch',e=>{ e.respondWith(caches.match(e.request).then(r=>r || fetch(e.request))); });
