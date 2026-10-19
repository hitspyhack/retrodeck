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

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  /* never intercept the emulator's own runtime traffic: cores stream, seek
     and write to IndexedDB through requests that must not be replayed */
  if (url.pathname.includes("/data/")) return;

  const isCdn = /cdn\.emulatorjs\.org$/i.test(url.hostname);
  if (!sameOrigin && !isCdn) return;

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
          if (res.ok && (await caches.has(CDN))) c.put(req, res.clone()).catch(() => {});
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
          if (res && res.ok) c.put(req, res.clone()).catch(() => {});
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
