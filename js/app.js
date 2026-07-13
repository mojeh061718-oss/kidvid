/* app.js — boot everything and register the service worker. */
(function (global) {
  "use strict";

  /* Kiosk lock: stop pinch-zoom, double-tap zoom, and desktop ctrl+wheel zoom
     so a child can't accidentally zoom or shift the layout. Normal one-finger
     scrolling inside the timeline still works. */
  function lockZoom() {
    ["gesturestart", "gesturechange", "gestureend"].forEach(function (ev) {
      document.addEventListener(ev, function (e) { e.preventDefault(); }, { passive: false });
    });
    document.addEventListener("touchmove", function (e) {
      if (e.touches && e.touches.length > 1) e.preventDefault();   // pinch
    }, { passive: false });
    document.addEventListener("wheel", function (e) {
      if (e.ctrlKey) e.preventDefault();                            // ctrl+wheel zoom
    }, { passive: false });
    // Block the second tap of a double-tap (iOS double-tap-to-zoom).
    var lastTouch = 0;
    document.addEventListener("touchend", function (e) {
      var now = Date.now();
      if (now - lastTouch <= 300) e.preventDefault();
      lastTouch = now;
    }, { passive: false });
  }

  function start() {
    var KV = global.KV;
    lockZoom();
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
