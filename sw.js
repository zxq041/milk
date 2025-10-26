/* sw.js – prosty cache: „app shell” + offline fallback */
const VERSION = 'v1.0.0';
const APP_SHELL = [
  '/',               // jeśli panel jest pod / – jeśli nie, podmień na właściwy start
  '/offline.html',
  '/manifest.webmanifest',

  // Twoje główne pliki (dopisz nazwy plików, jeśli używasz osobnych HTML):
  '/index.html',
  '/menu.html',

  // Ikony
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/maskable-512.png',

  // CDN-y też się dociągną dynamicznie, ale możesz dodać krytyczne fonty/css, jeśli chcesz
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(`app-shell-${VERSION}`).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter(k => !k.endsWith(VERSION)).map(k => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

/**
 * Strategia:
 * - Dla żądań do /api/ — network-first (żeby dane były świeże, z fallbackiem do cache przy offline)
 * - Dla statycznych (HTML/CSS/JS/obrazki/fonty) — stale-while-revalidate
 * - Offline fallback: offline.html dla dokumentów
 */
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Pomijamy metody inne niż GET
  if (req.method !== 'GET') return;

  // API: network-first
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(req));
    return;
  }

  // Dokumenty HTML: network-first z fallbackiem offline.html
  if (req.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(`pages-${VERSION}`).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((c) => c || caches.match('/offline.html')))
    );
    return;
  }

  // Reszta (assets): stale-while-revalidate
  event.respondWith(staleWhileRevalidate(req));
});

async function networkFirst(req) {
  const cache = await caches.open(`api-${VERSION}`);
  try {
    const fresh = await fetch(req);
    cache.put(req, fresh.clone());
    return fresh;
  } catch (e) {
    const cached = await cache.match(req);
    if (cached) return cached;
    // ostateczny fallback
    return new Response(JSON.stringify({ message: 'Offline' }), { headers: { 'Content-Type': 'application/json' }, status: 503 });
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(`assets-${VERSION}`);
  const cached = await cache.match(req);
  const fetchPromise = fetch(req)
    .then((res) => {
      cache.put(req, res.clone());
      return res;
    })
    .catch(() => cached); // jeśli offline i nie było cache — zwróci undefined
  return cached || fetchPromise;
}
