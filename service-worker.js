const CACHE_NAME = "trackit-v1.9";
const assets = [
  "/", // Корневая страница
  "/index.html", // Главная страница
  "/styles.css", // Стили
  "/script.js", // Скрипты
  "/manifest.json", // Манифест PWA
  "/uno.html", // Страница UNO
  "/bura.html", // Страница Бура
  "/chests.html", // Страница Шахматы
  "/108.html", // Страница 108
  "/icons/icon-v1.9-192x192.png", // Иконка PWA
  "/icons/icon-v1.9-512x512.png", // Иконка PWA
];


// Установка и кэширование ресурсов
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(assets);
    })
  );
});

// Обработка запросов
self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
