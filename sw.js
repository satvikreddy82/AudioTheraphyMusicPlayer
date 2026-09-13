/**
 * sw.js — Audio Theraphy Production Service Worker
 * 
 * • High-performance App Shell caching
 * • Zero-interference Network-Only bypass for audio streaming
 * • Network-First for search APIs with clean offline handling
 * • Stale-While-Revalidate / Cache-First for static assets
 * • Clean cache versioning and automatic cleanup
 */

'use strict';

const CACHE_VERSION = 'audio-theraphy-v3';
const APP_SHELL_CACHE = `${CACHE_VERSION}-shell`;
const RUNTIME_CACHE   = `${CACHE_VERSION}-runtime`;

// Static files required for the application shell
const APP_SHELL_ASSETS = [
  '/',
  '/index.html',
  '/player.html',
  '/style.css',
  '/player.css',
  '/musicService.js',
  '/player.js',
  '/pwa.js',
  '/manifest.webmanifest',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-512-maskable.png',
  '/icons/apple-touch-icon.png',
  '/icons/favicon-32.png',
  '/assets/nav%20logo.jpeg',
  '/assets/web-logo.png',
  '/assets/playerimg.png',
  '/assets/player2.png',
];

// ─────────────────────────────────────────────
//  INSTALL EVENT: Pre-cache App Shell
// ─────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_SHELL_CACHE).then((cache) => {
      // Use cache.addAll with graceful fallback if any optional asset fails
      return Promise.all(
        APP_SHELL_ASSETS.map((url) => {
          return fetch(url)
            .then((response) => {
              if (response.ok) {
                return cache.put(url, response);
              }
            })
            .catch((err) => {
              console.warn('[SW] Could not precache:', url, err);
            });
        })
      );
    }).then(() => {
      return self.skipWaiting();
    })
  );
});

// ─────────────────────────────────────────────
//  ACTIVATE EVENT: Purge Outdated Caches
// ─────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  const currentCaches = [APP_SHELL_CACHE, RUNTIME_CACHE];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (!currentCaches.includes(name)) {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          }
        })
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

// ─────────────────────────────────────────────
//  MESSAGE EVENT: Manual skipWaiting
// ─────────────────────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ─────────────────────────────────────────────
//  FETCH EVENT: Intelligent Routing
// ─────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // 1. Only handle GET requests
  if (request.method !== 'GET') {
    return;
  }

  // 2. CRITICAL FOR MUSIC APP: Audio streams must be NETWORK-ONLY.
  // Never intercept, cache, or alter Range headers for audio streams.
  if (
    url.pathname.startsWith('/api/audio') ||
    request.destination === 'audio' ||
    url.pathname.endsWith('.mp3') ||
    url.pathname.endsWith('.m4a') ||
    url.pathname.endsWith('.aac') ||
    url.pathname.endsWith('.ogg') ||
    url.pathname.endsWith('.wav')
  ) {
    // Let browser make direct network request
    return;
  }

  // 3. Dynamic Music APIs (JioSaavn proxy, iTunes JSONP, JioSaavn direct)
  // Use Network-First; if offline, return structured offline fallback JSON
  if (
    url.pathname.startsWith('/api/saavn') ||
    url.hostname.includes('jiosaavn.com') ||
    url.hostname.includes('itunes.apple.com')
  ) {
    event.respondWith(
      fetch(request)
        .catch(() => {
          return new Response(
            JSON.stringify({
              error: 'offline',
              results: [],
              message: 'You are currently offline. Reconnect to search and stream music.',
            }),
            {
              status: 503,
              statusText: 'Service Unavailable (Offline)',
              headers: { 'Content-Type': 'application/json; charset=utf-8' },
            }
          );
        })
    );
    return;
  }

  // 4. HTML Navigation requests (Page loads)
  // Network-First with Cache Fallback for offline usage
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(APP_SHELL_CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(async () => {
          // Attempt exact URL from cache
          const cachedPage = await caches.match(request);
          if (cachedPage) return cachedPage;

          // If looking for player.html, fallback to cached player.html
          if (url.pathname.includes('player')) {
            const cachedPlayer = await caches.match('/player.html');
            if (cachedPlayer) return cachedPlayer;
          }

          // Default fallback to index.html
          const cachedHome = await caches.match('/index.html') || await caches.match('/');
          if (cachedHome) return cachedHome;

          return new Response('<h1>Offline</h1><p>Please check your internet connection.</p>', {
            status: 503,
            headers: { 'Content-Type': 'text/html; charset=utf-8' }
          });
        })
    );
    return;
  }

  // 5. Static Assets (CSS, JS, Webmanifest, local Images, Google Fonts, Font Awesome)
  // Stale-While-Revalidate: Return cached response immediately, update cache in background
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const fetchPromise = fetch(request)
        .then((networkResponse) => {
          if (
            networkResponse &&
            (networkResponse.status === 200 || networkResponse.type === 'opaque')
          ) {
            const clone = networkResponse.clone();
            caches.open(RUNTIME_CACHE).then((cache) => {
              // Avoid caching giant media responses in runtime cache
              cache.put(request, clone);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // If network fetch fails and no cache exists, return empty/error response
          return cachedResponse;
        });

      return cachedResponse || fetchPromise;
    })
  );
});
