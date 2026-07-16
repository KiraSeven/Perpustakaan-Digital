// sw.js — Digital Library offline cache engine
// Registered from index.html via navigator.serviceWorker.register('./sw.js')
// Must be served over http/https (or localhost) — service workers do not
// run at all from file:// origins, that's a browser-level restriction.

const CACHE_NAME = 'digilib-cache-v2';

// Precache the app shell + the CDN libraries the app needs to boot.
// Firebase SDK files are intentionally NOT precached here — they change
// often and the app already fails gracefully (Toast errors) if a live
// Firebase read/write can't reach the network while offline.
const PRECACHE_URLS = [
  './',
  './index.html',
  'https://cdn.tailwindcss.com',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Sora:wght@600;700;800&display=swap',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(
        PRECACHE_URLS.map((url) =>
          cache.add(url).catch((err) => console.warn('[sw] precache skip:', url, err.message))
        )
      )
    )
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // Never cache Firebase traffic — that data must always be live/fresh.
  if (req.url.includes('firebaseio.com') || req.url.includes('firebasedatabase.app') || req.url.includes('googleapis.com/identitytoolkit')) {
    return;
  }

  // Page navigations: try network first, fall back to cached shell when offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Everything else (CDN scripts, fonts, icons8 images): cache-first,
  // then update the cache in the background from the network.
  event.respondWith(
    caches.match(req).then((cached) => {
      const networkFetch = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return res;
        })
        .catch(() => cached);
      return cached || networkFetch;
    })
  );
});
