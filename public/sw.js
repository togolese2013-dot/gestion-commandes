/**
 * TOGOLESE — Service Worker
 * Strategy:
 *   - Static assets (JS, CSS, images, fonts) → Cache-first
 *   - HTML navigation → Network-first, fallback to offline page
 *   - API routes → Network-only (never cache)
 */

const CACHE_NAME    = 'togolese-v1';
const OFFLINE_URL   = '/offline';
const STATIC_ASSETS = [
  '/offline',
  '/icons/icon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
  '/manifest.webmanifest',
];

// ── Install: pre-cache critical assets ───────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// ── Activate: clean up old caches ────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch: routing strategy ───────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET, cross-origin, and API/SSE requests
  if (
    request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/api/')
  ) {
    return; // Let the browser handle it normally
  }

  // Static assets (.js, .css, .png, .svg, .woff2, etc.) → Cache-first
  if (/\.(js|css|png|svg|jpg|jpeg|webp|ico|woff2?|ttf)(\?.*)?$/.test(url.pathname)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // HTML navigation → Network-first with offline fallback
  if (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(networkFirstWithOfflineFallback(request));
    return;
  }
});

// ── Strategies ────────────────────────────────────────────────────────────────

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Asset unavailable offline', { status: 503 });
  }
}

async function networkFirstWithOfflineFallback(request) {
  try {
    const response = await fetch(request);
    // Cache successful navigation responses for faster next load
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Offline: try cached version first
    const cached = await caches.match(request);
    if (cached) return cached;
    // Final fallback: offline page
    const offline = await caches.match(OFFLINE_URL);
    return offline ?? new Response('Vous êtes hors ligne.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}
