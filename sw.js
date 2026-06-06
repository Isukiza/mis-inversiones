const CACHE_NAME = 'isukiza-v1';
const ASSETS = [
  '/mis-inversiones/',
  '/mis-inversiones/index.html',
  '/mis-inversiones/app.js',
  '/mis-inversiones/styles.css',
  '/mis-inversiones/manifest.json',
  'https://cdn.tailwindcss.com',
  'https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.1.1/crypto-js.min.js',
  'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&family=Syne:wght@400;700;800&display=swap'
];

// Instalación: cachear recursos estáticos
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS).catch(err => {
        console.warn('[SW] Algunos recursos no se pudieron cachear:', err);
      });
    })
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

// Fetch: network first para APIs de precios, cache first para el resto
self.addEventListener('fetch', event => {
  const url = event.request.url;

  // Para llamadas a Yahoo Finance y proxies — siempre red (precios en tiempo real)
  if (url.includes('finance.yahoo.com') ||
      url.includes('corsproxy.io') ||
      url.includes('allorigins.win') ||
      url.includes('codetabs.com')) {
    event.respondWith(fetch(event.request).catch(() => new Response('', { status: 503 })));
    return;
  }

  // Para el resto — cache first, fallback a red
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        // Cachear respuestas válidas
        if (response && response.status === 200 && response.type !== 'opaque') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        // Sin conexión y sin caché: devolver página principal
        if (event.request.destination === 'document') {
          return caches.match('/mis-inversiones/index.html');
        }
      });
    })
  );
});
