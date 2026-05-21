const CACHE_VERSION = 'sous-v6';
const APP_SHELL_CACHE = CACHE_VERSION;
const APP_SHELL_ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './js/theme.js',
  './js/utils/safety.js',
  './js/storage.js',
  './js/core/totals.js',
  './js/food-data.js',
  './js/parser.js',
  './js/ai-response-cache.js',
  './js/speech.js',
  './js/history.js',
  './js/profile.js',
  './js/recipes.js',
  './js/onboarding.js',
  './js/test-mode.js',
  './js/app.js',
  './js/ai-interpreter.js',
  './js/barcode.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(APP_SHELL_CACHE)
      .then(cache => cache.addAll(APP_SHELL_ASSETS))
      .catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key !== APP_SHELL_CACHE)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

function shouldUseNetworkFirst(request) {
  if (request.method !== 'GET') return false;
  if (request.mode === 'navigate') return true;

  const destination = request.destination;
  return destination === 'script' ||
    destination === 'style' ||
    destination === 'font' ||
    destination === 'manifest';
}

async function networkFirst(request) {
  const cache = await caches.open(APP_SHELL_CACHE);
  try {
    const response = await fetch(request, { cache: 'no-store' });
    if (response && response.status === 200) {
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch (error) {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    if (request.mode === 'navigate') return cache.match('./index.html');
    throw error;
  }
}

self.addEventListener('fetch', event => {
  if (shouldUseNetworkFirst(event.request)) {
    event.respondWith(networkFirst(event.request));
  }
});
