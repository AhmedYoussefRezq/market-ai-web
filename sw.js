const CACHE = 'market-ai-web-v8';
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

// Periodic background check (Android Chrome PWA; silently ignored where unsupported).
self.addEventListener('periodicsync', event => {
  if (event.tag !== 'market-ai-check') return;
  event.waitUntil((async () => {
    try {
      const r = await fetch('./data/history/XAUUSD.json', { cache: 'no-store' });
      const d = await r.json();
      const cl = (d.D1 || []).map(x => Number(x[4])).filter(x => isFinite(x));
      if (cl.length < 60) return;
      // Same rules as app.js stratSignal(): Wilder RSI14 crossing 50 + EMA20/50.
      const ema = p => { const k = 2/(p+1); let e = cl[0]; for (let i=1;i<cl.length;i++) e = cl[i]*k + e*(1-k); return e; };
      const p = 14; let g = 0, l = 0;
      for (let i=1;i<=p;i++) { const diff = cl[i]-cl[i-1]; g += Math.max(diff,0); l += Math.max(-diff,0); }
      g /= p; l /= p;
      let rsi = l === 0 ? 100 : 100 - 100/(1+g/l), prev;
      for (let i=p+1;i<cl.length;i++) {
        const diff = cl[i]-cl[i-1];
        g = (g*(p-1)+Math.max(diff,0))/p; l = (l*(p-1)+Math.max(-diff,0))/p;
        prev = rsi; rsi = l === 0 ? 100 : 100 - 100/(1+g/l);
      }
      const up = prev <= 50 && rsi > 50, dn = prev >= 50 && rsi < 50;
      const e20 = ema(20), e50 = ema(50);
      const bias = up && e20 > e50 ? 'BUY' : dn && e20 < e50 ? 'SELL' : 'WAIT';
      if (bias === 'WAIT') return;
      const cache = await caches.open('market-ai-signals-v1');
      const old = await cache.match('signal').then(x => x && x.text()).catch(() => null);
      if (old === bias) return;
      await cache.put('signal', new Response(bias));
      await self.registration.showNotification('Market AI Pro — صفقة محتملة', {
        body: 'XAUUSD / D1 · ' + bias,
        icon: 'icon-192.png', tag: 'market-ai-signal', data: { url: './pro.html' }
      });
    } catch (e) {}
  })());
});
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
