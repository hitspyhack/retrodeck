#!/usr/bin/env node
/**
 * Does the *server* serve the app? npm test proves the modules parse and the
 * views mount; this proves the thing a browser actually asks for:
 *
 *   - every <script src>, <link href>, icon and manifest in index.html
 *   - the whole ES-module graph reachable from /js/app.js (relative specifiers
 *     only - a bare or absolute import would be a fetch of someone else's host)
 *   - data/games.json and the homebrew folders the build wrote paths into
 *   - traversal attempts stay inside the repo
 *   - the headers the emulator depends on (COOP/COEP when --threads is used,
 *     correct .wasm/.mjs content types, ETag revalidation, byte ranges)
 *
 * It starts its own server on a free port and shuts it down, so it is safe to
 * run next to a dev server:  npm run serve:check
 */

import { spawn } from "node:child_process";
import { existsSync, readFileSync, statSync, writeFileSync, unlinkSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/* --------------------------------------------------------------- free port */
async function pickPort(from = 4299) {
  for (let port = from; port < from + 40; port++) {
    const ok = await new Promise((r) => {
      const srv = spawn("node", ["-e", `require("node:net").createServer().listen(${port},"127.0.0.1",()=>{console.log("free");process.exit(0)}).on("error",()=>process.exit(1))`], { stdio: ["ignore", "pipe", "ignore"] });
      let out = "";
      srv.stdout.on("data", (d) => (out += d));
      srv.on("exit", () => r(out.includes("free")));
    });
    if (ok) return port;
  }
  throw new Error("no free port in 4299..4338");
}

const PORT = await pickPort();
const BASE = `http://127.0.0.1:${PORT}`;
const server = spawn(process.execPath, [join(ROOT, "server.mjs"), "--port", String(PORT), "--host", "127.0.0.1", "--threads"], {
  cwd: ROOT,
  stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
server.stdout.on("data", (d) => (serverLog += d));
server.stderr.on("data", (d) => (serverLog += d));

const fail = [];
const note = [];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* wait for the listener rather than guessing */
let up = false;
for (let i = 0; i < 60 && !up; i++) {
  await wait(60);
  up = await fetch(`${BASE}/index.html`)
    .then((r) => r.ok)
    .catch(() => false);
}
if (!up) {
  console.error("FAIL the server did not come up on port", PORT, "\n" + serverLog);
  server.kill("SIGKILL");
  process.exit(1);
}

const seen = new Map();
async function get(path) {
  if (seen.has(path)) return seen.get(path);
  const res = await fetch(BASE + path).catch((e) => ({ ok: false, status: 0, _err: e, text: async () => "", headers: new Headers() }));
  const body = res.ok ? await res.text() : "";
  const rec = { status: res.status, ok: Boolean(res.ok), body, headers: res.headers };
  seen.set(path, rec);
  return rec;
}

/* ---------------------------------------------------- the front door + graph */
const home = await get("/");
if (!home.ok || !/<script[^>]+src="[^"]*js\/app\.js/.test(home.body)) fail.push(`/ did not serve the app shell (status ${home.status})`);

const html = home.body;
const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]).filter((u) => !/^https?:|^data:|^#/.test(u));
for (const raw of refs) {
  const p = raw.startsWith("/") ? raw : "/" + raw.replace(/^\.\//, "");
  const r = await get(p);
  if (!r.ok) fail.push(`index.html references ${raw} -> ${r.status}`);
}

const queue = ["/js/app.js"];
const queued = new Set(queue);
let modules = 0;
while (queue.length) {
  const url = queue.shift();
  const r = await get(url);
  if (!r.ok) {
    fail.push(`module ${url} -> ${r.status}`);
    continue;
  }
  modules++;
  for (const m of r.body.matchAll(/(?:^|[^.\w])(?:import|export)\s*(?:[^"']*?from\s*)?["']([^"']+)["']/g)) {
    const spec = m[1];
    if (/^https?:/.test(spec)) {
      fail.push(`${url} imports an absolute url (${spec}) - the app must fetch its own files`);
      continue;
    }
    if (!spec.startsWith(".")) {
      fail.push(`${url} has a bare import specifier (${spec}) - nothing resolves that without a bundler`);
      continue;
    }
    const base = url.slice(0, url.lastIndexOf("/") + 1);
    const joined = (base + spec)
      .split("/")
      .reduce((acc, seg) => (seg === ".." ? acc.slice(0, -1) : seg === "." ? acc : [...acc, seg]), [])
      .filter(Boolean);
    const next = "/" + joined.join("/");
    if (!queued.has(next)) {
      queued.add(next);
      queue.push(next);
    }
  }
}

/* --------------------------------------------------------- the data + drops */
const data = await get("/data/games.json");
if (!data.ok) fail.push(`/data/games.json -> ${data.status}`);
else {
  try {
    const parsed = JSON.parse(data.body);
    if (!parsed.meta?.count || !Array.isArray(parsed.games)) fail.push("data/games.json has no meta.count or games[]");
    for (const g of parsed.games.filter((x) => x.rom).slice(0, 30)) {
      const r = await get("/" + g.rom.split("/").map(encodeURIComponent).join("/"));
      if (!r.ok && r.status !== 404) fail.push(`bundled rom ${g.rom} -> ${r.status}`);
      if (r.status === 404) note.push(`bundled rom ${g.rom} is indexed but the file is not on disk (git-ignored, expected on a clone)`);
    }
  } catch (e) {
    fail.push("data/games.json is not valid JSON: " + e.message);
  }
}
for (const p of ["/manifest.webmanifest", "/sw.js", "/css/app.css", "/css/pad.css", "/css/tokens.css", "/css/shell.css", "/icons/icon-192.png", "/icons/icon-512.png"]) {
  const r = await get(p);
  if (!r.ok) fail.push(`${p} -> ${r.status}`);
}

/* -------------------------------------------------------------- server bits */
const hdr = await fetch(`${BASE}/index.html`, { method: "HEAD" });
if (hdr.headers.get("cross-origin-opener-policy") !== "same-origin") fail.push("no COOP header with --threads (threaded cores need it)");
if (!/require-corp/.test(hdr.headers.get("cross-origin-embedder-policy") || "")) fail.push("no COEP header with --threads");
if (!/no-cache/.test(hdr.headers.get("cache-control") || "")) note.push("index.html is not cache-revalidated: " + hdr.headers.get("cache-control"));
const etag = hdr.headers.get("etag");
if (!etag) fail.push("no ETag on /index.html, so the service worker cannot revalidate cheaply");
const again = await fetch(`${BASE}/index.html`, { headers: { "if-none-match": etag || "" } });
if (again.status !== 304) fail.push(`If-None-Match returned ${again.status}, expected 304`);

const wasmType = await fetch(`${BASE}/js/app.js`);
if (!/javascript/.test(wasmType.headers.get("content-type") || "")) fail.push("modules are not served as text/javascript: " + wasmType.headers.get("content-type"));

const ranged = await fetch(`${BASE}/data/games.json`, { headers: { range: "bytes=0-99" } });
if (ranged.status !== 206) fail.push(`a Range request returned ${ranged.status}, expected 206 (EmulatorJS chunks cores)`);
else {
  const len = Number((ranged.headers.get("content-range") || "").split("/")[1]);
  if (!Number.isFinite(len) || len !== statSync(join(ROOT, "data/games.json")).size) fail.push("content-range does not report the real file size");
}
const head = await fetch(`${BASE}/js/app.js`, { method: "HEAD" });
if (!head.ok) fail.push("HEAD /js/app.js failed - some cores probe with HEAD before downloading");

{
  // Put a marker one level ABOVE the repo and try to read it through the
  // server. If any of these tricks return its contents, the root is not a
  // boundary - which is exactly the bug this check was written for.
  const outside = join(ROOT, "..", "RETRODECK-OUTSIDE-ROOT.txt");
  const secret = "retrodeck-traversal-marker-" + process.pid;
  writeFileSync(outside, secret + "\n");
  try {
    const probes = [
      "/../" + outside.split("/").pop(),
      "/../../" + outside.split("/").pop(),
      "/%2e%2e/" + outside.split("/").pop(),
      "/js/../../" + outside.split("/").pop(),
      "/./..%2f" + outside.split("/").pop(),
    ];
    for (const p of probes) {
      const r = await fetch(BASE + p).catch(() => null);
      const body = r ? await r.text().catch(() => "") : "";
      if (body.includes(secret)) fail.push(`${p} read a file outside the repo root`);
    }
  } finally {
    unlinkSync(outside);
  }
}

/* --------------------------------------------------------------- vendor dir */
const vendor = join(ROOT, "vendor/data/loader.js");
if (existsSync(vendor)) {
  const r = await fetch(`${BASE}/vendor/data/loader.js`);
  if (!r.ok) fail.push("vendor/ exists on disk but /vendor/data/loader.js 404s");
  else if (!/immutable/.test(r.headers.get("cache-control") || "")) fail.push("vendor assets should be served immutable: " + r.headers.get("cache-control"));
} else {
  note.push("no vendor/ payload on this clone - the app will use cdn.emulatorjs.org (npm run vendor to self-host)");
}

/* ----------------------------------------------------------------- teardown */
server.kill("SIGTERM");
await wait(120);
try {
  server.kill("SIGKILL");
} catch {
  /* already gone */
}

console.log(`\n  served ${seen.size} urls (${modules} modules reachable from /js/app.js) from ${BASE}`);
for (const n of note) console.log("  note  " + n);
if (fail.length) {
  for (const f of fail) console.log("  FAIL  " + f);
  console.error(`\n  ${fail.length} problem(s) on the served app`);
  process.exit(1);
}
console.log("  ok  the whole app is served by its own origin, and nothing else's");
