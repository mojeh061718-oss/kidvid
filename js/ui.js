/* ui.js — rendering and event wiring for every screen. */
(function (global) {
  "use strict";

  var Store, YT;
  var els = {};

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return (s || "").replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function toast(msg) {
    var t = els.toast;
    t.textContent = msg;
    t.classList.remove("hidden");
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.classList.add("hidden"); }, 2200);
  }

  /* ===================== KID HOME (big show tiles) ===================== */
  // A non-reader recognizes shows by picture + colour + emoji, not by name.
  var SHOW_THEME = {
    "Bluey": { emoji: "🐶", color: "#3AA0FF" },
    "Max & Ruby": { emoji: "🐰", color: "#FF5C8A" },
    "Princess Sofia": { emoji: "👑", color: "#C74AE0" },
    "Paw Patrol": { emoji: "🐾", color: "#FF4D4D" },
    "Calm & Cozy": { emoji: "🌙", color: "#4C63D2" },
    "Gentle & Curious": { emoji: "🌱", color: "#2FBF71" },
    "Dance Party": { emoji: "🎉", color: "#FF9F1C" }
  };
  var FALLBACK_THEME = [
    { emoji: "⭐", color: "#5B2BE0" }, { emoji: "🎈", color: "#FF6B6B" },
    { emoji: "🌈", color: "#12B5CB" }, { emoji: "🍿", color: "#E8590C" }
  ];
  var KEEP_THEME = { emoji: "▶", color: "#ff0033" };

  function themeFor(row, i) {
    if (row && row.keep) return KEEP_THEME;
    var name = row && row.name;
    return SHOW_THEME[name] || FALLBACK_THEME[i % FALLBACK_THEME.length];
  }
  function rowLabel(row) {
    return row.keep ? "Keep Watching" : (row.name || "More videos");
  }

  function cardHTML(v) {
    return (
      '<button class="card" data-id="' + esc(v.id) + '">' +
        '<span class="card-thumb">' +
          '<img src="' + esc(v.thumbnail || YT.thumbUrl(v.id)) + '" alt="" loading="lazy" decoding="async" ' +
            'onerror="this.onerror=null;this.src=\'' + esc(YT.thumbUrl(v.id)) + '\'" />' +
        '</span>' +
        '<span class="card-title">' + esc(v.title || "Video") + '</span>' +
      '</button>'
    );
  }

  /* Netflix-style: a vertical page of category rows, each a horizontal strip of
     video cards. "Keep Watching" (recent) shows first when it has anything. */
  function renderHome() {
    var rows = Store.getVisibleByCategory();
    var recent = Store.getRecent();
    var allRows = recent.length ? [{ keep: true, videos: recent }].concat(rows) : rows;

    var settings = Store.getSettings();
    els.brandName.innerHTML = settings.childName
      ? esc(settings.childName) + "&#39;s Videos"
      : 'Mae<span class="tube">Tube</span>';

    var total = rows.reduce(function (n, r) { return n + r.videos.length; }, 0);
    if (!total) {
      els.timeline.innerHTML = "";
      els.emptyState.classList.remove("hidden");
      return;
    }
    els.emptyState.classList.add("hidden");

    els.timeline.innerHTML = allRows.map(function (row, i) {
      var t = themeFor(row, i);
      return (
        '<section class="cat-section">' +
          '<h2 class="cat-title">' +
            '<span class="cat-emoji" style="background:' + t.color + '">' + t.emoji + "</span>" +
            '<span class="cat-name">' + esc(rowLabel(row)) + "</span>" +
            '<span class="cat-count">' + row.videos.length + "</span>" +
          "</h2>" +
          '<div class="row-scroll">' + row.videos.map(cardHTML).join("") + "</div>" +
        "</section>"
      );
    }).join("");
  }

  /* Play a video: either the safe in-app embed, or (parent opt-in) the real
     YouTube app, which honours Premium but leaves MaeTube's sandbox. */
  function playVideo(v) {
    if (Store.getSettings().openInApp) {
      Store.markWatched(v.id);
      window.location.href = "https://www.youtube.com/watch?v=" + encodeURIComponent(v.id);
    } else {
      openPlayer(v);   // openPlayer records the watch (covers autoplay-next too)
    }
  }

  /* ===================== PLAYER ===================== */
  function openPlayer(video) {
    Store.markWatched(video.id);
    els.playerTitle.textContent = video.title || "Video";
    els.playerOverlay.classList.remove("hidden");
    lockScroll(true);
    YT.play(video.id, {
      // On end: never let YouTube's related-video end screen linger. Either
      // advance to the next approved video, or return to the grid.
      onEnded: function () {
        if (Store.getSettings().autoplayNext) {
          var next = Store.nextVisibleAfter(video.id);
          if (next) { openPlayer(next); return; }
        }
        closePlayer();
      },
      onError: function () {
        closePlayer();
        toast("That video couldn't be played");
      }
    });
  }

  function closePlayer() {
    YT.stop();
    els.playerOverlay.classList.add("hidden");
    lockScroll(false);
    // Refresh so the "Keep Watching" row reflects what was just played, keeping
    // the child's place in the page.
    var y = els.timeline.scrollTop;
    renderHome();
    els.timeline.scrollTop = y;
  }

  function lockScroll(on) {
    document.body.style.overflow = on ? "hidden" : "";
  }

  /* ===================== PIN GATE ===================== */
  var pinBuffer = "";

  function openPinGate() {
    pinBuffer = "";
    updatePinDots();
    els.pinError.classList.add("hidden");
    els.pinGate.classList.remove("hidden");
  }
  function closePinGate() {
    els.pinGate.classList.add("hidden");
    pinBuffer = "";
  }
  function updatePinDots() {
    var dots = els.pinDots.children;
    for (var i = 0; i < dots.length; i++) {
      dots[i].classList.toggle("filled", i < pinBuffer.length);
    }
  }
  function pinKey(key) {
    if (key === "cancel") { closePinGate(); return; }
    if (key === "back") { pinBuffer = pinBuffer.slice(0, -1); updatePinDots(); return; }
    if (pinBuffer.length >= 4) return;
    pinBuffer += key;
    updatePinDots();
    if (pinBuffer.length === 4) {
      var pin = Store.getSettings().pin || "1234";
      if (pinBuffer === pin) {
        closePinGate();
        openParentMenu();
      } else {
        els.pinError.classList.remove("hidden");
        els.pinDots.parentElement.animate(
          [{ transform: "translateX(0)" }, { transform: "translateX(-8px)" },
           { transform: "translateX(8px)" }, { transform: "translateX(0)" }],
          { duration: 250 }
        );
        pinBuffer = "";
        updatePinDots();
      }
    }
  }

  /* ===================== PARENT MENU ===================== */
  function openParentMenu() {
    els.parentMenu.classList.remove("hidden");
    lockScroll(true);
    switchTab("add");
    loadSettingsIntoForm();
    refreshParent();
  }
  function closeParentMenu() {
    els.parentMenu.classList.add("hidden");
    lockScroll(false);
    renderHome();
  }

  function switchTab(name) {
    var tabs = els.parentMenu.querySelectorAll(".tab");
    var panels = els.parentMenu.querySelectorAll(".tab-panel");
    tabs.forEach(function (t) { t.classList.toggle("active", t.dataset.tab === name); });
    panels.forEach(function (p) { p.classList.toggle("active", p.dataset.panel === name); });
    if (name === "manage") renderManageList();
    if (name === "keywords") renderKeywords();
  }

  function refreshParent() {
    renderManageList();
    renderKeywords();
    updateSearchAvailability();
    populateCategoryOptions();
  }

  function loadSettingsIntoForm() {
    var s = Store.getSettings();
    els.childName.value = s.childName || "";
    els.apiKey.value = s.apiKey || "";
    els.autoplayNext.checked = !!s.autoplayNext;
    els.openInApp.checked = !!s.openInApp;
    els.pinInput.value = "";
  }

  /* ---- Add tab ---- */
  function bulkAdd() {
    var ids = YT.parseMany(els.bulkInput.value);
    if (!ids.length) {
      setAddStatus("No valid YouTube links found.", "err");
      return;
    }
    var newIds = ids.filter(function (id) { return !Store.hasVideo(id); });
    var dupes = ids.length - newIds.length;
    if (!newIds.length) {
      setAddStatus("All " + ids.length + " video(s) are already in your library.", "err");
      return;
    }

    var category = els.addCategory.value.trim();
    els.bulkAdd.disabled = true;
    var apiKey = Store.getSettings().apiKey;

    var added = 0, noTitle = 0, done = 0;
    setAddStatus("Fetching 0 of " + newIds.length + "…", "");

    YT.fetchMetaBatch(newIds, apiKey, function (meta) {
      // Called as each video's metadata resolves.
      meta.category = category;
      if (Store.addVideo(meta)) {
        added++;
        if (!meta.title) noTitle++;
      }
      done++;
      setAddStatus("Fetching " + done + " of " + newIds.length + "…", "");
      renderManageList();
    }).then(function () {
      finishBulk(added, noTitle, dupes);
    }).catch(function () {
      finishBulk(added, noTitle, dupes);
    });
  }

  function finishBulk(added, noTitle, dupes) {
    els.bulkAdd.disabled = false;
    els.bulkInput.value = "";
    var msg = "Added " + added + " video(s).";
    if (noTitle) msg += " " + noTitle + " need a title — add one in Videos.";
    if (dupes) msg += " " + dupes + " were already added.";
    setAddStatus(msg, noTitle ? "" : "ok");
    populateCategoryOptions();
    renderManageList();
  }

  function setAddStatus(msg, cls) {
    els.addStatus.innerHTML = msg ? '<span class="' + cls + '">' + esc(msg) + "</span>" : "";
  }

  function populateCategoryOptions() {
    els.categoryOptions.innerHTML = Store.getCategories().map(function (c) {
      return '<option value="' + esc(c) + '"></option>';
    }).join("");
  }

  /* Load the bundled starter library (data/starter-library.json). */
  function loadStarter(opts) {
    opts = opts || {};
    if (opts.button) opts.button.disabled = true;
    if (!opts.silent) setSeed("Loading starter videos…", "");
    return fetch("data/starter-library.json", { cache: "no-store" })
      .then(function (r) { if (!r.ok) throw new Error("http " + r.status); return r.json(); })
      .then(function (data) {
        var added = Store.seedStarter(data);
        populateCategoryOptions();
        renderHome();
        renderManageList();
        if (!opts.silent) {
          setSeed(added ? "Added " + added + " starter video(s)." : "Starter videos are already in your library.", "ok");
        }
        if (added && !opts.silent) toast("Loaded " + added + " videos");
      })
      .catch(function () {
        if (!opts.silent) setSeed("Couldn't load the starter pack — you need internet the first time.", "err");
      })
      .then(function () { if (opts.button) opts.button.disabled = false; });
  }

  function setSeed(msg, cls) {
    els.seedStatus.innerHTML = msg ? '<span class="' + cls + '">' + esc(msg) + "</span>" : "";
  }

  /* Replace the whole library with the newest starter pack (keeps PIN, blocked
     words, settings). Used to push a library update to an existing install. */
  function resetToStarter() {
    if (!confirm("Replace ALL videos with the latest MaeTube starter library?\n\nYour PIN, blocked words, and settings are kept — but any videos you added yourself will be removed.")) return;
    Store.resetLibrary();
    loadStarter({ button: els.resetBtn });
  }

  function updateSearchAvailability() {
    var hasKey = !!Store.getSettings().apiKey;
    els.searchBox.classList.toggle("hidden", !hasKey);
    els.searchHint.classList.toggle("hidden", hasKey);
  }

  function doSearch() {
    var q = els.searchInput.value.trim();
    if (!q) return;
    var key = Store.getSettings().apiKey;
    els.searchResults.innerHTML = '<p class="muted">Searching…</p>';
    YT.search(q, key).then(function (results) {
      if (!results.length) {
        els.searchResults.innerHTML = '<p class="muted">No results.</p>';
        return;
      }
      els.searchResults.innerHTML = results.map(function (r) {
        var already = Store.hasVideo(r.id);
        return (
          '<div class="result-row" data-id="' + esc(r.id) + '">' +
            '<img src="' + esc(r.thumbnail) + '" alt="" loading="lazy" />' +
            '<div class="result-info">' +
              '<div class="r-title">' + esc(r.title) + "</div>" +
              '<div class="r-channel">' + esc(r.channel) + "</div>" +
            "</div>" +
            '<div class="row-actions">' +
              '<button class="btn add-result"' + (already ? " disabled" : "") + '>' +
                (already ? "Added" : "Add") +
              "</button>" +
            "</div>" +
          "</div>"
        );
      }).join("");
      // Stash results so the click handler can read full metadata.
      els.searchResults._results = results;
    }).catch(function (err) {
      els.searchResults.innerHTML = '<p class="muted">' + esc(err.message || "Search failed.") + "</p>";
    });
  }

  /* ---- Manage tab ---- */
  var editingId = null;   // id of the video currently in inline-edit mode

  function renderManageList() {
    var all = Store.getVideos();
    var showBlocked = els.showBlocked.checked;
    var keywords = Store.getKeywords();
    var q = (els.manageSearch.value || "").trim().toLowerCase();

    var list = all.filter(function (v) {
      if (!showBlocked && v.blocked) return false;
      if (q) {
        var hay = ((v.title || "") + " " + (v.channel || "")).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });

    els.manageCount.textContent = all.length + " video(s) total" +
      (q || !showBlocked ? " — showing " + list.length : "");

    if (!all.length) {
      els.manageList.innerHTML = '<p class="empty-list">No videos here yet. Add some from the Add tab.</p>';
      return;
    }
    if (!list.length) {
      els.manageList.innerHTML = '<p class="empty-list">No videos match your filter.</p>';
      return;
    }

    els.manageList.innerHTML = list.map(function (v) {
      if (v.id === editingId) return editorRow(v);
      var kw = Store.matchesKeyword(v, keywords);
      var badges = "";
      if (v.blocked) badges += '<span class="badge blocked-badge">Blocked</span> ';
      if (!v.title) badges += '<span class="badge warn-badge">Needs a title</span> ';
      if (kw) badges += '<span class="badge keyword-badge">Hidden by word</span>';
      return (
        '<div class="manage-row' + (v.blocked ? " is-blocked" : "") + '" data-id="' + esc(v.id) + '">' +
          '<img src="' + esc(v.thumbnail || YT.thumbUrl(v.id)) + '" alt="" loading="lazy" ' +
            'onerror="this.onerror=null;this.src=\'' + esc(YT.thumbUrl(v.id)) + '\'" />' +
          '<div class="manage-info">' +
            '<div class="m-title' + (v.title ? "" : " untitled") + '">' + esc(v.title || "(no title)") + "</div>" +
            '<div class="m-channel">' + esc(v.channel || "") + "</div>" +
            (v.category ? '<span class="cat-tag">' + esc(v.category) + "</span>" : "") +
            (badges ? '<div class="badge-row">' + badges + "</div>" : "") +
          "</div>" +
          '<div class="row-actions">' +
            '<button class="icon-btn edit-video">Edit</button>' +
            '<button class="icon-btn toggle-block">' + (v.blocked ? "Unblock" : "Block") + "</button>" +
            '<button class="icon-btn delete-video">Delete</button>' +
          "</div>" +
        "</div>"
      );
    }).join("");
  }

  function editorRow(v) {
    return (
      '<div class="manage-row editing" data-id="' + esc(v.id) + '">' +
        '<img src="' + esc(v.thumbnail || YT.thumbUrl(v.id)) + '" alt="" loading="lazy" />' +
        '<div class="manage-info">' +
          '<label class="edit-label">Title</label>' +
          '<input class="edit-title" type="text" value="' + esc(v.title) + '" placeholder="Video title" />' +
          '<label class="edit-label">Channel</label>' +
          '<input class="edit-channel" type="text" value="' + esc(v.channel || "") + '" placeholder="Channel (optional)" />' +
          '<label class="edit-label">Category</label>' +
          '<input class="edit-category" type="text" list="category-options" value="' + esc(v.category || "") + '" placeholder="Category (optional)" />' +
        "</div>" +
        '<div class="row-actions">' +
          '<button class="icon-btn save-edit">Save</button>' +
          '<button class="icon-btn cancel-edit">Cancel</button>' +
        "</div>" +
      "</div>"
    );
  }

  /* ---- Keywords tab ---- */
  function renderKeywords() {
    var words = Store.getKeywords();
    if (!words.length) {
      els.keywordList.innerHTML = '<p class="empty-list">No blocked words yet.</p>';
      return;
    }
    els.keywordList.innerHTML = words.map(function (w) {
      return (
        '<span class="chip" data-word="' + esc(w) + '">' +
          esc(w) +
          '<button class="remove-keyword" aria-label="Remove ' + esc(w) + '">✕</button>' +
        "</span>"
      );
    }).join("");
  }

  function addKeyword() {
    var val = els.keywordInput.value.trim();
    if (!val) return;
    if (Store.addKeyword(val)) {
      els.keywordInput.value = "";
      renderKeywords();
      toast('Blocking "' + val.toLowerCase() + '"');
    } else {
      toast("Already blocked");
      els.keywordInput.value = "";
    }
  }

  /* ---- Settings tab ---- */
  function saveChildName() {
    Store.updateSettings({ childName: els.childName.value.trim() });
  }
  function savePin() {
    var pin = els.pinInput.value.trim();
    if (!/^\d{4}$/.test(pin)) { toast("PIN must be 4 digits"); return; }
    Store.updateSettings({ pin: pin });
    els.pinInput.value = "";
    toast("PIN saved");
  }
  function saveApiKey() {
    Store.updateSettings({ apiKey: els.apiKey.value.trim() });
    updateSearchAvailability();
    toast("API key saved");
  }
  function exportBackup() {
    var blob = new Blob([Store.exportJSON()], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "maetube-backup.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  function importBackup(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        Store.importJSON(reader.result);
        loadSettingsIntoForm();
        refreshParent();
        toast("Backup restored");
      } catch (e) {
        toast("That file could not be read");
      }
    };
    reader.readAsText(file);
  }
  function clearAll() {
    if (!confirm("Erase ALL videos, blocked words, and settings? This cannot be undone.")) return;
    Store.clearAll();
    loadSettingsIntoForm();
    refreshParent();
    toast("Everything erased");
  }

  /* ===================== EVENT WIRING ===================== */
  function wire() {
    // Video card tap → play (embed) or open in the YouTube app.
    els.timeline.addEventListener("click", function (e) {
      var card = e.target.closest(".card");
      if (!card) return;
      var v = Store.getVideos().find(function (x) { return x.id === card.dataset.id; });
      if (v) playVideo(v);
    });

    els.playerBack.addEventListener("click", closePlayer);

    // Parent gate.
    els.openParent.addEventListener("click", openPinGate);
    els.pinGate.addEventListener("click", function (e) {
      if (e.target === els.pinGate) closePinGate();
    });
    els.pinDots.parentElement.parentElement.querySelector(".keypad")
      .addEventListener("click", function (e) {
        var b = e.target.closest("button[data-key]");
        if (b) pinKey(b.dataset.key);
      });

    els.closeParent.addEventListener("click", closeParentMenu);

    // Tabs.
    els.parentMenu.querySelector(".tabs").addEventListener("click", function (e) {
      var t = e.target.closest(".tab");
      if (t) switchTab(t.dataset.tab);
    });

    // Add tab.
    els.bulkAdd.addEventListener("click", bulkAdd);
    els.seedBtn.addEventListener("click", function () { loadStarter({ button: els.seedBtn }); });
    els.resetBtn.addEventListener("click", resetToStarter);
    els.emptySeed.addEventListener("click", function () { loadStarter({ button: els.emptySeed }); });
    els.searchBtn.addEventListener("click", doSearch);
    els.searchInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter") doSearch();
    });
    els.searchResults.addEventListener("click", function (e) {
      var btn = e.target.closest(".add-result");
      if (!btn || btn.disabled) return;
      var row = e.target.closest(".result-row");
      var results = els.searchResults._results || [];
      var meta = results.find(function (r) { return r.id === row.dataset.id; });
      if (meta) {
        meta.category = els.addCategory.value.trim();
        if (Store.addVideo(meta)) {
          btn.textContent = "Added";
          btn.disabled = true;
          populateCategoryOptions();
          renderManageList();
          toast("Added");
        }
      }
    });

    // Manage tab.
    els.showBlocked.addEventListener("change", renderManageList);
    els.manageSearch.addEventListener("input", renderManageList);
    els.manageList.addEventListener("click", function (e) {
      var row = e.target.closest(".manage-row");
      if (!row) return;
      var id = row.dataset.id;
      if (e.target.closest(".save-edit")) {
        Store.updateVideo(id, {
          title: row.querySelector(".edit-title").value,
          channel: row.querySelector(".edit-channel").value,
          category: row.querySelector(".edit-category").value
        });
        editingId = null;
        populateCategoryOptions();
        renderManageList();
      } else if (e.target.closest(".cancel-edit")) {
        editingId = null;
        renderManageList();
      } else if (e.target.closest(".edit-video")) {
        editingId = id;
        renderManageList();
        var input = els.manageList.querySelector('.manage-row[data-id="' + id + '"] .edit-title');
        if (input) { input.focus(); input.select(); }
      } else if (e.target.closest(".toggle-block")) {
        var v = Store.getVideos().find(function (x) { return x.id === id; });
        Store.setBlocked(id, !(v && v.blocked));
        renderManageList();
      } else if (e.target.closest(".delete-video")) {
        if (confirm("Delete this video from your library?")) {
          Store.removeVideo(id);
          renderManageList();
        }
      }
    });
    els.manageList.addEventListener("keydown", function (e) {
      if (e.key !== "Enter") return;
      var row = e.target.closest(".manage-row.editing");
      if (row && e.target.classList.contains("edit-title")) {
        row.querySelector(".save-edit").click();
      }
    });

    // Keywords tab.
    els.keywordAdd.addEventListener("click", addKeyword);
    els.keywordInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter") addKeyword();
    });
    els.keywordList.addEventListener("click", function (e) {
      if (e.target.closest(".remove-keyword")) {
        var chip = e.target.closest(".chip");
        Store.removeKeyword(chip.dataset.word);
        renderKeywords();
      }
    });

    // Settings tab.
    els.childName.addEventListener("change", saveChildName);
    els.autoplayNext.addEventListener("change", function () {
      Store.updateSettings({ autoplayNext: els.autoplayNext.checked });
    });
    els.openInApp.addEventListener("change", function () {
      Store.updateSettings({ openInApp: els.openInApp.checked });
    });
    els.pinSave.addEventListener("click", savePin);
    els.apiSave.addEventListener("click", saveApiKey);
    els.exportBtn.addEventListener("click", exportBackup);
    els.importBtn.addEventListener("click", function () { els.importFile.click(); });
    els.importFile.addEventListener("change", function () {
      if (els.importFile.files[0]) importBackup(els.importFile.files[0]);
      els.importFile.value = "";
    });
    els.clearBtn.addEventListener("click", clearAll);
  }

  /* ===================== INIT ===================== */
  var UI = {
    init: function (store, yt) {
      Store = store;
      YT = yt;
      els = {
        timeline: $("timeline"),
        emptyState: $("empty-state"),
        emptySeed: $("empty-seed"),
        brandName: $("brand-name"),
        openParent: $("open-parent"),
        toast: $("toast"),
        // player
        playerOverlay: $("player-overlay"),
        playerBack: $("player-back"),
        playerTitle: $("player-title"),
        // pin
        pinGate: $("pin-gate"),
        pinDots: $("pin-dots"),
        pinError: $("pin-error"),
        // parent
        parentMenu: $("parent-menu"),
        closeParent: $("close-parent"),
        // add
        bulkInput: $("bulk-input"),
        bulkAdd: $("bulk-add"),
        addCategory: $("add-category"),
        categoryOptions: $("category-options"),
        seedBtn: $("seed-btn"),
        resetBtn: $("reset-btn"),
        seedStatus: $("seed-status"),
        addStatus: $("add-status"),
        searchBox: $("search-box"),
        searchHint: $("search-hint"),
        searchInput: $("search-input"),
        searchBtn: $("search-btn"),
        searchResults: $("search-results"),
        // manage
        showBlocked: $("show-blocked"),
        manageSearch: $("manage-search"),
        manageCount: $("manage-count"),
        manageList: $("manage-list"),
        // keywords
        keywordInput: $("keyword-input"),
        keywordAdd: $("keyword-add"),
        keywordList: $("keyword-list"),
        // settings
        childName: $("child-name"),
        autoplayNext: $("autoplay-next"),
        openInApp: $("open-in-app"),
        pinInput: $("pin-input"),
        pinSave: $("pin-save"),
        apiKey: $("api-key"),
        apiSave: $("api-save"),
        exportBtn: $("export-btn"),
        importBtn: $("import-btn"),
        importFile: $("import-file"),
        clearBtn: $("clear-btn")
      };
      wire();
      populateCategoryOptions();
      renderHome();
      YT.preload();

      // First ever launch with nothing saved: auto-load the starter library so
      // the app opens already full of videos.
      if (Store.isFresh() && !Store.getVideos().length) {
        loadStarter({ silent: true });
      }
    }
  };

  global.KV = global.KV || {};
  global.KV.UI = UI;
})(window);
