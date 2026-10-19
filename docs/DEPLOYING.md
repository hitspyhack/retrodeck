# Deploying

RetroDeck is static files. There is no build step, no bundler and nothing to run on
a server: the app is `index.html` plus ES modules, and the only runtime dependency is
the EmulatorJS payload, which comes from a CDN unless you mirror it.

## 1. The folder to publish

```sh
npm run deploy:prepare     # writes dist/ and proves it is complete
npm run deploy:check       # verify an existing dist/ without rebuilding
```

`tools/make-dist.mjs` copies only what the site asks for and then re-reads the
result: every `src`/`href` in `dist/index.html` and every module reachable through
the import graph must exist in `dist/`, or the command fails. That is what catches a
new `js/` file that would 404 on a phone but work fine in the repo. It is ~72 files
and ~1 MB; add `vendor/` (below) and it becomes hundreds of MB.

Never publish the repo root instead: it also contains `tools/`, `docs/` and the
source of the catalogue. `dist/` is what GitHub Pages and every other host should
point at.

## 2. Hosts

| Host | Config in the repo | Notes |
| --- | --- | --- |
| GitHub Pages | `.github/workflows/ci.yml` → `pages` job | builds `dist/` on every merge to `main`, once Settings ▸ Pages ▸ Source is *GitHub Actions*. Until you flip that switch the job prints why it skipped in the run summary and stays green - Pages is publishing the repository root from the branch pipeline, and the app runs from there |
| Cloudflare Pages | `_headers` | build `npm run deploy:prepare`, output `dist` |
| Netlify | `netlify.toml` | same |
| Vercel | `vercel.json` | same |
| your own box | `npm run vendor:serve` | `server.mjs --threads`, one process, no deps |

All four config files set the same two headers, and `npm test` fails if one of them
stops doing so.

## Pushing it somewhere

`tools/publish.sh` is the publish path for a machine with nothing installed - no
credential helper, no `gh`, only a fine-grained token (Contents: read+write on that
one repository, and it cannot create the repository):

```sh
GH_TOKEN=github_pat_… tools/publish.sh <owner> [repo] [branch]
npm run github:push -- <owner>          # same thing
```

It takes the token from the environment only, sends it as an `Authorization`
header so it cannot leak through a redirect or a quoted remote URL, configures it
for the single `git -c` invocation (so `git remote -v` stays clean afterwards),
refuses a dirty tree, and finishes with `ls-remote` so "pushed" is a fact rather
than a hope.

## 3. The two headers that actually matter

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

That pair is what makes `window.crossOriginIsolated` true, and `SharedArrayBuffer`
exists only then. Threaded core builds (`parallel_n64`, the `*-thread-wasm.data`
blobs, `dosbox_pure`) want it. Nothing else in this list is load-bearing:

* GitHub Pages **cannot** set headers at all, so a Pages deployment is not
  cross-origin isolated. The app still runs; `Settings ▸ Emulator ▸ Shared WASM memory
  / threads` simply has nothing to switch on, and the cores use their
  single-threaded build. That matters for N64/PSX/PSP on old phones and not at all
  for 8/16-bit.
* Do **not** add `Permissions-Policy: cross-origin-isolated=…`. An earlier version of
  `server.mjs` sent a malformed one and it *denied* the feature it was trying to
  grant: chromium reported `crossOriginIsolated=false` with both COOP and COEP
  present, and every threaded core silently fell back. `tools/browser-check.mjs`
  asserts isolation in a real browser, which is how that was caught.
* `require-corp` is safe against the CDN because `cdn.emulatorjs.org` answers with
  `cross-origin-resource-policy: cross-origin` and `access-control-allow-origin: *`
  on both `loader.js` and `cores/*-wasm.data` (verified against the shipped files).
  Point `Settings ▸ Emulator ▸ CDN base` at a mirror that does not send them and the
  core fetch will be blocked - add `crossorigin="anonymous"` handling on that mirror,
  or serve `vendor/` from the same origin.

## 4. Fully offline / no CDN

```sh
npm run vendor                       # each deck's default core (20)
npm run vendor -- --full --threads   # every core any deck can be set to, + threaded
npm run vendor -- --list             # what that means before downloading
```

It lands in `vendor/data/` with the CDN's own layout, so set
**Settings ▸ Emulator ▸ Payload source → ./vendor (self-hosted)**, or publish `dist/`
with `vendor/` inside it (run `deploy:prepare` *after* `vendor`; the tool copies
`vendor/` when it exists). Then the site needs nothing but its own origin: right for
a phone on a train, a classroom, a kiosk, a plane.

The core blobs are `cores/<name>-wasm.data`, one file per core, tens of megabytes
each. They are upstream works under their own licences - see `NOTICE.md` - which is
why they are git-ignored and downloaded rather than committed.

## 5. What the CI checks, and what it cannot

`.github/workflows/ci.yml` runs three jobs:

1. **checks** - `npm test` (22 checks, no dependencies, ~7 s) on Node 20 and 22, plus
   `deploy:prepare`/`deploy:check`, plus a proof that the committed
   `data/games.json` / `js/data/games.generated.js` match `data/source/games.tsv`.
2. **browser** - `node tools/browser-check.mjs` in headless chromium: every route
   renders, a built-in game paints real pixels (sampled), a setting survives a
   reload through IndexedDB, offline serves the shell from the service-worker cache,
   importing a file detects its console and boots a *real* core, and every deck's
   core name exists in the runtime's own `cores.json`.
3. **pages** - deploys `dist/` to GitHub Pages on `main`, after both.

The one thing no job here can do is *finish* a core run: the CI browser job has no
GPU either, so the check asserts that the core was fetched and the frame mounted and
stops there - deliberately, because a 12-line page containing only EmulatorJS
crashes a GPU-less renderer in about three seconds, and blaming the app for that
would be a false alarm. If you have a machine with a GPU, `npm i --no-save
playwright && npx playwright install chromium && node tools/browser-check.mjs
--headed` is the closest thing to playing it for real.

## 6. Screenshots in the README

`docs/img/library.png` and `docs/img/play-builtin.png` are produced by
`tools/browser-check.mjs` (they are copied out of `.browser-check/`), not hand-made.
So a stale picture means the check was not run.
