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

  /* ===================== KID TIMELINE ===================== */
  function renderTimeline() {
    var videos = Store.getVisibleVideos();
    var settings = Store.getSettings();
    els.brandName.textContent = settings.childName ? settings.childName + "'s Videos" : "KidVid";

    if (!videos.length) {
      els.timeline.innerHTML = "";
      els.emptyState.classList.remove("hidden");
      return;
    }
    els.emptyState.classList.add("hidden");

    els.timeline.innerHTML = videos.map(function (v) {
      return (
        '<button class="card" data-id="' + esc(v.id) + '">' +
          '<span class="card-thumb" style="background-image:url(\'' + esc(v.thumbnail || YT.thumbUrl(v.id)) + '\')"></span>' +
          '<span class="card-title">' + esc(v.title) + '</span>' +
        '</button>'
      );
    }).join("");
  }

  /* ===================== PLAYER ===================== */
  function openPlayer(video) {
    els.playerTitle.textContent = video.title;
    els.playerOverlay.classList.remove("hidden");
    YT.play(video.id);
    lockScroll(true);
  }

  function closePlayer() {
    YT.stop();
    els.playerOverlay.classList.add("hidden");
    lockScroll(false);
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
    renderTimeline();
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
  }

  function loadSettingsIntoForm() {
    var s = Store.getSettings();
    els.childName.value = s.childName || "";
    els.apiKey.value = s.apiKey || "";
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

    els.bulkAdd.disabled = true;
    setAddStatus("Fetching " + newIds.length + " video(s)…", "");

    var added = 0, failed = 0, done = 0;
    newIds.forEach(function (id) {
      YT.fetchMeta(id).then(function (meta) {
        if (Store.addVideo(meta)) added++;
      }).catch(function () {
        // Still add it with a fallback title/thumbnail so it isn't lost.
        if (Store.addVideo({ id: id, title: "YouTube video " + id, thumbnail: YT.thumbUrl(id) })) added++;
        failed++;
      }).then(function () {
        done++;
        if (done === newIds.length) finishBulk(added, failed, dupes);
      });
    });
  }

  function finishBulk(added, failed, dupes) {
    els.bulkAdd.disabled = false;
    els.bulkInput.value = "";
    var msg = "Added " + added + " video(s).";
    if (failed) msg += " " + failed + " had no title (added anyway).";
    if (dupes) msg += " " + dupes + " were already added.";
    setAddStatus(msg, "ok");
    renderManageList();
  }

  function setAddStatus(msg, cls) {
    els.addStatus.innerHTML = msg ? '<span class="' + cls + '">' + esc(msg) + "</span>" : "";
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
  function renderManageList() {
    var all = Store.getVideos();
    var showBlocked = els.showBlocked.checked;
    var keywords = Store.getKeywords();

    var list = all.filter(function (v) {
      if (showBlocked) return true;
      return !v.blocked;
    });

    els.manageCount.textContent = all.length + " video(s) total";

    if (!list.length) {
      els.manageList.innerHTML = '<p class="empty-list">No videos here yet. Add some from the Add tab.</p>';
      return;
    }

    els.manageList.innerHTML = list.map(function (v) {
      var kw = Store.matchesKeyword(v, keywords);
      var badges = "";
      if (v.blocked) badges += '<span class="badge blocked-badge">Blocked</span> ';
      if (kw) badges += '<span class="badge keyword-badge">Hidden by word</span>';
      return (
        '<div class="manage-row' + (v.blocked ? " is-blocked" : "") + '" data-id="' + esc(v.id) + '">' +
          '<img src="' + esc(v.thumbnail || YT.thumbUrl(v.id)) + '" alt="" loading="lazy" />' +
          '<div class="manage-info">' +
            '<div class="m-title">' + esc(v.title) + "</div>" +
            '<div class="m-channel">' + esc(v.channel || "") + "</div>" +
            (badges ? "<div>" + badges + "</div>" : "") +
          "</div>" +
          '<div class="row-actions">' +
            '<button class="icon-btn toggle-block">' + (v.blocked ? "Unblock" : "Block") + "</button>" +
            '<button class="icon-btn delete-video">Delete</button>' +
          "</div>" +
        "</div>"
      );
    }).join("");
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
    a.download = "kidvid-backup.json";
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
    // Timeline card tap → play.
    els.timeline.addEventListener("click", function (e) {
      var card = e.target.closest(".card");
      if (!card) return;
      var v = Store.getVideos().find(function (x) { return x.id === card.dataset.id; });
      if (v) openPlayer(v);
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
      if (meta && Store.addVideo(meta)) {
        btn.textContent = "Added";
        btn.disabled = true;
        renderManageList();
        toast("Added");
      }
    });

    // Manage tab.
    els.showBlocked.addEventListener("change", renderManageList);
    els.manageList.addEventListener("click", function (e) {
      var row = e.target.closest(".manage-row");
      if (!row) return;
      var id = row.dataset.id;
      if (e.target.closest(".toggle-block")) {
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
        addStatus: $("add-status"),
        searchBox: $("search-box"),
        searchHint: $("search-hint"),
        searchInput: $("search-input"),
        searchBtn: $("search-btn"),
        searchResults: $("search-results"),
        // manage
        showBlocked: $("show-blocked"),
        manageCount: $("manage-count"),
        manageList: $("manage-list"),
        // keywords
        keywordInput: $("keyword-input"),
        keywordAdd: $("keyword-add"),
        keywordList: $("keyword-list"),
        // settings
        childName: $("child-name"),
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
      renderTimeline();
      YT.preload();
    }
  };

  global.KV = global.KV || {};
  global.KV.UI = UI;
})(window);
