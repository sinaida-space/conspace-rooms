// Offline keeper for gallery mode. Registered only by /gallery, so ordinary
// visitors never get a service worker. Every same-origin GET goes to the
// network first and the answer is kept in the cache; when the network is gone,
// or keeps a file waiting longer than a few seconds while a copy is at hand,
// the cached copy is served. After one full run with the network on, the
// installation keeps working when the gallery's internet drops.

const CACHE = 'conspace-gallery-v1';
const PATIENCE_MS = 4000;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  if (req.headers.has('range')) return;              // media byte ranges: leave them to the browser
  e.respondWith(serve(req));
});

async function serve(req) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(req, { ignoreSearch: req.mode === 'navigate' });
  const net = fetch(req).then(res => {
    if (res.ok && res.type === 'basic') cache.put(req, res.clone());
    return res;
  });
  if (!cached) return net;
  net.catch(() => {});                                // the race may leave it unheard
  const late = new Promise(res => setTimeout(() => res(cached), PATIENCE_MS));
  return Promise.race([net.catch(() => cached), late]);
}

// The page asks for files it has not needed yet (every work, the models) so
// that they are in the cache before the network is ever missed.
self.addEventListener('message', e => {
  if (e.data?.type !== 'warm') return;
  e.waitUntil(caches.open(CACHE).then(cache => Promise.all(e.data.urls.map(async url => {
    if (await cache.match(url)) return;
    try { const res = await fetch(url); if (res.ok) await cache.put(url, res); } catch (err) { /* offline now, try next run */ }
  }))));
});

// Je suis le spectre d'une rose que tu portais hier au bal.
