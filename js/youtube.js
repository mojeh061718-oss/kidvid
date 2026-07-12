/* youtube.js — everything that talks to YouTube:
   - parsing IDs out of pasted links
   - fetching title/thumbnail via oEmbed (no API key required)
   - searching via the YouTube Data API (needs the parent's key)
   - the IFrame player used in the kid view
*/
(function (global) {
  "use strict";

  var YT = {};

  /* Pull a video ID out of many YouTube URL shapes, or accept a bare 11-char ID. */
  YT.parseId = function (input) {
    if (!input) return null;
    input = input.trim();

    // Bare video id.
    if (/^[A-Za-z0-9_-]{11}$/.test(input)) return input;

    var url;
    try {
      url = new URL(input);
    } catch (e) {
      return null;
    }

    var host = url.hostname.replace(/^www\./, "");

    if (host === "youtu.be") {
      var seg = url.pathname.split("/").filter(Boolean)[0];
      return isId(seg) ? seg : null;
    }

    if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
      if (url.searchParams.get("v") && isId(url.searchParams.get("v"))) {
        return url.searchParams.get("v");
      }
      // /embed/ID, /shorts/ID, /live/ID, /v/ID
      var parts = url.pathname.split("/").filter(Boolean);
      var known = { embed: 1, shorts: 1, live: 1, v: 1 };
      if (parts.length >= 2 && known[parts[0]] && isId(parts[1])) {
        return parts[1];
      }
    }
    return null;
  };

  function isId(s) { return /^[A-Za-z0-9_-]{11}$/.test(s || ""); }

  YT.parseMany = function (text) {
    var ids = [];
    var seen = {};
    (text || "").split(/[\s,]+/).forEach(function (token) {
      var id = YT.parseId(token);
      if (id && !seen[id]) { seen[id] = 1; ids.push(id); }
    });
    return ids;
  };

  YT.thumbUrl = function (id) {
    return "https://i.ytimg.com/vi/" + id + "/hqdefault.jpg";
  };

  /* oEmbed gives us title + author (channel) with no API key and no quota. */
  YT.fetchMeta = function (id) {
    var watch = "https://www.youtube.com/watch?v=" + id;
    var endpoint = "https://www.youtube.com/oembed?format=json&url=" + encodeURIComponent(watch);
    return fetch(endpoint)
      .then(function (res) {
        if (!res.ok) throw new Error("Video not available (it may be private or removed).");
        return res.json();
      })
      .then(function (data) {
        return {
          id: id,
          title: data.title || "Untitled video",
          channel: data.author_name || "",
          thumbnail: YT.thumbUrl(id),
          addedAt: 0
        };
      });
  };

  /* Search the YouTube Data API. Resolves to an array of result objects. */
  YT.search = function (query, apiKey) {
    if (!apiKey) return Promise.reject(new Error("No API key set."));
    var url = "https://www.googleapis.com/youtube/v3/search" +
      "?part=snippet&type=video&safeSearch=strict&maxResults=20" +
      "&q=" + encodeURIComponent(query) +
      "&key=" + encodeURIComponent(apiKey);
    return fetch(url)
      .then(function (res) {
        return res.json().then(function (body) {
          if (!res.ok) {
            var msg = body && body.error && body.error.message ? body.error.message : "Search failed.";
            throw new Error(msg);
          }
          return body;
        });
      })
      .then(function (body) {
        return (body.items || [])
          .filter(function (it) { return it.id && it.id.videoId; })
          .map(function (it) {
            var s = it.snippet || {};
            return {
              id: it.id.videoId,
              title: decodeEntities(s.title || "Untitled video"),
              channel: decodeEntities(s.channelTitle || ""),
              thumbnail: (s.thumbnails && s.thumbnails.medium && s.thumbnails.medium.url) || YT.thumbUrl(it.id.videoId),
              addedAt: 0
            };
          });
      });
  };

  function decodeEntities(str) {
    var el = document.createElement("textarea");
    el.innerHTML = str;
    return el.value;
  }

  /* ---------------- IFrame player ---------------- */
  var apiReady = false;
  var apiLoading = false;
  var readyCallbacks = [];
  var player = null;

  function loadApi() {
    if (apiReady || apiLoading) return;
    apiLoading = true;
    var tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
  }

  global.onYouTubeIframeAPIReady = function () {
    apiReady = true;
    readyCallbacks.forEach(function (cb) { cb(); });
    readyCallbacks = [];
  };

  function whenReady(cb) {
    if (apiReady) cb();
    else { readyCallbacks.push(cb); loadApi(); }
  }

  /* Play a video into #yt-player. Creates the player once, then reuses it. */
  YT.play = function (videoId) {
    whenReady(function () {
      if (player) {
        player.loadVideoById(videoId);
        return;
      }
      player = new global.YT.Player("yt-player", {
        videoId: videoId,
        playerVars: {
          autoplay: 1,
          playsinline: 1,
          rel: 0,
          modestbranding: 1,
          fs: 1,
          iv_load_policy: 3   // hide video annotations
        },
        events: {
          onReady: function (e) { e.target.playVideo(); }
        }
      });
    });
  };

  YT.stop = function () {
    if (player && player.stopVideo) {
      try { player.stopVideo(); } catch (e) { /* ignore */ }
    }
  };

  YT.preload = function () { loadApi(); };

  global.KV = global.KV || {};
  global.KV.YT = YT;
})(window);
