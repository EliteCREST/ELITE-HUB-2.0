/* ═══════════════════════════════════════════════════════════════════
   Elite Hub 2.0 — Service Worker v4
   app.html and version.json always served fresh from network.
   Everything else: stale-while-revalidate.
   ═══════════════════════════════════════════════════════════════════ */

const APP_VERSION = '2.5.8';
const CACHE_NAME = 'elite-hub-2.0-' + APP_VERSION;

// Never cache these — always fetch fresh from network
const NETWORK_ONLY = ['app.html', 'version.json', '/'];

const PRECACHE = [
  './app.css',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap',
];

/* ─── INSTALL ─────────────────────────────────────────────── */
self.addEventListener('install', (event) => {
  console.log('[SW] Installing v' + APP_VERSION);
  // Skip waiting immediately — take over all tabs right away
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // Cache each asset individually so one failure (e.g. a cross-origin
      // font request) doesn't abort the whole precache like addAll does.
      Promise.all(PRECACHE.map((u) =>
        cache.add(new Request(u, { mode: 'no-cors' }))
          .catch((err) => console.warn('[SW] Precache skipped (' + u + '):', err && err.message))
      ))
    )
  );
});

/* ─── ACTIVATE ────────────────────────────────────────────── */
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating v' + APP_VERSION);
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => {
          console.log('[SW] Deleting old cache: ' + k);
          return caches.delete(k);
        })
      ))
      .then(() => self.clients.claim())
      .then(() => broadcastToClients({ type: 'SW_ACTIVATED', version: APP_VERSION }))
  );
});

/* ─── MESSAGE ─────────────────────────────────────────────── */
self.addEventListener('message', (event) => {
  if (!event.data) return;
  if (event.data.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data.type === 'GET_VERSION') {
    event.source.postMessage({ type: 'VERSION', version: APP_VERSION });
  }
});

/* ─── FETCH ───────────────────────────────────────────────── */
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Never intercept Apps Script / Google API calls
  if (url.hostname.includes('script.google.com') ||
      url.hostname.includes('googleusercontent.com')) {
    return;
  }

  // Only handle GET
  if (event.request.method !== 'GET') return;

  // Network-only: app.html, version.json, root — always fresh
  const pathname = url.pathname;
  const isNetworkOnly = NETWORK_ONLY.some(n =>
    pathname.endsWith(n) || pathname === '/' || pathname === ''
  );
  if (isNetworkOnly) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' }).catch(() => {
        // If offline, fall back to cache as last resort
        return caches.match(event.request);
      })
    );
    return;
  }

  // Everything else: stale-while-revalidate
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
          .catch(() => cached);
        return cached || networkFetch;
      })
    )
  );
});

function broadcastToClients(message) {
  return self.clients.matchAll({ includeUncontrolled: true, type: 'window' })
    .then((clients) => clients.forEach((c) => c.postMessage(message)));
}
