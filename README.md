# KidVid

A safe, parent‑curated YouTube player for kids — built as an installable web app
(PWA) you add to a tablet's home screen. Your child only ever sees the videos
**you** approve, laid out as big tappable cards. No search bar, no
recommendation rabbit holes, no way to wander off into the rest of YouTube.

> You don't mind ads — KidVid uses YouTube's official embedded player, so videos
> (and their ads) play exactly as they do on YouTube.

## What it does

**For your child (the timeline)**
- A colorful grid of large thumbnail cards — tap one to play it fullscreen.
- A giant **← Back** button returns to the grid. That's the whole interface.

**For you (the parent menu — behind a PIN)**
- **➕ Add** — paste one or many YouTube links at once (one per line). Titles and
  thumbnails are fetched automatically, **no API key required**. If you add a
  free API key (see below), you also get an in‑app **Search YouTube** box to find
  and add videos by keyword.
- **🎬 Videos** — see everything you've added; **Block** or **Delete** any video
  with one tap.
- **🚫 Blocked Words** — type a word like `peppa` and every video with that word
  in its title (or channel name) instantly disappears from the timeline — both
  the ones already added and any you add later. Remove the word to bring them
  back.
- **⚙️ Settings** — set your child's name, change the PIN, add an optional API
  key, and export/import a backup of your whole library.

Everything is stored **locally on the device** (browser `localStorage`). There is
no account, no server, and nothing leaves the tablet except the calls to YouTube
needed to fetch titles and play videos.

## Getting it onto a tablet

KidVid is a static web app — host the folder anywhere that serves static files
and open it on the tablet, then "Add to Home Screen".

**Easiest: GitHub Pages (free)**
1. Push this repo to GitHub.
2. Repo **Settings → Pages → Build and deployment → Source: Deploy from a
   branch**, pick this branch and the root folder, save.
3. Open the resulting `https://<you>.github.io/kidvid/` URL on the tablet.
4. **Add to Home Screen** (Safari share menu on iPad, or the ⋮ menu on Android).
   It now opens fullscreen like a normal app.

**Or:** any static host (Netlify, Cloudflare Pages, Vercel), or a local server on
your home network (`npx serve` / `python3 -m http.server` from this folder).

> The service worker / home‑screen install needs to be served over `http(s)` —
> opening `index.html` as a `file://` still works for adding and playing videos,
> it just won't install as an app.

## First run

- The default PIN is **1234** — change it in **Settings** right away.
- Add a few videos from the **Add** tab by pasting links, and you're set.

## Optional: search YouTube from inside the app

To enable the **Search YouTube** box (find videos by keyword instead of pasting
links):

1. Go to the [Google Cloud Console](https://console.cloud.google.com/), create a
   project, and enable **YouTube Data API v3**.
2. Create an **API key** and paste it into **Settings → YouTube Data API key**.
3. (Recommended) Restrict the key to the YouTube Data API, and to your Pages
   domain, in the Cloud Console.

Search uses YouTube's `safeSearch=strict` filter. The free daily quota is
generous for a parent curating a library. Without a key, adding videos by link
works exactly the same — you just don't get in‑app search.

## Project layout

```
index.html         App shell (all screens)
css/styles.css     Styling
js/store.js        Local data layer (videos, blocked words, settings)
js/youtube.js      Link parsing, title/thumbnail fetch, search, IFrame player
js/ui.js           Rendering + all interactions
js/app.js          Boot + service‑worker registration
manifest.json      PWA manifest (home‑screen install)
sw.js              Service worker (offline app shell)
assets/            App icons + make_icons.py (regenerates the PNGs)
```

## Notes & limits

- Keyword blocking matches the **title and channel name** we have on record for
  each video, case‑insensitively (`peppa` matches "Peppa Pig", "PEPPA", etc.).
- Blocking is a one‑way gate the child can't undo — unblocking only happens in
  the PIN‑protected parent menu.
- YouTube still decides what plays; KidVid controls *which* videos appear, not
  what happens if a video is later removed or made private on YouTube's side.
- To move your library to another tablet, use **Settings → Export backup** and
  **Import backup**.
