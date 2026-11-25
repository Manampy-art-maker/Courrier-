/* Courrier - Service Worker : fonctionnement 100 % hors ligne */
const VERSION = 'v9';
const CACHE_NAME = 'ar-' + VERSION;

/* Fichier indispensable : s'il échoue, l'installation est refusée puis retentée plus tard */
const REQUIRED = ['./index.html'];
/* Fichiers secondaires : un échec n'empêche pas le mode hors ligne */
const OPTIONAL = [
  './',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png',
  './favicon.png'
];

async function precache(cache, url, mandatory) {
  try {
    const res = await fetch(new Request(url, { cache: 'reload' }));
    if (!res || !res.ok) throw new Error('HTTP ' + (res && res.status));
    await cache.put(url, res);
  } catch (e) {
    if (mandatory) throw e;
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all([
      ...REQUIRED.map((u) => precache(cache, u, true)),
      ...OPTIONAL.map((u) => precache(cache, u, false))
    ]);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((k) => k.startsWith('ar-') && k !== CACHE_NAME).map((k) => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

async function handle(req, event) {
  const cache = await caches.open(CACHE_NAME);
  const isNav = req.mode === 'navigate';

  /* 1) Réponse immédiate depuis le cache (aucun besoin d'internet) */
  let hit = await cache.match(req, { ignoreSearch: true });
  if (!hit && isNav) hit = await cache.match('./index.html');

  /* 2) Mise à jour silencieuse en arrière-plan si internet est disponible */
  const update = fetch(req)
    .then((res) => {
      if (res && res.ok && res.type === 'basic' && !res.redirected) {
        cache.put(isNav ? './index.html' : req, res.clone()).catch(() => {});
      }
      return res;
    })
    .catch(() => null);

  if (hit) {
    event.waitUntil(update);
    return hit;
  }

  const res = await update;
  if (res) return res;
  if (isNav) {
    const fallback = await cache.match('./index.html');
    if (fallback) return fallback;
  }
  return new Response('Hors ligne', { status: 503, statusText: 'Hors ligne' });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  event.respondWith(handle(req, event));
});
