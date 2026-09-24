/* The developer build updates CACHE_NAME when any offline application file changes. */
importScripts("./releases.js");
const CACHE_NAME = "medrecall-offline-6c706d5eaf8b";
const CACHE_PREFIX = "medrecall-offline-";
const RELEASE_CACHE = CACHE_NAME + "-" + MedRecallRelease.version;
const APP_FILES = [
  "./", "./index.html", "./styles.css", "./app.js", "./progress-store.js",
  "./question-bank.js", "./exam-bank.js", "./manifest.webmanifest", "./ux.js", "./releases.js", "./i18n.js",
  "./assets/study-doctor-male.jpg", "./assets/medrecall-logo.png",
  "./assets/icon-192.png", "./assets/icon-512.png", "./assets/apple-touch-icon.png",
  "./assets/fonts/dm-mono-400.woff2", "./assets/fonts/dm-mono-500.woff2",
  "./assets/fonts/manrope-400-800.woff2",
  "./assets/fonts/playfair-normal-600-700.woff2",
  "./assets/fonts/playfair-italic-600-700.woff2"
];
// BEGIN EXAM_ASSETS — refreshed by scripts/build-offline-cache.js
const EXAM_FILES = [
  "./assets/past-mock-exams/batch-001/q001.webp",
  "./assets/past-mock-exams/batch-001/q005.webp",
  "./assets/past-mock-exams/batch-001/q015.webp",
  "./assets/past-mock-exams/batch-001/q028.webp",
  "./assets/past-mock-exams/batch-001/q032.webp",
  "./assets/past-mock-exams/batch-001/q035.webp",
  "./assets/past-mock-exams/batch-001/q041.webp",
  "./assets/past-mock-exams/batch-001/q045.webp",
  "./assets/past-mock-exams/batch-001/q047.webp",
  "./assets/past-mock-exams/batch-001/q050.webp",
  "./assets/past-mock-exams/batch-001/q052.webp",
  "./assets/past-mock-exams/prototype/q009.webp",
  "./assets/past-mock-exams/prototype/q010.webp",
  "./assets/past-mock-exams/prototype/q011.webp",
  "./assets/past-mock-exams/prototype/q012.webp",
  "./assets/past-mock-exams/prototype/q018.webp",
  "./assets/past-mock-exams/prototype/q019.webp",
  "./assets/past-mock-exams/prototype/q020.webp",
  "./assets/past-mock-exams/prototype/q021.webp"
];
// END EXAM_ASSETS
const REQUIRED_FILES = APP_FILES.concat(EXAM_FILES);

self.addEventListener("install", function(event) {
  event.waitUntil(
    caches.open(RELEASE_CACHE)
      .then(function(cache) {
        return cache.addAll(REQUIRED_FILES.map(function(file) { return new Request(file, { cache: "reload" }); }));
      })
      .then(function() { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function(event) {
  event.waitUntil(
    caches.keys()
      .then(function(names) {
        return Promise.all(names.filter(function(name) {
          return (name.startsWith(CACHE_PREFIX) || name.startsWith("medrecall-v")) && name !== RELEASE_CACHE;
        }).map(function(name) { return caches.delete(name); }));
      })
      .then(function() { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function(event) {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.open(RELEASE_CACHE).then(function(cache) {
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

// Confirm the complete current offline bundle, not just worker registration.
self.addEventListener("message", function(event) {
  if (!event.data || event.data.type !== "CHECK_OFFLINE" || !event.ports[0]) return;
  event.waitUntil(caches.open(RELEASE_CACHE).then(async function(cache) {
    const responses = await Promise.all(REQUIRED_FILES.map(function(file) { return cache.match(file); }));
    event.ports[0].postMessage({ offlineReady: responses.every(function(response) { return response && response.ok; }) });
  }).catch(function() { event.ports[0].postMessage({ offlineReady: false }); }));
});
