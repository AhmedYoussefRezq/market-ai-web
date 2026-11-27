const CACHE = 'market-ai-web-v2';
const ASSETS = ['/', '/index.html', '/style.css', '/app.js', '/manifest.webmanifest',
  '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png', '/data/market.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Network-first for every same-origin GET: fresh files/data when online, cached copy offline.
// This prevents an old app.js from being served forever after an update.
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(req).then(r => {
      if (r && r.status === 200) {
        const copy = r.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
      }
      return r;
    }).catch(() => caches.match(req).then(hit => {
      if (hit) return hit;
      if (req.mode === 'navigate') return caches.match('/index.html');
      return Response.error();
    }))
  );
});
