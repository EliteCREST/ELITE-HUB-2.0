/* ═══════════════════════════════════════════════════════════════════
   Elite Hub 2.0 — Service Worker
   Stage 1.3: Precache shell + stale-while-revalidate for runtime
   ═══════════════════════════════════════════════════════════════════ */

const CACHE_NAME = 'elite-hub-2.0-v1';
const PRECACHE = [
  './',
  './app.html',
  './app.css',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE.map(u => new Request(u, { mode: 'no-cors' }))))
      .then(() => self.skipWaiting())
      .catch((err) => console.warn('[SW] Precache failed:', err))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Don't cache Apps Script calls — always hit network for data
  if (url.hostname.includes('script.google.com') ||
      url.hostname.includes('googleusercontent.com')) {
    return; // let the browser handle it normally
  }

  // Don't cache POST, PUT, DELETE
  if (event.request.method !== 'GET') return;

  // Stale-while-revalidate for everything else
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(event.request).then((cached) => {
        const networkFetch = fetch(event.request)
          .then((response) => {
            if (response && response.status === 200) {
              cache.put(event.request, response.clone());
            }
            return response;
          })
          .catch(() => cached); // fall back to cache if network fails

        // Return cache immediately if present, otherwise wait for network
        return cached || networkFetch;
      })
    )
  );
});
