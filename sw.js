/* Service worker — Dashboard Stok Kain Finishing
 * - Cangkang aplikasi (index.html, manifest, ikon) disimpan agar bisa dibuka offline.
 * - Library CDN & font disimpan setelah pertama dimuat.
 * - Data Google Sheets TIDAK diintersep di sini; salinan terakhirnya disimpan oleh halaman (localStorage).
 * Naikkan VERSION kalau mengganti ikon/manifest supaya cache lama dibuang. */
const VERSION = 'v2';
const SHELL = 'stok-shell-' + VERSION;
const CDN = 'stok-cdn-' + VERSION;

const SHELL_FILES = ['./', './index.html', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png', './icons/favicon-48.png'];
const CDN_FILES = [
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js',
  'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600;700&display=swap'
];
const CDN_HOSTS = ['cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const shell = await caches.open(SHELL);
    await Promise.all(SHELL_FILES.map(f => shell.add(f).catch(() => {})));
    const cdn = await caches.open(CDN);
    await Promise.all(CDN_FILES.map(async (u) => {
      try { await cdn.put(u, await fetch(new Request(u, { mode: 'no-cors' }))); } catch (e) { /* dicoba lagi saat runtime */ }
    }));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = [SHELL, CDN];
    for (const k of await caches.keys()) { if (!keep.includes(k)) await caches.delete(k); }
    await self.clients.claim();
  })());
});

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Halaman utama: ambil versi terbaru kalau online, jatuh ke salinan tersimpan kalau offline/lambat.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const res = await withTimeout(fetch(req), 4000);
        if (res && res.ok) { (await caches.open(SHELL)).put('./index.html', res.clone()); }
        return res;
      } catch (e) {
        return (await caches.match(req, { ignoreSearch: true })) || (await caches.match('./index.html')) || Response.error();
      }
    })());
    return;
  }

  // File statis milik sendiri (ikon, manifest): cache dulu.
  if (url.origin === self.location.origin) {
    event.respondWith((async () => {
      const hit = await caches.match(req, { ignoreSearch: true });
      if (hit) return hit;
      const res = await fetch(req);
      if (res && res.ok) (await caches.open(SHELL)).put(req, res.clone());
      return res;
    })());
    return;
  }

  // Library CDN & font: pakai salinan tersimpan, perbarui diam-diam di belakang.
  if (CDN_HOSTS.includes(url.hostname)) {
    event.respondWith((async () => {
      const cache = await caches.open(CDN);
      const hit = await cache.match(req);
      const net = fetch(req).then(res => { if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone()); return res; }).catch(() => null);
      return hit || (await net) || Response.error();
    })());
    return;
  }
  // Selain itu (Google Apps Script / Sheets) lewat jaringan seperti biasa.
});
