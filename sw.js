/* Service Worker — Photoframe Generator Instansi
   Strategi:
   - File aplikasi (HTML, manifest, ikon): di-cache saat install.
   - Halaman (navigasi): network-first, jatuh ke cache saat offline -> update cepat tampil.
   - File statis lain (ikon, CDN Tailwind/Lucide, Google Fonts): stale-while-revalidate.
   Naikkan CACHE_VERSION setiap kali file aplikasi diubah. */

const CACHE_VERSION = 'v2';
const APP_CACHE = `photoframe-app-${CACHE_VERSION}`;
const RUNTIME_CACHE = `photoframe-runtime-${CACHE_VERSION}`;

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png'
];

// Pustaka eksternal yang dipakai halaman (di-cache supaya bisa dipakai offline)
const CDN_ASSETS = [
  'https://cdn.tailwindcss.com',
  'https://unpkg.com/lucide@latest'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const app = await caches.open(APP_CACHE);
    await app.addAll(APP_SHELL);
    // CDN: gagal satu tidak membatalkan instalasi
    const rt = await caches.open(RUNTIME_CACHE);
    await Promise.allSettled(CDN_ASSETS.map(async url => {
      const res = await fetch(new Request(url, { mode: 'no-cors' }));
      await rt.put(url, res);
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keep = [APP_CACHE, RUNTIME_CACHE];
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('photoframe-') && !keep.includes(k)).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (!/^https?:$/.test(url.protocol)) return;

  // Navigasi halaman: network-first
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(APP_CACHE);
        cache.put('./index.html', fresh.clone());
        return fresh;
      } catch (err) {
        const cached = await caches.match('./index.html') || await caches.match('./');
        return cached || new Response('Offline', { status: 503, statusText: 'Offline' });
      }
    })());
    return;
  }

  // Lainnya: stale-while-revalidate
  event.respondWith((async () => {
    const cache = await caches.open(url.origin === self.location.origin ? APP_CACHE : RUNTIME_CACHE);
    const cached = await cache.match(req);
    const network = fetch(req).then(res => {
      // simpan respons normal maupun opaque (CDN tanpa CORS)
      if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
      return res;
    }).catch(() => null);
    return cached || (await network) || new Response('', { status: 504, statusText: 'Offline' });
  })());
});
