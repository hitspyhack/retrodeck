/**
 * RetroDeck static dev/preview server.
 *
 * Deliberately dependency-free: `node server.mjs` must work on a fresh clone
 * with no `npm install` step, on a laptop, a Raspberry Pi or a shared host.
 *
 * Things the emulator needs that a naive `python -m http.server` gets wrong:
 *   1. correct MIME for .wasm / .mjs (otherwise WASM cores refuse to compile)
 *   2. `stream` response type + streaming, so 40MB of WASM core doesn't have to
 *      be buffered in RAM
 *   3. ETag + working HEAD requests, so EmulatorJS' IndexedDB core cache can
 *      revalidate instead of re-downloading
 *   4. COOP/COEP headers, which enable SharedArrayBuffer => threaded cores
 *      (N64/PS1/Dolphin class workloads), opt-in with --threads
 *   5. bind 0.0.0.0 by default, so a phone on the same Wi-Fi can reach it
 */

import { createServer } from "node:http";
import { createReadStream, promises as fs } from "node:fs";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { statSync } from "node:fs";

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  return argv[i + 1] ?? true;
};

/* Serve the folder this script lives in - the repo root - unless --root says
   otherwise. (An earlier draft sat in tools/ and walked up a level, which made
   the whole workspace readable and the site answer 404 at "/".) */
const ROOT = resolve(String(arg("root", dirname(fileURLToPath(import.meta.url)))));
const PORT = Number(arg("port", process.env.PORT || 4173));
const HOST = String(arg("host", process.env.HOST || "0.0.0.0"));
const THREADS = argv.includes("--threads");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".wasm": "application/wasm",
  ".map": "application/json",
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  // cartridge / disc images - served inline so fetch() can read them
  ".nes": "application/octet-stream",
  ".fds": "application/octet-stream",
  ".sfc": "application/octet-stream",
  ".smc": "application/octet-stream",
  ".gb": "application/octet-stream",
  ".gbc": "application/octet-stream",
  ".gba": "application/octet-stream",
  ".agb": "application/octet-stream",
  ".n64": "application/octet-stream",
  ".z64": "application/octet-stream",
  ".v64": "application/octet-stream",
  ".u64": "application/octet-stream",
  ".ndd": "application/octet-stream",
  ".bin": "application/octet-stream",
  ".gen": "application/octet-stream",
  ".smd": "application/octet-stream",
  ".cue": "text/plain; charset=utf-8",
  ".chd": "application/octet-stream",
  ".iso": "application/octet-stream",
  ".pbp": "application/octet-stream",
  ".sms": "application/octet-stream",
  ".gg": "application/octet-stream",
  ".a26": "application/octet-stream",
  ".lnx": "application/octet-stream",
  ".ngp": "application/octet-stream",
  ".ws": "application/octet-stream",
  ".wsc": "application/octet-stream",
  ".pce": "application/octet-stream",
  ".nds": "application/octet-stream",
  ".zip": "application/zip",
  ".7z": "application/x-7z-compressed",
  ".gz": "application/gzip",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
};

const etagCache = new Map();

function etagFor(path) {
  const st = statSync(path);
  const key = `${path}:${st.mtimeMs}:${st.size}`;
  let tag = etagCache.get(key);
  if (!tag) {
    tag = `W/"${createHash("sha1").update(key).digest("base64url").slice(0, 24)}"`;
    if (etagCache.size > 4000) etagCache.clear();
    etagCache.set(key, tag);
  }
  return tag;
}

/** Resolve a URL path inside ROOT, refusing traversal. */
function safePath(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath.split("?")[0].split("#")[0]);
  } catch {
    return null;
  }
  if (decoded.includes("\0")) return null;
  const rel = normalize(decoded).replace(/^(\.\.[/\\])+/, "");
  const abs = resolve(join(ROOT, rel));
  if (abs !== ROOT && !abs.startsWith(ROOT + sep)) return null;
  return abs;
}

const server = createServer(async (req, res) => {
  const send = (code, body, headers = {}) => {
    res.writeHead(code, { "content-length": Buffer.byteLength(body), ...headers });
    res.end(req.method === "HEAD" ? undefined : body);
  };

  let abs = safePath(req.url === "/" ? "/index.html" : req.url);
  if (!abs) return send(400, "Bad request", { "content-type": "text/plain" });

  try {
    let st = await fs.stat(abs).catch(() => null);
    if (st?.isDirectory()) {
      abs = join(abs, "index.html");
      st = await fs.stat(abs).catch(() => null);
    }
    if (!st?.isFile()) {
      // extensionless route -> app shell (the router is hash-based, but direct
      // deep links like /play/42 are handy to keep alive)
      const fallback = join(ROOT, "index.html");
      if (await fs.stat(fallback).catch(() => null)) {
        abs = fallback;
        st = statSync(fallback);
      } else {
        return send(404, "Not found", { "content-type": "text/plain" });
      }
    }

    const etag = etagFor(abs);
    if (req.headers["if-none-match"] === etag) {
      return send(304, "", { etag, "cache-control": "no-cache" });
    }

    const ext = extname(abs).toLowerCase();
    const headers = {
      "content-type": MIME[ext] || "application/octet-stream",
      "content-length": st.size,
      etag,
      // cores are immutable in production; dev should always revalidate
      "cache-control": abs.includes(`${sep}vendor${sep}`)
        ? "public, max-age=31536000, immutable"
        : "no-cache",
      "accept-ranges": "bytes",
    };
    if (THREADS) {
      headers["cross-origin-opener-policy"] = "same-origin";
      headers["cross-origin-embedder-policy"] = "require-corp";
      // That pair is the whole requirement: `crossOriginIsolated` is true only when
      // both are present (and the context is trustworthy). Do NOT add
      // `Permissions-Policy: cross-origin-isolated=...` to "help" - the feature is
      // derived from the two headers above, and a permissions-policy entry for it
      // with a value the parser rejects (which is what an earlier version of this
      // line did) *denies* it: chromium then reports crossOriginIsolated=false and
      // SharedArrayBuffer is gone, so every threaded core silently falls back.
      // tools/browser-check.mjs asserts isolation, which is how that was found.
    }

    // Range support: EmulatorJS issues ranged reads for large cores/disc images
    const range = req.headers.range;
    if (range && /^bytes=\d*-\d*$/.test(range) && !st.isDirectory()) {
      const [startS, endS] = range.replace("bytes=", "").split("-");
      const start = startS ? Number(startS) : 0;
      const end = endS ? Math.min(Number(endS), st.size - 1) : st.size - 1;
      if (start > end) return send(416, "", { "content-range": `bytes */${st.size}`, ...headers });
      res.writeHead(206, {
        ...headers,
        "content-length": end - start + 1,
        "content-range": `bytes ${start}-${end}/${st.size}`,
      });
      if (req.method === "HEAD") return res.end();
      return createReadStream(abs, { start, end }).pipe(res);
    }

    if (req.method === "HEAD") return send(200, "", headers);

    res.writeHead(200, headers);
    createReadStream(abs).pipe(res);
  } catch (err) {
    send(500, "server error", { "content-type": "text/plain" });
    console.error(err);
  }
});

server.listen(PORT, HOST, () => {
  const shown = HOST === "0.0.0.0" ? "localhost" : HOST;
  console.log(`\n  RetroDeck  •  ${ROOT}`);
  console.log(`  → http://${shown}:${PORT}/   (bound to ${HOST}:${PORT}${THREADS ? ", threaded cores on" : ""})`);
  console.log(`  On your phone: open the LAN address shown by \`ifconfig\` on port ${PORT}.\n`);
});
