/* youtube.js — everything that talks to YouTube:
   - parsing IDs out of pasted links
   - fetching title/channel/thumbnail (CORS-safe, no API key required)
   - searching via the YouTube Data API (needs the parent's key)
   - the IFrame player used in the kid view, with safe end-of-video handling
*/
(function (global) {
  "use strict";

  var YT = {};

  /* Pull a video ID out of many YouTube URL shapes, or accept a bare 11-char ID. */
  YT.parseId = function (input) {
    if (!input) return null;
    input = input.trim();

    // Bare video id.
    if (isId(input)) return input;

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

    if (host === "youtube.com" || host === "m.youtube.com" ||
        host === "music.youtube.com" || host === "youtube-nocookie.com") {
      if (isId(url.searchParams.get("v"))) return url.searchParams.get("v");
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

  function placeholder(id) {
    return { id: id, title: "", channel: "", thumbnail: YT.thumbUrl(id), addedAt: 0 };
  }

  function decodeEntities(str) {
    if (!str) return "";
    var el = document.createElement("textarea");
    el.innerHTML = str;
    return el.value;
  }

  /* ---- metadata: title + channel + thumbnail for known video IDs ----
     YouTube's own oEmbed endpoint has no CORS headers, so we can't read it
     from the browser directly. We use CORS‑enabled providers instead, and
     always resolve to *something* (falling back to an editable placeholder)
     so a video is never lost. */

  // noembed.com — purpose-built, CORS + JSONP, no key.
  function viaNoembed(id) {
    var watch = "https://www.youtube.com/watch?v=" + id;
    return fetch("https://noembed.com/embed?url=" + encodeURIComponent(watch))
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || d.error || !d.title) throw new Error(d && d.error ? d.error : "no data");
        return {
          id: id,
          title: decodeEntities(d.title),
          channel: decodeEntities(d.author_name || ""),
          thumbnail: d.thumbnail_url || YT.thumbUrl(id),
          addedAt: 0
        };
      });
  }

  // allorigins.win in front of YouTube's oEmbed — backup provider.
  function viaAllOrigins(id) {
    var oembed = "https://www.youtube.com/oembed?format=json&url=" +
      encodeURIComponent("https://www.youtube.com/watch?v=" + id);
    return fetch("https://api.allorigins.win/raw?url=" + encodeURIComponent(oembed))
      .then(function (r) { if (!r.ok) throw new Error("http " + r.status); return r.json(); })
      .then(function (d) {
        if (!d || !d.title) throw new Error("no data");
        return {
          id: id,
          title: decodeEntities(d.title),
          channel: decodeEntities(d.author_name || ""),
          thumbnail: d.thumbnail_url || YT.thumbUrl(id),
          addedAt: 0
        };
      });
  }

  // Official Data API (batched, 50 ids/request, 1 quota unit) when a key is set.
  function viaDataApi(ids, apiKey) {
    var url = "https://www.googleapis.com/youtube/v3/videos?part=snippet&id=" +
      encodeURIComponent(ids.join(",")) + "&key=" + encodeURIComponent(apiKey);
    return fetch(url).then(function (res) {
      return res.json().then(function (body) {
        if (!res.ok) throw new Error(body && body.error && body.error.message || "API error");
        var map = {};
        (body.items || []).forEach(function (it) {
          var s = it.snippet || {};
          map[it.id] = {
            id: it.id,
            title: decodeEntities(s.title || ""),
            channel: decodeEntities(s.channelTitle || ""),
            thumbnail: (s.thumbnails && (s.thumbnails.medium || s.thumbnails.default) || {}).url || YT.thumbUrl(it.id),
            addedAt: 0
          };
        });
        return map;
      });
    });
  }

  function fetchOne(id) {
    return viaNoembed(id)
      .catch(function () { return viaAllOrigins(id); })
      .catch(function () { return placeholder(id); });
  }

  /* Run fn over items with at most `limit` in flight at once, preserving order.
     Keeps large no-key bulk-adds from hammering the metadata service. */
  function mapLimit(items, limit, fn) {
    return new Promise(function (resolve) {
      if (!items.length) return resolve([]);
      var results = new Array(items.length);
      var idx = 0, completed = 0;
      function launch() {
        while (idx < items.length && (idx - completed) < limit) {
          (function (i) {
            Promise.resolve(fn(items[i], i))
              .then(function (r) { results[i] = r; })
              .catch(function () { results[i] = null; })
              .then(function () {
                completed++;
                if (completed === items.length) resolve(results);
                else launch();
              });
          })(idx++);
        }
      }
      launch();
    });
  }

  /* Resolve metadata for many ids. onEach(meta) is called as each resolves,
     so the UI can report progress. Returns a Promise of all metas, in order. */
  YT.fetchMetaBatch = function (ids, apiKey, onEach) {
    onEach = onEach || function () {};

    // With a key: one batched Data API call per 50 ids (cheap + reliable).
    // Build a combined id→meta map; any id the API can't resolve (or if the
    // key is bad) falls through to the no-key providers below.
    var apiMapP = Promise.resolve({});
    if (apiKey) {
      var chunks = [];
      for (var i = 0; i < ids.length; i += 50) chunks.push(ids.slice(i, i + 50));
      apiMapP = Promise.all(chunks.map(function (c) {
        return viaDataApi(c, apiKey).catch(function () { return {}; });
      })).then(function (maps) {
        return maps.reduce(function (acc, m) { return Object.assign(acc, m); }, {});
      });
    }

    return apiMapP.then(function (apiMap) {
      return mapLimit(ids, 5, function (id) {
        var m = apiMap[id];
        if (m && m.title) { onEach(m); return m; }
        return fetchOne(id).then(function (meta) { onEach(meta); return meta; });
      });
    });
  };

  /* Search the YouTube Data API. Resolves to an array of result objects. */
  YT.search = function (query, apiKey) {
    if (!apiKey) return Promise.reject(new Error("No API key set."));
    var url = "https://www.googleapis.com/youtube/v3/search" +
      "?part=snippet&type=video&safeSearch=strict&maxResults=24" +
      "&q=" + encodeURIComponent(query) +
      "&key=" + encodeURIComponent(apiKey);
    return fetch(url)
      .then(function (res) {
        return res.json().then(function (body) {
          if (!res.ok) {
            throw new Error(body && body.error && body.error.message || "Search failed.");
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

  /* ---------------- IFrame player ---------------- */
  var apiReady = false;
  var apiLoading = false;
  var readyCallbacks = [];
  var player = null;
  var handlers = {};   // { onEnded, onError } for the currently playing video

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

  function onState(e) {
    // 0 === ended. Leave immediately so YouTube's end-screen of "related"
    // videos is never shown or tappable.
    if (e.data === global.YT.PlayerState.ENDED && handlers.onEnded) handlers.onEnded();
  }
  function onErr() {
    if (handlers.onError) handlers.onError();
  }

  /* Play a video into #yt-player. opts: { onEnded, onError }. */
  YT.play = function (videoId, opts) {
    handlers = opts || {};
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
          onReady: function (e) { e.target.playVideo(); },
          onStateChange: onState,
          onError: onErr
        }
      });
    });
  };

  YT.stop = function () {
    handlers = {};
    if (player && player.stopVideo) {
      try { player.stopVideo(); } catch (e) { /* ignore */ }
    }
  };

  YT.preload = function () { loadApi(); };

  global.KV = global.KV || {};
  global.KV.YT = YT;
})(window);
