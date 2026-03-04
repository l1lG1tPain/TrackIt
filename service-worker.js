// service-worker.js
const CACHE_VERSION = "v3.4";
const CACHE_NAME = `trackit-${CACHE_VERSION}`;

// GitHub Pages: https://l1lg1tpain.github.io/TrackIt/
// Все пути от корня домена
const ASSETS = [
  "/TrackIt/",
  "/TrackIt/index.html",
  "/TrackIt/styles.css",
  "/TrackIt/script.js",
  "/TrackIt/manifest.json",
  "/TrackIt/offline.html",
  "/TrackIt/uno.html",
  "/TrackIt/bura.html",
  "/TrackIt/chests.html",
  "/TrackIt/108.html",
  "/TrackIt/icons/icon-v3.0-192x192.png",
  "/TrackIt/icons/icon-v3.0-512x512.png"
];

// === INSTALL ===
// Кэшируем все ассеты. Если хоть один не загрузится — установка продолжается
// (используем addAll с fallback, чтобы не падать на необязательных файлах)
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Кэшируем обязательные файлы
      const required = [
        "/TrackIt/",
        "/TrackIt/index.html",
        "/TrackIt/styles.css",
        "/TrackIt/script.js",
        "/TrackIt/manifest.json",
      ];
      await cache.addAll(required);

      // Остальные — по возможности (не блокируем установку)
      const optional = ASSETS.filter(a => !required.includes(a));
      await Promise.allSettled(
        optional.map(url =>
          fetch(url).then(r => r.ok ? cache.put(url, r) : null).catch(() => null)
        )
      );

      // Сразу активируемся, не ждём закрытия старых вкладок
      return self.skipWaiting();
    })
  );
});

// === ACTIVATE ===
// Удаляем старые кэши trackit-*, захватываем все открытые вкладки
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) =>
        Promise.all(
          names
            .filter(n => n.startsWith("trackit-") && n !== CACHE_NAME)
            .map(n => caches.delete(n))
        )
      )
      .then(() => self.clients.claim())
  );
});

// === FETCH — Stale-While-Revalidate ===
// 1. Отдаём из кэша мгновенно (офлайн работает)
// 2. Параллельно фоново обновляем кэш из сети
// 3. При следующем запуске пользователь уже видит свежую версию
self.addEventListener("fetch", (event) => {
  // Только GET и только наш origin
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(event.request);

      // Фоновое обновление кэша
      const updateCache = fetch(event.request)
        .then((res) => {
          if (res && res.status === 200 && res.type !== "opaque") {
            cache.put(event.request, res.clone());
          }
          return res;
        })
        .catch(() => null);

      // Есть кэш → отдаём немедленно, сеть работает в фоне
      if (cached) {
        event.waitUntil(updateCache); // обновляем не блокируя ответ
        return cached;
      }

      // Кэша нет → ждём сеть
      const fresh = await updateCache;
      if (fresh) return fresh;

      // Офлайн + нет кэша → fallback
      if (event.request.mode === "navigate") {
        const offline = await cache.match("/TrackIt/offline.html");
        return offline || new Response("Нет соединения", { status: 503 });
      }
    })
  );
});

// === MESSAGE — ручной skipWaiting из UI ===
self.addEventListener("message", (event) => {
  if (event.data?.action === "skipWaiting") {
    self.skipWaiting();
  }
});