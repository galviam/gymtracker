const CACHE_NAME = "gymtracker-v32";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/styles.css",
  "./js/db.js",
  "./js/charts.js",
  "./js/app.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k)))) // borra TODO lo anterior, no solo lo que no coincide
      .then(() => self.clients.claim())
  );
});

// HTML, CSS y JS: siempre red primero (si hay conexión, coge la versión nueva
// sí o sí; solo usa la copia guardada si no hay conexión). Evita quedarnos
// atrapados en una versión vieja como ha pasado hasta ahora.
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});