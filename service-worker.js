const CACHE_VERSION = "v4.0";
const CACHE_NAME = `trackit-${CACHE_VERSION}`;

// Обязательные файлы
const REQUIRED_ASSETS = [
  "/TrackIt/",
  "/TrackIt/index.html",
  "/TrackIt/styles.css",
  "/TrackIt/script.js",
  "/TrackIt/manifest.json"
];

// Опциональные файлы
const OPTIONAL_ASSETS = [
  "/TrackIt/uno.html",
  "/TrackIt/bura.html",
  "/TrackIt/chests.html",
  "/TrackIt/108.html",
  "/TrackIt/icons/icon-v3.0-192x192.png",
  "/TrackIt/icons/icon-v3.0-512x512.png"
];

// ============================================================================
// INSTALL
// ============================================================================

self.addEventListener("install", (event) => {

  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Кэшируем обязательные файлы (не блокируем если ошибка)
      try {
        const results = await Promise.allSettled(
          REQUIRED_ASSETS.map(url =>
            fetch(url).then(r => {
              if (!r.ok) throw new Error(`${r.status}`);
              return cache.put(url, r);
            })
          )
        );
        const failed = results.filter(r => r.status === 'rejected');
      } catch (error) {
      }

      // Опциональные файлы кэшируются по возможности
      await Promise.allSettled(
        OPTIONAL_ASSETS.map(url =>
          fetch(url)
            .then(r => r.ok ? cache.put(url, r) : null)
            .catch(() => {}) // молчим об ошибках опциональных файлов
        )
      );

      // Агрессивная активация
      return self.skipWaiting();
    })
  );
});

// ============================================================================
// ACTIVATE
// ============================================================================

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => {
        return Promise.all(
          names
            .filter(n => n.startsWith("trackit-") && n !== CACHE_NAME)
            .map(n => caches.delete(n))
        );
      })
      .then(() => self.clients.claim())
  );
});

// ============================================================================
// FETCH - Stale-While-Revalidate
// ============================================================================

self.addEventListener("fetch", (event) => {
  // Игнорируем не-GET запросы
  if (event.request.method !== "GET") {
    return;
  }

  const url = new URL(event.request.url);

  // Игнорируем запросы с других origin
  if (url.origin !== location.origin) {
    return;
  }

  // Специальная обработка для разных типов ресурсов
  if (url.pathname.includes('/assets/ava/')) {
    // Аватары: кэш с возможностью обновления
    event.respondWith(handleAvatarFetch(event.request));
  } else if (url.pathname.endsWith('.html')) {
    // HTML: свежая версия в приоритете
    event.respondWith(handleHtmlFetch(event.request));
  } else {
    // Остальное: быстро из кэша
    event.respondWith(handleAssetFetch(event.request));
  }
});

/**
 * Обработка запроса аватара
 * Стратегия: Cache First + Network Fallback
 */
async function handleAvatarFetch(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  if (cached) {
    // Обновляем в фоне
    fetch(request)
      .then(res => {
        if (res.ok && res.status === 200) {
          cache.put(request, res);
        }
      })
      .catch(() => {});
    return cached;
  }

  // Кэша нет, пытаемся получить из сети
  try {
    const res = await fetch(request);
    if (res.ok && res.status === 200) {
      cache.put(request, res.clone());
    }
    return res;
  } catch {
    // Ошибка сети и кэша нет
    return new Response('Ресурс недоступен', { status: 503 });
  }
}

/**
 * Обработка HTML документов
 * Стратегия: Network First + Cache Fallback
 */
async function handleHtmlFetch(request) {
  const cache = await caches.open(CACHE_NAME);

  try {
    const res = await fetch(request);
    if (res.ok && res.status === 200 && res.type !== 'opaque') {
      cache.put(request, res.clone());
    }
    return res;
  } catch {
    // Нет сети, используем кэш
    const cached = await cache.match(request);
    if (cached) return cached;

    // ✅ Кэша нет, пытаемся вернуть главную страницу
    if (request.mode === "navigate") {
      const fallback = await cache.match("/TrackIt/index.html");
      if (fallback) return fallback;
    }

    // Полный офлайн и кэша нет
    return new Response('Нет соединения', { status: 503 });
  }
}

/**
 * Обработка остальных ресурсов (CSS, JS, иконки)
 * Стратегия: Stale-While-Revalidate
 */
async function handleAssetFetch(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  // Фоновое обновление
  const updateCache = fetch(request)
    .then(res => {
      if (res.ok && res.status === 200 && res.type !== 'opaque') {
        cache.put(request, res.clone());
      }
      return res;
    })
    .catch(() => null);

  // Если есть кэш, отдаём немедленно
  if (cached) {
    // Обновляем в фоне (не блокируем ответ)
    updateCache.catch(() => {});
    return cached;
  }

  // Кэша нет, ждём сеть
  const fresh = await updateCache;
  if (fresh) return fresh;

  // Обе стратегии не сработали
  return new Response('Ресурс недоступен', { status: 503 });
}

// ============================================================================
// MESSAGE - Команды из UI
// ============================================================================

self.addEventListener("message", (event) => {
  if (event.data?.action === "skipWaiting") {
    self.skipWaiting();
  }

  if (event.data?.action === "clearCache") {
    caches.keys().then(names =>
      Promise.all(names.map(n => caches.delete(n)))
    );
  }
});

// ============================================================================
// BACKGROUND SYNC (опционально)
// ============================================================================

// Для синхронизации данных при возврате в онлайн
self.addEventListener("sync", (event) => {
  if (event.tag === "sync-game-history") {
    event.waitUntil(
      clients.matchAll().then(allClients => {
        allClients.forEach(client => {
          client.postMessage({ type: "sync-complete" });
        });
      })
    );
  }
});