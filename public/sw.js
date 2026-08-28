/**
 * SplitWise AI - Progressive Web App Service Worker (v3.0)
 * Network-First strategy ensures users always get the latest live code
 * without needing Ctrl+Shift+R or clearing browser cache.
 */

const CACHE_NAME = 'splitwise-ai-v3.0';

const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/landing.css',
  '/landing.js',
  '/auth.html',
  '/auth.css',
  '/auth.js',
  '/firebase-config.js',
  '/dashboard.html',
  '/dashboard.css',
  '/dashboard.js',
  '/history.html',
  '/history.css',
  '/history.js',
  '/manifest.json',
  '/icons/icon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png'
];

// Install Event: Pre-cache assets and immediately activate
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[PWA SW v3.0] Pre-caching application assets...');
      return cache.addAll(PRECACHE_ASSETS);
    })
  );
});

// Activate Event: Wipe all legacy cache versions immediately
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            console.log('[PWA SW v3.0] Purging outdated cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event: Network-First for everything (Fallback to Cache only when offline)
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Non-GET requests (e.g. POST /api/*) go straight to network
  if (event.request.method !== 'GET') {
    return;
  }

  // Network-First strategy
  event.respondWith(
    fetch(event.request)
      .then(networkResponse => {
        // If valid response, update cache in background
        if (
          networkResponse &&
          networkResponse.status === 200 &&
          (url.origin === location.origin || url.hostname.includes('fonts.'))
        ) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(async () => {
        // Offline Fallback: Serve from cache if network is unavailable
        const cached = await caches.match(event.request);
        if (cached) return cached;

        // Fallback for page navigations
        if (event.request.mode === 'navigate' || event.request.headers.get('accept')?.includes('text/html')) {
          return caches.match('/history.html') || caches.match('/dashboard.html') || caches.match('/index.html');
        }

        return new Response('Offline - Network unavailable', { status: 503, statusText: 'Offline' });
      })
  );
});
