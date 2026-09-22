/* The developer build updates CACHE_NAME when any offline application file changes. */
const CACHE_NAME = "medrecall-offline-31598ef9f182";
const CACHE_PREFIX = "medrecall-offline-";
const APP_FILES = [
  "./", "./index.html", "./styles.css", "./app.js", "./progress-store.js",
  "./question-bank.js", "./manifest.webmanifest",
  "./assets/medrecall-hero.png", "./assets/medrecall-logo.png",
  "./assets/icon-192.png", "./assets/icon-512.png", "./assets/apple-touch-icon.png",
  "./assets/fonts/dm-mono-400.woff2", "./assets/fonts/dm-mono-500.woff2",
  "./assets/fonts/manrope-400-800.woff2",
  "./assets/fonts/playfair-normal-600-700.woff2",
  "./assets/fonts/playfair-italic-600-700.woff2"
];

self.addEventListener("install", function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache) {
        return cache.addAll(APP_FILES.map(function(file) { return new Request(file, { cache: "reload" }); }));
      })
      .then(function() { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function(event) {
  event.waitUntil(
    caches.keys()
      .then(function(names) {
        return Promise.all(names.filter(function(name) {
          return (name.startsWith(CACHE_PREFIX) || name.startsWith("medrecall-v")) && name !== CACHE_NAME;
        }).map(function(name) { return caches.delete(name); }));
      })
      .then(function() { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function(event) {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.open(CACHE_NAME).then(function(cache) {
      if (request.mode === "navigate") {
        return cache.match("./index.html").then(function(response) {
          return response || fetch(request);
        });
      }
      return cache.match(request).then(function(response) {
        return response || fetch(request);
      });
    })
  );
});
