/* ═══════════════════════════════════════════════════════════════════
   Elite Hub 2.0 — Service Worker v3
   Stale-while-revalidate + proper version detection + update broadcasting
   ═══════════════════════════════════════════════════════════════════ */

// Bump this constant every time you ship a meaningful change to app.html/css.
// The service worker detects the change on next install and swaps itself in.
const APP_VERSION = '2.1.1';
const CACHE_NAME = 'elite-hub-2.0-' + APP_VERSION;

const PRECACHE = [
  './',
  './app.html',
  './app.css',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap',
];

/* ─── INSTALL ──────────────────────────────────────────────
   On install: open a fresh cache for this version and
   pre-fetch the shell. Don't take over yet (user might be
   mid-action). skipWaiting happens via message from the
   page when user clicks "Update now."
*/
self.addEventListener('install', (event) => {
  console.log('[SW] Installing v' + APP_VERSION);
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE.map(u => new Request(u, { mode: 'no-cors' }))))
      .catch((err) => console.warn('[SW] Precache failed:', err))
  );
});

/* ─── ACTIVATE ─────────────────────────────────────────────
   When this SW activates (replacing the old one), clear ALL
   old caches and take control of every open tab.
*/
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

/* ─── MESSAGE ──────────────────────────────────────────────
   Page can post messages to control SW behavior:
     { type: 'SKIP_WAITING' }  → activate new SW immediately
     { type: 'GET_VERSION' }   → reply with current version
*/
self.addEventListener('message', (event) => {
  if (!event.data) return;
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data.type === 'GET_VERSION') {
    event.source.postMessage({ type: 'VERSION', version: APP_VERSION });
  }
});

/* ─── FETCH — Stale-While-Revalidate ───────────────────────
   Serve from cache instantly, revalidate in background.
*/
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Don't cache Apps Script calls — always hit network for data
  if (url.hostname.includes('script.google.com') ||
      url.hostname.includes('googleusercontent.com')) {
    return;
  }

  // Don't cache non-GET
  if (event.request.method !== 'GET') return;

  // Opt-out via ?nocache=1 for dev testing — always hit network
  if (url.searchParams.has('nocache')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Stale-while-revalidate
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
