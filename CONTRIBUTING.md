# Contributing

RetroDeck is a static, dependency-light single-page app: plain ES modules, no
bundler, no framework, no build step you have to trust.

## First five minutes

```sh
node --version        # 20 or newer
npm test              # the whole suite, no npm install needed
npm run dev           # http://localhost:5173
```

`npm test` is the gate. It runs in a second and covers the things that silently
break here: that the generated catalogue matches its source, that the CSS the
views use is CSS that exists, that the service worker still caches what the app
requests, that `dist/` can be built complete, and that every `EJS_*` option the
app sets is one the runtime forwards.

For a browser run:

```sh
npm i -D playwright && npx playwright install chromium
node tools/browser-check.mjs      # ~45s, real Chromium, real file import, real core
```

It self-skips when Playwright is not installed, so the suite stays install-free.

## The two rules this repo learned the hard way

1. **The EmulatorJS documentation page is not authoritative — the shipped
   `loader.js` and `emulator.min.js` are.** Several documented options do not
   exist in 4.2.3 (`EJS_onExit`, `EJS_cacheConfig`, …), and `EJS_loadStateURL`
   is forwarded by the loader but never read by the runtime. Before wiring a
   feature to an `EJS_*` key, grep the two files. `data/source/emulatorjs.json`
   is the snapshot `npm test` checks against; refresh it with
   `node tools/refresh-runtime.mjs`.
2. **Every claim needs a check that would fail without it.** When you add a
   console, a core id, a save path or a sentence in a doc, the assertion you
   write has to come from the app's own data — a route id, a card count, a real
   core name — not from what the code is supposed to do. Four of the first five
   failures in `tools/browser-check.mjs` were the harness guessing; the fifth
   was a real server bug that no headless test could have seen.

## Where things go

| Change | File |
| --- | --- |
| A console or handheld | `js/data/systems.js` (add the core id from `cores/cores.json`) |
| A shell with its defaults | `js/data/models.js` |
| A faceplate / colourway | `js/data/skins.js` |
| Button placement for a shell | `js/data/layouts.js` (`tools/check-layouts.mjs` audits the boxes) |
| A playable title, no emulator | `js/games/*.js` + `js/games/index.js` |
| A ROM-only shelf | `homebrew/<system>/README.md`, nothing else |
| A setting | `js/core/store.js` defaults, then `js/views/settings.js` |
| Storage | `js/core/idb.js` — the schema version and migration, not a new store |

## Etiquette specific to this project

- **Never bundle or link a commercial ROM or BIOS.** Catalogue entries are
  metadata; the cartridge comes from the user's own files.
- Keep `npm test` install-free: a new check may shell out to node, but must not
  need a package. Anything that wants Playwright belongs in
  `tools/browser-check.mjs`, behind its self-skip.
- A PR that touches the runtime contract should say which file it was verified
  against, and at what version.
