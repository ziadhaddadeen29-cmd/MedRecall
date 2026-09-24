/* The developer build updates CACHE_NAME when any offline application file changes. */
importScripts("./releases.js");
const CACHE_NAME = "medrecall-offline-255bd8f4e8b9680c";
const CACHE_PREFIX = "medrecall-offline-";
const SCOPE_PATH = new URL(self.registration.scope).pathname;
const SCOPE_SUFFIX = "-" + encodeURIComponent(SCOPE_PATH);
const RELEASE_CACHE = CACHE_NAME + "-" + MedRecallRelease.version + SCOPE_SUFFIX;
const APP_FILES = [
  "./",
  "./app.js",
  "./assets/apple-touch-icon.png",
  "./assets/fonts/dm-mono-400.woff2",
  "./assets/fonts/dm-mono-500.woff2",
  "./assets/fonts/manrope-400-800.woff2",
  "./assets/fonts/playfair-italic-600-700.woff2",
  "./assets/fonts/playfair-normal-600-700.woff2",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
  "./assets/medrecall-logo.png",
  "./assets/study-doctor-male.jpg",
  "./assets/study-doctor-mobile.jpg",
  "./exam-bank.js",
  "./i18n.js",
  "./index.html",
  "./manifest.webmanifest",
  "./progress-store.js",
  "./question-bank.js",
  "./releases.js",
  "./styles.css",
  "./ux.js"
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
        return cache.addAll(REQUIRED_FILES.map(function(file) { return new Request(file, { cache: "no-store" }); }));
      })
      .then(function() { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function(event) {
  event.waitUntil(
    caches.keys()
      .then(function(names) {
        return Promise.all(names.map(async function(name) {
          if (name === RELEASE_CACHE || !(name.startsWith(CACHE_PREFIX) || name.startsWith("medrecall-v"))) return;
          // Cache Storage is shared by the origin. Leave other GitHub Pages apps alone.
          const cache = await caches.open(name);
          if (name.endsWith(SCOPE_SUFFIX) || await cache.match(new URL("./index.html", self.registration.scope).href)) return caches.delete(name);
        }));
      })
      .then(function() { return self.clients.claim(); })
  );
});

const RUNTIME_PATHS = new Set(REQUIRED_FILES.map(file => new URL(file, self.registration.scope).pathname));
const INDEX_URL = new URL("./index.html", self.registration.scope).href;

self.addEventListener("fetch", function(event) {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || !RUNTIME_PATHS.has(url.pathname)) return;
  const key = request.mode === "navigate" ? INDEX_URL : url.origin + url.pathname;
  const cachePromise = caches.open(RELEASE_CACHE);
  // Bypass the HTTP cache too: a fresh worker must not recache Safari's old assets.
  const network = fetch(new Request(request, { cache: "no-store" })).then(async function(response) {
    const isHTML = key === INDEX_URL || key === self.registration.scope;
    if (!response.ok || (!isHTML && (response.headers.get("content-type") || "").includes("text/html")) ||
        !response.url.startsWith(self.registration.scope)) throw new Error("Runtime resource unavailable");
    const cache = await cachePromise;
    await cache.put(key, response.clone());
    return response;
  });
  event.waitUntil(network.catch(function() {}));
  event.respondWith((async function() {
    const cached = await (await cachePromise).match(key);
    if (!cached) return network;
    let timeout;
    try {
      // A weak/offline mobile connection must not hold the app behind a long timeout.
      return await Promise.race([network, new Promise(resolve => { timeout = setTimeout(() => resolve(cached), 3000); })]);
    } catch (_) { return cached; }
    finally { clearTimeout(timeout); }
  })());
});

// Confirm the complete current offline bundle, not just worker registration.
self.addEventListener("message", function(event) {
  if (event.data && event.data.type === "GET_BUILD" && event.ports[0]) {
    event.ports[0].postMessage({ build: CACHE_NAME });
    return;
  }
  if (!event.data || event.data.type !== "CHECK_OFFLINE" || !event.ports[0]) return;
  event.waitUntil(caches.open(RELEASE_CACHE).then(async function(cache) {
    const responses = await Promise.all(REQUIRED_FILES.map(function(file) { return cache.match(file); }));
    event.ports[0].postMessage({ offlineReady: responses.every(function(response) { return response && response.ok; }) });
  }).catch(function() { event.ports[0].postMessage({ offlineReady: false }); }));
});
