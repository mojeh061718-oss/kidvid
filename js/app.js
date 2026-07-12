/* app.js — boot everything and register the service worker. */
(function (global) {
  "use strict";

  function start() {
    var KV = global.KV;
    KV.UI.init(KV.Store, KV.YT);

    // Register the service worker for offline shell + home-screen install.
    // Only works over http(s); harmless to skip on file://.
    if ("serviceWorker" in navigator && location.protocol.indexOf("http") === 0) {
      navigator.serviceWorker.register("sw.js").catch(function (e) {
        console.warn("Service worker registration failed:", e);
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})(window);
