/* store.js — data layer backed by localStorage.
   All app state lives under one key so backup/restore is a single blob. */
(function (global) {
  "use strict";

  var KEY = "kidvid.v1";

  var DEFAULTS = {
    videos: [],            // { id, title, channel, thumbnail, addedAt, blocked, category }
    categories: [],        // ordered list of category names (defines home-screen row order)
    blockedKeywords: [],   // lowercase strings
    recent: [],            // recently-watched video ids, newest first ("Keep Watching")
    settings: {
      pin: "6620",
      apiKey: "",
      childName: "",
      autoplayNext: false,
      openInApp: false     // tap a video -> open the real YouTube app (uses Premium) instead of the safe embed
    }
  };

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  var freshStart = false;

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) { freshStart = true; return clone(DEFAULTS); }
      var data = JSON.parse(raw);
      // Merge with defaults so new fields always exist.
      return {
        videos: Array.isArray(data.videos) ? data.videos : [],
        categories: Array.isArray(data.categories) ? data.categories : [],
        blockedKeywords: Array.isArray(data.blockedKeywords) ? data.blockedKeywords : [],
        recent: Array.isArray(data.recent) ? data.recent : [],
        settings: Object.assign(clone(DEFAULTS.settings), data.settings || {})
      };
    } catch (e) {
      console.error("Failed to load state, starting fresh:", e);
      freshStart = true;
      return clone(DEFAULTS);
    }
  }

  var state = load();

  /* Register a category name (preserving first-seen order). */
  function registerCategory(name) {
    name = (name || "").trim();
    if (name && state.categories.indexOf(name) === -1) state.categories.push(name);
    return name;
  }

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
    getCategories: function () { return state.categories.slice(); },
    getSettings: function () { return Object.assign({}, state.settings); },
    isFresh: function () { return freshStart; },

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

    /* Videos grouped into home-screen rows: one group per non-empty category
       (in category order), with any uncategorized videos as a final group. */
    getVisibleByCategory: function () {
      var visible = Store.getVisibleVideos();
      var groups = {};
      var uncategorized = [];
      visible.forEach(function (v) {
        var c = v.category || "";
        if (!c) { uncategorized.push(v); return; }
        (groups[c] = groups[c] || []).push(v);
      });
      // Emit known categories in order, then any stragglers, then uncategorized.
      var order = state.categories.slice();
      Object.keys(groups).forEach(function (c) {
        if (order.indexOf(c) === -1) order.push(c);
      });
      var rows = order.filter(function (c) { return groups[c] && groups[c].length; })
        .map(function (c) { return { name: c, videos: groups[c] }; });
      if (uncategorized.length) rows.push({ name: "", videos: uncategorized });
      return rows;
    },

    /* ---- video mutations ---- */
    addVideo: function (video) {
      if (!video || !video.id) return false;
      if (Store.hasVideo(video.id)) return false;
      var cat = registerCategory(video.category);
      state.videos.unshift({
        id: video.id,
        title: video.title || "",   // empty is allowed; the UI flags it as "needs a title"
        channel: video.channel || "",
        thumbnail: video.thumbnail || "",
        addedAt: video.addedAt || 0,
        blocked: false,
        category: cat
      });
      persist();
      return true;
    },

    addCategory: function (name) { registerCategory(name); persist(); },

    setVideoCategory: function (id, name) {
      var v = state.videos.find(function (x) { return x.id === id; });
      if (!v) return;
      v.category = registerCategory(name);
      persist();
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
      if (typeof patch.category === "string") v.category = registerCategory(patch.category);
      persist();
    },

    /* ---- recently watched ("Keep Watching") ---- */
    markWatched: function (id) {
      if (!id) return;
      state.recent = [id].concat(state.recent.filter(function (x) { return x !== id; })).slice(0, 12);
      persist();
    },

    /* Recently-watched videos that are still visible (blocked / keyword-hidden
       ones are filtered out so they never resurface in the shortcut). */
    getRecent: function () {
      var vis = Store.getVisibleVideos();
      return state.recent.map(function (id) {
        return vis.find(function (v) { return v.id === id; });
      }).filter(Boolean);
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
        categories: Array.isArray(data.categories) ? data.categories : [],
        blockedKeywords: Array.isArray(data.blockedKeywords) ? data.blockedKeywords : [],
        recent: Array.isArray(data.recent) ? data.recent : [],
        settings: Object.assign(clone(DEFAULTS.settings), data.settings || {})
      };
      persist();
    },

    /* Merge a starter pack ({ categories, videos }) without clobbering anything
       the parent already added. Returns the number of new videos added. */
    seedStarter: function (data) {
      if (!data) return 0;
      (data.categories || []).forEach(registerCategory);
      var added = 0;
      // addVideo() prepends, so add in reverse to keep each category's videos
      // in the order they're listed in the starter file.
      (data.videos || []).slice().reverse().forEach(function (v) {
        if (Store.addVideo(v)) added++;
      });
      // addVideo already persisted; ensure categories with no video yet persist too.
      persist();
      return added;
    },

    clearAll: function () {
      state = clone(DEFAULTS);
      persist();
    }
  };

  global.KV = global.KV || {};
  global.KV.Store = Store;
})(window);
