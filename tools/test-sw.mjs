#!/usr/bin/env node
/**
 * Execute sw.js for real and check its routing decisions.
 *
 * The service worker is the piece of this app that is easiest to get wrong and
 * hardest to notice: a rule that returns early means "works online, blank
 * offline", and a rule that intercepts too much means the core's blob: ROM URL
 * or a Range request gets a replayed 200 and the game dies. There is no browser
 * here, so the worker is loaded against stubs for exactly the globals it uses
 * (self, caches, clients, fetch, Response) and every branch is poked.
 *
 *   node tools/test-sw.mjs
 */
import { pathToFileURL } from "node:url";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const origin = "https://deck.test";
const log = { put: [], responded: 0 };

class FakeCache {
  constructor(name) {
    this.name = name;
    this.entries = new Map();
  }
  async match(req) {
    return this.entries.get(key(req)) || undefined;
  }
  async put(req, res) {
    const k = key(req);
    log.put.push(`${this.name}:${k}`);
    this.entries.set(k, res);
  }
  /** CacheStorage.add(url) is a fetch + put with the request resolved against
   *  the worker scope, which is what the relative "./index.html" needs. */
  async add(input) {
    const url = new URL(typeof input === "string" ? input : input.url, globalThis.self.location.href).href;
    const res = await globalThis.fetch(url);
    await this.put({ url }, res);
    return undefined;
  }
}
const key = (req) => (typeof req === "string" ? req : req.url);

const stores = new Map();
const fakeCaches = {
  /** CacheStorage.match(req) searches every cache, which is what the offline
   *  navigation fallback relies on - so the stub has to do the same. */
  async match(req) {
    for (const store of stores.values()) {
      const hit = await store.match(req);
      if (hit) return hit;
    }
    return undefined;
  },
  async open(name) {
    if (!stores.has(name)) stores.set(name, new FakeCache(name));
    return stores.get(name);
  },
  async has(name) {
    return stores.has(name);
  },
  async keys() {
    return [...stores.keys()];
  },
  async delete(name) {
    return stores.delete(name);
  },
};

const resp = (url, { ok = true, status = 200, len = 1200, body = "bytes" } = {}) => ({
  ok,
  status,
  url,
  _len: len,
  headers: new Headers(
    Object.fromEntries([
      ["content-type", "application/octet-stream"],
      ...(len ? [["content-length", String(len)]] : []),
    ])
  ),
  clone() {
    return this;
  },
  text: async () => body,
});

/** what the network would answer, per url */
const network = new Map();
const fetched = [];
async function fakeFetch(input) {
  const url = typeof input === "string" ? input : input.url;
  fetched.push(url);
  if (!url.startsWith("http")) throw new TypeError("Failed to fetch");
  const r = network.get(url);
  if (!r) throw new TypeError("network down");
  return r;
}

const handlers = new Map();
globalThis.self = {
  location: { origin, href: origin + "/" },
  addEventListener(type, fn) {
    handlers.set(type, fn);
  },
  skipWaiting() {},
  clients: { claim: async () => {} },
};
globalThis.caches = fakeCaches;
globalThis.fetch = fakeFetch;
globalThis.Response = Object.assign(
  class {},
  { error: () => ({ __error: true, ok: false, status: 408 }) }
);
globalThis.Request = class {};

await import(pathToFileURL(join(ROOT, "sw.js")).href);

const fetchHandler = handlers.get("fetch");
if (!fetchHandler) {
  console.error("FAIL sw.js registered no fetch handler");
  process.exit(1);
}
for (const needed of ["install", "activate", "message"]) {
  if (!handlers.get(needed)) {
    console.error(`FAIL sw.js has no ${needed} handler`);
    process.exit(1);
  }
}

const mkReq = (url, opts = {}) => ({
  method: opts.method || "GET",
  url,
  mode: opts.mode || "no-cors",
  headers: new Headers(opts.headers || {}),
});

let bad = 0;
async function run(url, opts = {}) {
  log.responded = 0;
  log.put.length = 0;
  fetched.length = 0;
  let value = null;
  let error = null;
  const event = {
    request: mkReq(url, opts),
    async respondWith(p) {
      log.responded++;
      try {
        value = await p;
      } catch (e) {
        error = e;
      }
    },
    waitUntil() {},
  };
  await fetchHandler(event);
  // respondWith's promise is never awaited by a real worker - let it settle here
  for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0));
  return { intercepted: log.responded > 0, value, error, put: [...log.put] };
}

function expect(name, cond, detail = "") {
  if (cond) console.log(`ok   ${name}${detail ? `  ${detail}` : ""}`);
  else {
    bad++;
    console.log(`FAIL ${name}${detail ? `  ${detail}` : ""}`);
  }
}

/* ------------------------------------------------------- the app gets cached */
const gamesJson = `${origin}/data/games.json`;
network.set(gamesJson, resp(gamesJson));
{
  const r = await run(gamesJson);
  expect(
    "the game index is intercepted and cached (an over-broad /data/ rule used to make the app un-openable offline)",
    r.intercepted && r.put.some((p) => p.includes("data/games.json")),
    r.put.join(",") || "nothing cached"
  );
}
{
  const url = `${origin}/js/data/games.generated.js`;
  network.set(url, resp(url));
  const r = await run(url);
  expect("the generated catalogue module is cached", r.intercepted && r.put.length > 0);
}
{
  const url = `${origin}/homebrew/nes/Demo%20(World).nes`;
  network.set(url, resp(url, { len: 4096 }));
  const r = await run(url);
  expect("a bundled homebrew image is cached, so the shelf plays offline", r.intercepted && r.put.length > 0);
}
{
  // second visit: the cached response is what comes back, while a background
  // revalidation runs (that is the point of stale-while-revalidate)
  const url = `${origin}/css/app.css`;
  const first = resp(url);
  network.set(url, first);
  await run(url);
  const refreshed = resp(url, { body: "newer" });
  network.set(url, refreshed);
  const again = await run(url);
  expect(
    "a cached app file is served from Cache Storage, then revalidated in the background",
    again.intercepted && again.value === first && again.put.includes(`retrodeck-v1:${url}`),
    again.value === first ? "stale-while-revalidate" : "served the network copy instead"
  );
}

/* --------------------------------------------- what the worker must not touch */
{
  const r = await run("blob:https://deck.test/1f2e3-does-not-exist");
  expect("a blob: ROM url is left alone (a worker error there kills the game)", !r.intercepted);
}
{
  const url = `${origin}/homebrew/psx/disc.chd`;
  network.set(url, resp(url));
  const r = await run(url, { headers: { range: "bytes=1048576-" } });
  expect("a Range request is left to the server", !r.intercepted);
}
{
  const url = `${origin}/vendor/data/cores/nes.js`;
  const r = await run(url);
  expect("/vendor/ is left to the server's immutable caching", !r.intercepted);
}
{
  const url = "https://cdn.emulatorjs.org/stable/data/cores/nes.wasm";
  const r = await run(url);
  expect("a core payload (.wasm) on the CDN is left to the runtime's own cache", !r.intercepted);
}
{
  const url = "https://cdn.emulatorjs.org/stable/data/wasm/rt-wasm.data";
  const r = await run(url);
  expect("a .data blob is left alone too", !r.intercepted);
}
{
  // the loader script is small, and a cold offline start needs it
  const url = "https://cdn.emulatorjs.org/stable/data/loader.js";
  const first = resp(url);
  network.set(url, first);
  const r = await run(url);
  expect("the CDN loader script is intercepted and kept (a cold offline boot needs it)", r.intercepted && r.put.length > 0, r.put.join(",") || "nothing cached");
  network.clear();
  const off = await run(url);
  expect("with the CDN unreachable, the warmed loader comes out of Cache Storage", off.intercepted && off.value === first);
}
{
  const url = `${origin}/api/upload`;
  const r = await run(url, { method: "POST" });
  expect("a POST is not intercepted", !r.intercepted);
}
{
  const r = await run("data:image/png;base64,AAAA");
  expect("a data: url is not intercepted", !r.intercepted);
}

/* ------------------------------------------------------------- size policy */
{
  const url = `${origin}/homebrew/dreamcast/huge.chd`;
  network.set(url, resp(url, { len: 200 * 1024 * 1024 }));
  const r = await run(url);
  expect("a 200 MB file is served but not copied into Cache Storage", r.intercepted && r.put.length === 0, r.put.join(",") || "(skipped, as intended)");
}

/* ------------------------------------------------------------ navigation */
{
  const url = `${origin}/index.html`;
  network.set(url, resp(url));
  const r = await run(url, { mode: "navigate" });
  expect("navigation goes to the network first and refreshes the shell", r.intercepted && r.value && r.put.length > 0);
  // now offline
  network.clear();
  const off = await run(`${origin}/library/gb`, { mode: "navigate" });
  expect("with the network gone, a navigation still opens the app", off.intercepted && off.value && !off.value.__error);
}

/* ------------------------------------------------------------ install/warm */
{
  network.clear();
  const shell = `${origin}/index.html`;
  network.set(`${origin}/index.html`, resp(`${origin}/index.html`));
  let installDone = false;
  let installErr = null;
  handlers.get("install")({
    waitUntil: (p) => {
      Promise.resolve(p).then(() => (installDone = true), (e) => (installErr = e));
    },
  });
  await new Promise((r) => setTimeout(r, 60));
  const cache = stores.get("retrodeck-v1");
  expect(
    "install seeds the shell cache",
    !installErr && installDone && [...cache.entries.keys()].some((k) => k.endsWith("/index.html")),
    [...cache.entries.keys()].filter((k) => k.includes("index.html")).join(",") || "empty"
  );

  // a warm request for a runtime file: the one url that exists must land in the
  // CDN cache, and the one that 404s must not blow the worker up
  const warmUrl = "https://cdn.emulatorjs.org/stable/data/version.json";
  network.set(warmUrl, resp(warmUrl));
  let warmed = null;
  handlers.get("message")({
    data: { type: "warm", urls: [warmUrl, "https://cdn.emulatorjs.org/stable/data/nope.js"] },
    waitUntil: (p) => (warmed = p),
  });
  await warmed;
  const cdnStore = stores.get("retrodeck-cdn-v1");
  expect(
    "a warm message caches the reachable url and survives the unreachable one",
    cdnStore && [...cdnStore.entries.keys()].some((k) => k === warmUrl)
  );
}

if (bad) {
  console.error(`\n${bad} service-worker behaviour(s) wrong`);
  process.exit(1);
}
console.log(`\nsw.js behaves: ${fetched.length >= 0 ? "app cached, runtime and blob traffic left alone" : ""}`);
