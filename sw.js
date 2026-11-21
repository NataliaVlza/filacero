/* FilaCero · Service Worker
   - Precachea el "app shell" para que la app abra sin conexión.
   - Páginas (navegación): red primero, y si no hay internet, la versión guardada.
   - Archivos propios (íconos, manifest): caché primero.
   - Google Fonts: se guardan al primer uso y se actualizan en segundo plano.
   Cuando cambies index.html, sube el número de VERSION para que se renueve la caché. */

const VERSION = 'v2';
const SHELL_CACHE = `filacero-shell-${VERSION}`;
const FONT_CACHE = `filacero-fonts-${VERSION}`;

const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png',
  './banner-hero.jpg'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      // Se agrega uno por uno: si falta un archivo, no se cae toda la instalación.
      .then(cache => Promise.all(SHELL.map(url => cache.add(url).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => k.startsWith('filacero-') && k !== SHELL_CACHE && k !== FONT_CACHE)
          .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // 1) Navegación: red primero, respaldo en caché (así abre offline).
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then(c => c.put('./index.html', copy));
          return res;
        })
        .catch(() =>
          caches.match(req).then(r => r || caches.match('./index.html') || caches.match('./'))
        )
    );
    return;
  }

  // 2) Archivos del mismo sitio: caché primero, y se completa con la red.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then(cached => {
        if (cached) return cached;
        return fetch(req).then(res => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(SHELL_CACHE).then(c => c.put(req, copy));
          }
          return res;
        });
      })
    );
    return;
  }

  // 3) Google Fonts: se muestra lo guardado y se actualiza en segundo plano.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.open(FONT_CACHE).then(cache =>
        cache.match(req).then(cached => {
          const net = fetch(req)
            .then(res => { cache.put(req, res.clone()); return res; })
            .catch(() => cached);
          return cached || net;
        })
      )
    );
  }
  // Cualquier otra cosa (EmailJS, APIs, etc.) pasa directo a la red, sin caché.
});
