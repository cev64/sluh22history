/* Service worker for the League History record book.
   Strategy:
     - navigations (the season pages): network first, cached copy as fallback
     - same-origin assets: cache first, refreshed in the background
     - Google Fonts: stale-while-revalidate in a separate cache
   Bump CACHE_VERSION whenever the precache list or these rules change. */

const CACHE_VERSION = 'v6';
const SHELL_CACHE = `league-history-shell-${CACHE_VERSION}`;
const FONT_CACHE = `league-history-fonts-${CACHE_VERSION}`;

const PRECACHE = [
  './',
  './index.html',
  './alltime.html',
  './2021.html',
  './2022.html',
  './2023.html',
  './2024.html',
  './2025.html',
  './2026.html',
  './trophy.html',
  './league-data.js',
  './pwa.js',
  // The trophy room's modules and its copy of three.js. Precaching them keeps
  // the hall openable offline, the same as every other page here.
  './trophy/app.js',
  './trophy/accolades.js',
  './trophy/textures.js',
  './trophy/models.js',
  './trophy/hall.js',
  './vendor/three.module.min.js',
  './vendor/three.core.min.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    // Tolerate individual misses so one bad entry can't fail the whole install.
    await Promise.allSettled(PRECACHE.map((url) => cache.add(new Request(url, { cache: 'reload' }))));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => key.startsWith('league-history-') && key !== SHELL_CACHE && key !== FONT_CACHE)
        .map((key) => caches.delete(key))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

function isFontRequest(url) {
  return url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
}

async function networkFirst(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    const cached = await cache.match(request) || await cache.match('./2026.html');
    if (cached) return cached;
    throw err;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(request);
  if (cached) {
    // Refresh in the background; failures here are irrelevant to the response.
    fetch(request).then((response) => {
      if (response && response.ok) cache.put(request, response.clone());
    }).catch(() => {});
    return cached;
  }
  const response = await fetch(request);
  if (response && response.ok) cache.put(request, response.clone());
  return response;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(FONT_CACHE);
  const cached = await cache.match(request);
  const network = fetch(request).then((response) => {
    // Opaque font responses are fine to store; they replay verbatim.
    if (response && (response.ok || response.type === 'opaque')) cache.put(request, response.clone());
    return response;
  }).catch(() => null);
  return cached || network || fetch(request);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (isFontRequest(url)) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }

  event.respondWith(cacheFirst(request));
});
