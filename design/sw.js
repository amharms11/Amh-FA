// AMH Studio offline cache. Bump VERSION whenever app files change.
const VERSION = 'amhstudio-v1';
const FILES = ['./', 'index.html', 'style.css?v=1', 'templates.js?v=1', 'render.js?v=1', 'app.js?v=1', 'manifest.webmanifest', 'icon.svg', 'vendor/jspdf.umd.min.js'];
const CDN = ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdnjs.cloudflare.com'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('amhstudio-') && k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (CDN.includes(url.hostname)) {
    // Fonts and the PDF library: cache first so they work offline after the first visit.
    e.respondWith(caches.open(VERSION + '-cdn').then((c) => c.match(e.request).then((r) => r || fetch(e.request).then((res) => { c.put(e.request, res.clone()); return res; }))));
    return;
  }
  if (url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); return res; })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('index.html')))
  );
});
