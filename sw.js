/* Service worker: делает приложение доступным без интернета.
 *
 * Кэшируется только оболочка — HTML, шрифты, KaTeX, highlight.js.
 * Карточки сюда не попадают: они приходят из приватного репозитория
 * и лежат в IndexedDB. Запросы к api.github.com проходят мимо кэша,
 * иначе телефон показывал бы вчерашние карточки и не знал об этом.
 *
 * Обновление: VERSION проставляет deploy-app.py. Изменился sw.js — браузер
 * ставит новую версию рядом со старой, и она ждёт, пока в приложении не нажмут
 * «Обновить». Что показано на экране — ровно то, что в кэше этой версии:
 * фоном оболочка не переписывается, поэтому старый HTML не смешивается с новым.
 */
const VERSION = '20261027-1253-47e3d8ea';
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
  './vendor/excalidraw/Virgil.woff2',
  './vendor/excalidraw/Cascadia.woff2',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

// Шрифты KaTeX подкачиваются по факту обращения: их два десятка,
// а для конкретных карточек нужны обычно три-четыре.
// cache:'reload' — мимо HTTP-кэша: GitHub Pages разрешает держать файлы 10 минут,
// и без этого в новую версию мог попасть старый index.html.
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' }))))
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

  // Всё остальное со своего origin: из кэша, а чего там нет — из сети с докладыванием
  if (url.origin !== self.location.origin) return;

  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;

    try {
      const res = await fetch(req);
      if (res && res.ok && res.type === 'basic') cache.put(req, res.clone());
      return res;
    } catch (_) {
      // навигация без сети и без кэша — отдаём оболочку
      if (req.mode === 'navigate') {
        const shell = await cache.match('./index.html');
        if (shell) return shell;
      }
      return new Response('Офлайн', { status: 503, statusText: 'Offline' });
    }
  })());
});

// Приложение просит обновиться, когда пользователь нажал «Обновить»
self.addEventListener('message', e => {
  if (e.data === 'skip-waiting') self.skipWaiting();
});
