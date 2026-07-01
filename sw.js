const CACHE_NAME = 'facturation-v1';

const PRECACHE_URLS = [
  './',
  'index.html',
  'manifest.json',
  'css/styles.css',
  'css/rtl.css',
  'css/fonts.css',
  'js/arabic-shaper.js',
  'js/backup.js',
  'js/client.js',
  'js/company-modal.js',
  'js/config.js',
  'js/dialog.js',
  'js/history.js',
  'js/i18n.js',
  'js/icons.js',
  'js/lines.js',
  'js/main.js',
  'js/navigation.js',
  'js/opfs-storage.js',
  'js/pdf-font.js',
  'js/pdf.js',
  'js/storage-quota.js',
  'js/storage.js',
  'js/utils.js',
  'js/locales/fr.json',
  'js/locales/ar.json',
  'assets/fonts/Tajawal-Black.ttf',
  'assets/fonts/Tajawal-Bold.ttf',
  'assets/fonts/Tajawal-ExtraBold.ttf',
  'assets/fonts/Tajawal-Regular.ttf',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-180.png',
  'icons/icon-maskable-192.png',
  'icons/icon-maskable-512.png',
];

const CDN_ORIGIN = 'cdnjs.cloudflare.com';
const CDN_TIMEOUT_MS = 4000;

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(
        PRECACHE_URLS.map((url) =>
          cache.add(url).catch((err) => {
            console.warn('[SW] precache failed for:', url, err.message);
          })
        )
      );
    })
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim());
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  if (url.hostname === CDN_ORIGIN) {
    e.respondWith(
      new Promise((resolve) => {
        let resolved = false;
        const timer = setTimeout(() => {
          if (!resolved) {
            resolved = true;
            caches.match(e.request).then((cached) => {
              if (cached) {
                resolve(cached);
              } else {
                fetch(e.request).then(resolve).catch(() => resolve(new Response('', { status: 504 })));
              }
            });
          }
        }, CDN_TIMEOUT_MS);

        fetch(e.request)
          .then((response) => {
            if (!resolved) {
              resolved = true;
              clearTimeout(timer);
              const cloned = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(e.request, cloned));
              resolve(response);
            }
          })
          .catch(() => {
            if (!resolved) {
              resolved = true;
              clearTimeout(timer);
              caches.match(e.request).then((cached) => {
                if (cached) resolve(cached);
                else resolve(new Response('', { status: 504 }));
              });
            }
          });
      })
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request))
  );
});
