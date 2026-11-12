const build = /* generated-precache */ { version: 'dev', paths: ['/index.html', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'] };
const cachePrefix = 'restaurantos-shell-';
const cacheName = cachePrefix + build.version;

self.addEventListener('install', event => {
  event.waitUntil(caches.open(cacheName).then(cache => cache.addAll(build.paths)));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith(cachePrefix) && name !== cacheName) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname === '/api' || url.pathname.startsWith('/api/')) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(async () => (await caches.open(cacheName)).match('/index.html')));
  } else if (build.paths.includes(url.pathname)) {
    event.respondWith((async () => (await caches.open(cacheName)).match(url.pathname))().then(cached => cached ?? fetch(request)));
  }
});
