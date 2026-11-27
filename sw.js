const CACHE = 'market-ai-web-v11';
// Relative to the service worker scope so it works on GitHub project Pages (/repo/).
const ASSETS = ['./', './index.html', './pro.html', './style.css', './pro.css', './app.js',
  './pro.js', './manifest.webmanifest', './icon-192.png', './icon-512.png',
  './apple-touch-icon.png', './data/market.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// AI runs only while the app is open (keys stay in the browser). Background sync removed.
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(list => {
    const found = list.find(c => c.url.includes('pro.html'));
    return found ? found.focus() : self.clients.openWindow('./pro.html');
  }));
});

// Network-first for every same-origin GET: fresh files/data when online, cached copy offline.
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
      if (req.mode === 'navigate') return caches.match(url.pathname.includes('pro.html') ? './pro.html' : './index.html');
      return Response.error();
    }))
  );
});
