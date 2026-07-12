/* store.js — data layer backed by localStorage.
   All app state lives under one key so backup/restore is a single blob. */
(function (global) {
  "use strict";

  var KEY = "kidvid.v1";

  var DEFAULTS = {
    videos: [],            // { id, title, channel, thumbnail, addedAt, blocked }
    blockedKeywords: [],   // lowercase strings
    settings: {
      pin: "1234",
      apiKey: "",
      childName: "",
      autoplayNext: false
    }
  };

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return clone(DEFAULTS);
      var data = JSON.parse(raw);
      // Merge with defaults so new fields always exist.
      return {
        videos: Array.isArray(data.videos) ? data.videos : [],
        blockedKeywords: Array.isArray(data.blockedKeywords) ? data.blockedKeywords : [],
        settings: Object.assign(clone(DEFAULTS.settings), data.settings || {})
      };
    } catch (e) {
      console.error("Failed to load state, starting fresh:", e);
      return clone(DEFAULTS);
    }
  }

  var state = load();

  function persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      console.error("Failed to save state:", e);
      alert("Could not save — the tablet's storage may be full.");
    }
  }

  var Store = {
    /* ---- reads ---- */
    getState: function () { return state; },
    getVideos: function () { return state.videos.slice(); },
    getKeywords: function () { return state.blockedKeywords.slice(); },
    getSettings: function () { return Object.assign({}, state.settings); },

    hasVideo: function (id) {
      return state.videos.some(function (v) { return v.id === id; });
    },

    /* Videos visible in the kid timeline: not manually blocked and not
       matching any blocked keyword (checked against title + channel). */
    getVisibleVideos: function () {
      var words = state.blockedKeywords;
      return state.videos.filter(function (v) {
        if (v.blocked) return false;
        return !Store.matchesKeyword(v, words);
      });
    },

    matchesKeyword: function (video, words) {
      words = words || state.blockedKeywords;
      if (!words.length) return false;
      var hay = ((video.title || "") + " " + (video.channel || "")).toLowerCase();
      for (var i = 0; i < words.length; i++) {
        if (hay.indexOf(words[i]) !== -1) return true;
      }
      return false;
    },

    /* ---- video mutations ---- */
    addVideo: function (video) {
      if (!video || !video.id) return false;
      if (Store.hasVideo(video.id)) return false;
      state.videos.unshift({
        id: video.id,
        title: video.title || "",   // empty is allowed; the UI flags it as "needs a title"
        channel: video.channel || "",
        thumbnail: video.thumbnail || "",
        addedAt: video.addedAt || 0,
        blocked: false
      });
      persist();
      return true;
    },

    setBlocked: function (id, blocked) {
      var v = state.videos.find(function (x) { return x.id === id; });
      if (v) { v.blocked = !!blocked; persist(); }
    },

    updateVideo: function (id, patch) {
      var v = state.videos.find(function (x) { return x.id === id; });
      if (!v) return;
      if (typeof patch.title === "string") v.title = patch.title.trim() || v.title;
      if (typeof patch.channel === "string") v.channel = patch.channel.trim();
      persist();
    },

    /* The next visible video after `id` in the kid timeline (for autoplay-next). */
    nextVisibleAfter: function (id) {
      var vis = Store.getVisibleVideos();
      var i = vis.findIndex(function (v) { return v.id === id; });
      if (i === -1 || vis.length < 2) return null;
      return vis[(i + 1) % vis.length];
    },

    removeVideo: function (id) {
      state.videos = state.videos.filter(function (v) { return v.id !== id; });
      persist();
    },

    /* ---- keyword mutations ---- */
    addKeyword: function (word) {
      word = (word || "").trim().toLowerCase();
      if (!word) return false;
      if (state.blockedKeywords.indexOf(word) !== -1) return false;
      state.blockedKeywords.push(word);
      persist();
      return true;
    },

    removeKeyword: function (word) {
      state.blockedKeywords = state.blockedKeywords.filter(function (w) { return w !== word; });
      persist();
    },

    /* ---- settings ---- */
    updateSettings: function (patch) {
      Object.assign(state.settings, patch);
      persist();
    },

    /* ---- backup / restore ---- */
    exportJSON: function () {
      return JSON.stringify(state, null, 2);
    },

    importJSON: function (json) {
      var data = JSON.parse(json);
      if (!data || typeof data !== "object") throw new Error("Invalid file");
      state = {
        videos: Array.isArray(data.videos) ? data.videos : [],
        blockedKeywords: Array.isArray(data.blockedKeywords) ? data.blockedKeywords : [],
        settings: Object.assign(clone(DEFAULTS.settings), data.settings || {})
      };
      persist();
    },

    clearAll: function () {
      state = clone(DEFAULTS);
      persist();
    }
  };

  global.KV = global.KV || {};
  global.KV.Store = Store;
})(window);
