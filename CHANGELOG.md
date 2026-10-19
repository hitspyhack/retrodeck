# Changelog

All notable changes to RetroDeck are in this file. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the project is
versioned by its commits, not by tags, because it is a static site that ships
whole.

## [Unreleased]

### Added
- `Settings ▸ Install & updates`: an install button that only exists when the
  browser has actually offered one, per-platform instructions when it has not
  (iOS never fires `beforeinstallprompt`), a real "check for a new build"
  action, and a *Reload now* button that only appears while a service worker is
  waiting. New state lives in `js/core/pwa.js`; `sw.js` already answered
  `skip-waiting`.
- `docs/PLAYING.md` gained the install/update section, the threads switch and
  what its missing headers cost, and an explicit statement that save export is
  one-way (with the reason).
- `.github/workflows/ci.yml`: `node --check` plus `npm test` on Node 20 and 22,
  a headless-Chromium lane (`node tools/browser-check.mjs`) that drives the real
  app — import sheet, file chooser, core boot, offline reload, console errors —
  and a `pages` job that publishes `dist/`.
- `_headers`, `netlify.toml`, `vercel.json`: the COOP/COEP pair threaded cores
  need, matching what `server.mjs --threads` sends.
- `tools/make-dist.mjs` builds the deploy folder (`npm run deploy:prepare`), and
  `--check` fails when a module reachable from `index.html` is missing from it.
- `js/core/cheats.js`: cheat codes are parsed and handed to the runtime in the
  shape it documents (`[[description, code]]`), and netplay is now reported as
  what it is — experimental, and only reachable with `EJS_DEBUG_XX`.

### Changed
- Save and state rows in the vault say **Export**, not **Save**: nothing here
  can put those bytes back into a running core, and the section now says so.
- `emulator.exitConfirm` ("Ask before leaving a running game") answers
  `beforeunload` while a game is live, which is the only exit path the in-app
  sheet cannot see.

### Fixed
- `server.mjs --threads` sent a `Permissions-Policy` header with an
  `cross-origin-isolated=1` directive that is not valid syntax — the browser
  read it as *denying* the feature, so cross-origin isolation never switched on
  and no threaded core could start. Cross-origin isolation is a two-header
  affair (COOP + COEP); the third header is now gone and the browser check
  asserts `crossOriginIsolated` is true.
- The DOM shim used for headless checks assigned `globalThis.navigator`, which
  Node 21+ defines as a getter only: every import check threw on Node 22. The
  shim now defines its globals instead of assigning them.
- Five `EJS_*` globals taken from the docs page (`EJS_cacheConfig`,
  `EJS_askBeforeExit`, `EJS_disableAutoUnload`, `EJS_onSaveUpdate`,
  `EJS_onExit`) are read by nobody in the shipped runtime; the settings they
  backed now use the APIs that exist, and a check keeps the app from setting a
  key `loader.js` does not forward.
- Core ids in `js/data/*.js` were corrected against `cores/cores.json`; a
  guessed name is a 404 the player now reports as `no-core` instead of a
  spinner. Shelves with no published core (Dreamcast) say so before fetching.
- `docs/PLAYING.md` told people to pick `vba_next`; that core does not exist in
  the runtime. The advice is now "try the other core the deck actually lists".
- `EJS_CacheLimit` is a byte count, not megabytes; the setting that scaled the
  core cache cap was wrong by six orders of magnitude.

### Notes for anyone upgrading a deployment
- GitHub Pages has to be switched to *Settings ▸ Pages ▸ Source: GitHub
  Actions* once, or the site keeps serving the repository root instead of
  `dist/`. Pages cannot set response headers, so there the cores run
  single-threaded.
