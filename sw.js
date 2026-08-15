/* Service worker: делает приложение доступным без интернета.
 *
 * Кэшируется только оболочка — HTML, шрифты, KaTeX, highlight.js.
 * Карточки сюда не попадают: они приходят из приватного репозитория
 * и лежат в IndexedDB. Запросы к api.github.com проходят мимо кэша,
 * иначе телефон показывал бы вчерашние карточки и не знал об этом.
 */
const VERSION = 'v1';
const CACHE = 'cards-shell-' + VERSION;

const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './vendor/katex.min.css',
  './vendor/katex.min.js',
  './vendor/auto-render.min.js',
  './vendor/hljs.min.js',
  './vendor/atom-one-dark.min.css',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

// Шрифты KaTeX подкачиваются по факту обращения: их два десятка,
// а для конкретных карточек нужны обычно три-четыре.
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k.startsWith('cards-shell-') && k !== CACHE)
            .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Данные и картинки из GitHub — всегда по сети, кэшем занимается само приложение
  if (url.hostname === 'api.github.com' || url.hostname.endsWith('githubusercontent.com')) return;

  // Всё остальное со своего origin: отдаём из кэша, параллельно освежая
  if (url.origin !== self.location.origin) return;

  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, { ignoreSearch: true });

    const network = fetch(req).then(res => {
      if (res && res.ok && res.type === 'basic') cache.put(req, res.clone());
      return res;
    }).catch(() => null);

    if (hit) { network; return hit; }          // офлайн-первым: мгновенно и без сети

    const res = await network;
    if (res) return res;

    // навигация без сети и без кэша — отдаём оболочку
    if (req.mode === 'navigate') {
      const shell = await cache.match('./index.html');
      if (shell) return shell;
    }
    return new Response('Офлайн', { status: 503, statusText: 'Offline' });
  })());
});

// Приложение просит обновиться, когда пользователь нажал «Обновить приложение»
self.addEventListener('message', e => {
  if (e.data === 'skip-waiting') self.skipWaiting();
});
