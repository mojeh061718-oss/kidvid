/* app.js — boot everything and register the service worker. */
(function (global) {
  "use strict";

  /* Kiosk lock: stop pinch-zoom and desktop ctrl+wheel zoom so a child can't
     accidentally zoom or shift the layout. Double-tap zoom and the old 300ms
     tap delay are handled purely with CSS (touch-action: manipulation) so that
     normal taps and scrolling stay instant — we must NOT preventDefault on
     touchend, which was cancelling rapid taps and making the UI feel laggy. */
  function lockZoom() {
    ["gesturestart", "gesturechange", "gestureend"].forEach(function (ev) {
      document.addEventListener(ev, function (e) { e.preventDefault(); }, { passive: false });
    });
    document.addEventListener("touchmove", function (e) {
      if (e.touches && e.touches.length > 1) e.preventDefault();   // pinch (2+ fingers)
    }, { passive: false });
    document.addEventListener("wheel", function (e) {
      if (e.ctrlKey) e.preventDefault();                            // ctrl+wheel zoom
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
