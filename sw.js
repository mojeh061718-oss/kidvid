/* sw.js — caches the app shell so KidVid opens instantly and works offline.
   (YouTube playback itself always needs a network connection.) */
var CACHE = "kidvid-shell-v1";
var SHELL = [
  "./",
  "./index.html",
  "./css/styles.css",
  "./js/store.js",
  "./js/youtube.js",
  "./js/ui.js",
  "./js/app.js",
  "./manifest.json",
  "./assets/icon.svg"
];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (cache) {
      return cache.addAll(SHELL);
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== CACHE) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;

  var url = new URL(req.url);
  // Only handle our own same-origin shell files. Everything else
  // (YouTube, thumbnails, API calls) goes straight to the network.
  if (url.origin !== location.origin) return;

  e.respondWith(
    caches.match(req).then(function (cached) {
      return cached || fetch(req).then(function (res) {
        return res;
      }).catch(function () {
        // Offline fallback for navigations: serve the app shell.
        if (req.mode === "navigate") return caches.match("./index.html");
      });
    })
  );
});
