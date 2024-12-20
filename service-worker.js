self.addEventListener("install", async (event) => {
  const manifest = await fetch("/manifest.json").then((response) => response.json());
  const CACHE_NAME = `trackit-v${manifest.version}`;

  const assets = [
    "/", 
    "/index.html",
    "/styles.css",
    "/script.js",
    "/manifest.json",
    "/uno.html",
    "/bura.html",
    "/chests.html",
    "/108.html",
    "/icons/icon-v1.9-192x192.png",
    "/icons/icon-v1.9-512x512.png",
  ];

  self.addEventListener("install", (event) => {
    event.waitUntil(
      caches.open(CACHE_NAME).then((cache) => {
        return cache.addAll(assets).catch((error) => {
          console.error("Ошибка при кэшировании ресурсов:", error);
        });
      })
    );
  });
  

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (!cache.startsWith("trackit-v")) {
            return caches.delete(cache);
          }
        })
      );
    })
  );
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return (
        response ||
        fetch(event.request).then((fetchedResponse) => {
          const clonedResponse = fetchedResponse.clone();

          // Если запрос относится к файлам в папке /icons/, кэшируем его
          if (event.request.url.includes("/icons/")) {
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, clonedResponse);
            });
          }

          return fetchedResponse;
        })
      );
    })
  );
});

