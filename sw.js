/* sw.js — caches the app shell so MaeTube opens instantly and works offline.
   Uses stale-while-revalidate: serve the cached copy immediately, then refresh
   it in the background so code updates reach installed devices on the next open.
   (YouTube playback itself always needs a network connection.) */
var CACHE = "maetube-shell-v11";
var SHELL = [
  "./",
  "./index.html",
  "./css/styles.css",
  "./js/store.js",
  "./js/youtube.js",
  "./js/ui.js",
  "./js/app.js",
  "./manifest.json",
  "./assets/icon.svg",
  "./data/starter-library.json"
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
    caches.open(CACHE).then(function (cache) {
      return cache.match(req).then(function (cached) {
        var network = fetch(req).then(function (res) {
          if (res && res.status === 200 && res.type === "basic") {
            cache.put(req, res.clone());
          }
          return res;
        }).catch(function () {
          // Offline: fall back to cache, then to the app shell for navigations.
          return cached || (req.mode === "navigate" ? cache.match("./index.html") : undefined);
        });
        return cached || network;
      });
    })
  );
});
