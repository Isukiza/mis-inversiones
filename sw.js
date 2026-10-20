const CACHE_NAME = 'isukiza-v3';
const ASSETS = [
  '/mis-inversiones/',
  '/mis-inversiones/index.html',
  '/mis-inversiones/styles.css',
  '/mis-inversiones/manifest.json',
  'https://cdn.tailwindcss.com',
  'https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.1.1/crypto-js.min.js',
  'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&family=Syne:wght@400;700;800&display=swap'
];

// Hosts externos que sí se sirven desde caché (librerías y fuentes)
const CDN_HOSTS = [
  'cdn.tailwindcss.com',
  'cdnjs.cloudflare.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com'
];

// Instalación: cachear recursos estáticos
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      cache.addAll(ASSETS).catch(err => {
        console.warn('[SW] Algunos recursos no se pudieron cachear:', err);
      })
    )
  );
  self.skipWaiting();
});

// Activación: limpiar cachés antiguas
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const req = event.request;

  // Solo GET. Los PUT/POST (p. ej. sincronización con GitHub) pasan directos.
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const isCDN = CDN_HOSTS.includes(url.hostname);

  // Todo lo demás (Yahoo, proxies, workers.dev, api.github.com...) va siempre a la red
  if (!sameOrigin && !isCDN) return;

  // Archivos propios (index, app.js, styles...): red primero, caché solo si no hay conexión
  if (sameOrigin) {
    event.respondWith(
      fetch(req, { cache: 'no-cache' })
        .then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
          }
          return response;
        })
        .catch(() =>
          caches.match(req).then(cached => {
            if (cached) return cached;
            if (req.destination === 'document') return caches.match('/mis-inversiones/index.html');
            return Response.error();
          })
        )
    );
    return;
  }

  // Librerías y fuentes: caché primero (cambian muy poco)
  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(response => {
        if (response && response.status === 200 && response.type !== 'opaque') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
        }
        return response;
      });
    })
  );
});
