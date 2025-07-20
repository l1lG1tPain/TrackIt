// Обновляем версию кэша
const CACHE_VERSION = "v3.1";
const CACHE_NAME = `trackit-${CACHE_VERSION}`;

// Файлы, которые нужно закэшировать
const ASSETS = [
  "/",
  "/index.html",
  "/styles.css",
  "/script.js",
  "/manifest.json",
  "/uno.html",
  "/bura.html",
  "/chests.html",
  "/108.html",
  "/icons/icon-v3.0-192x192.png",
  "/icons/icon-v3.0-512x512.png"
]

// === INSTALL ===
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
  // skipWaiting(), чтобы сразу активировать новый SW (по желанию)
  // self.skipWaiting();
});

// === ACTIVATE ===
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames.map((cache) => {
          // Удаляем все устаревшие кэши
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      )
    )
  );
  // clients.claim(), чтобы взять под контроль открытые страницы (по желанию)
  // self.clients.claim();
});

// === FETCH ===
self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // 1. Если ресурс есть в кэше, отдаем его
      if (cachedResponse) {
        return cachedResponse;
      }

      // 2. Если нет в кэше, пробуем загрузить из сети
      return fetch(event.request).catch(() => {
        // 3. Если даже сеть недоступна, показываем offline.html (только для навигации)
        //    Иначе для статических файлов оставляем поведение по умолчанию (ошибка).
        if (event.request.mode === "navigate") {
          return caches.match("/offline.html");
        }
      });
    })
  );
});
