/* ==========================================================================
   RetroDeck service worker.
   --------------------------------------------------------------------------
   Two jobs:
     1. the app itself (modules, css, console artwork, the generated game
        index) must open with no network at all - a stale-while-revalidate
        cache over same-origin GETs does that without a hand-maintained
        precache list that could drift out of sync with the file tree;
     2. EmulatorJS cores are enormous, so they get their own long-lived cache
        (only when the player chose the CDN source; a self-hosted vendor/
        folder is already served immutable by server.mjs).

   What it deliberately does not touch: any non-http(s) request (the vault hands
   the core a blob: URL, and a worker answering that with Response.error()
   kills the game), any Range request (a core seeking into a .wasm or a disc
   image must see the server's own 206), any core payload ending in .wasm or
   .data, and this origin's /vendor/ - the runtime keeps those in IndexedDB
   itself, so a second copy in Cache Storage is wasted space. The small loader
   scripts are cached, which is what lets a cold offline start still boot.

   Note that /data/games.json - the game index - is an ordinary app file and IS
   cached: an early version skipped every path containing "/data/" and quietly
   made the app un-openable offline, because js/app.js imports that module.

   Update flow: new SW installs in the background, then claims on reload, so a
   player never sees a half-written app. Bump CACHE when the shape of the
   cached data changes.
   ========================================================================== */

const CACHE = "retrodeck-v1";
const CDN = "retrodeck-cdn-v1";
const SHELL = "./index.html";

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.match(SHELL).then((hit) => (hit ? undefined : c.add(SHELL).catch(() => {}))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((k) => k !== CACHE && k !== CDN).map((k) => caches.delete(k)),
    );
    await self.clients.claim();
  })());
});

self.addEventListener("message", (e) => {
  if (e.data?.type === "skip-waiting") self.skipWaiting();
  if (e.data?.type === "warm" && Array.isArray(e.data.urls)) {
    e.waitUntil(caches.open(CDN).then((c) => Promise.allSettled(e.data.urls.map((u) => c.add(u)))));
  }
});

/** Cache Storage is not IndexedDB: the core keeps its own copy of a 100 MB
 *  .wasm; this cache is for the app and the small runtime bits. */
const MAX_CACHE_BYTES = 48 * 1024 * 1024;

function worthCaching(res) {
  if (!res || !res.ok) return false;
  const len = Number(res.headers.get("content-length") || 0);
  return !len || len <= MAX_CACHE_BYTES;
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (!/^https?:$/.test(url.protocol)) return; // blob: ROM URLs belong to the page, not to the worker
  if (req.headers.get("range")) return; // a seek goes to the server, not to a cached whole file
  const sameOrigin = url.origin === self.location.origin;
  const path = url.pathname;

  const isCdn = /cdn\.emulatorjs\.org$/i.test(url.hostname);
  if (!sameOrigin && !isCdn) return;
  /* the runtime's giants: a core is streamed and seeked, and the emulator
     keeps its own copy in IndexedDB, so .wasm/.data never come near Cache
     Storage. The small loader scripts and version.json do - warming them is
     what lets a first run work with the radio off. */
  if (!sameOrigin && /\.(wasm|data)(\?|$)/i.test(path)) return;
  if (sameOrigin && /\/vendor\//.test(path)) return;

  /* navigations: network first so a redeploy shows up, offline cache as the net */
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(SHELL, copy));
          return res;
        })
        .catch(() => caches.match(SHELL).then((hit) => hit || Response.error())),
    );
    return;
  }

  /* CDN assets: cache first, they are versioned by path */
  if (isCdn) {
    e.respondWith(
      caches.open(CDN).then(async (c) => {
        const hit = await c.match(req);
        if (hit) return hit;
        try {
          const res = await fetch(req);
          if (worthCaching(res) && (await caches.has(CDN))) c.put(req, res.clone()).catch(() => {});
          return res;
        } catch (err) {
          return Response.error();
        }
      }),
    );
    return;
  }

  /* same-origin files: serve from cache, refresh in the background */
  e.respondWith(
    caches.open(CACHE).then(async (c) => {
      const hit = await c.match(req);
      const refresh = fetch(req)
        .then((res) => {
          if (worthCaching(res)) c.put(req, res.clone()).catch(() => {});
          return res;
        })
        .catch(() => null);
      if (hit) {
        refresh.catch(() => {});
        return hit;
      }
      const net = await refresh;
      return net || Response.error();
    }),
  );
});
