/**
 * Mirror the EmulatorJS payload into `vendor/` so RetroDeck runs with no CDN and
 * no network at all - the difference between "works on my laptop" and "works on
 * a phone in a train, installed to the home screen".
 *
 *   npm run vendor                     the 13 cores the app's warm-cache offers
 *   npm run vendor -- --cores nes,gba   exactly these cores
 *   npm run vendor -- --all             every core the CDN has (hundreds of MB)
 *   npm run vendor -- --list            show what would be fetched and stop
 *   npm run vendor -- --base <url>      point at a mirror instead of the CDN
 *   npm run vendor -- --out <dir>       write somewhere else (used by tests)
 *
 * Files land in `vendor/data/` (or `--out <dir>`) with the same layout the CDN uses, because
 * `EJS_gameUrl`-style paths are resolved against that directory by the loader.
 * Existing files are kept (resume by size), and a manifest records what is
 * here so `npm run vendor` is idempotent and the app can tell you the truth
 * about being offline.
 *
 * Cores are licensed under their own terms (most are libretro: GPL-family). They
 * are NOT part of RetroDeck's MIT licence - see NOTICE.md.
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
let OUT = join(ROOT, "vendor");

const args = process.argv.slice(2);
const flag = (name, dflt = undefined) => {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return dflt;
  return args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : true;
};
const LIST = Boolean(flag("list", false));
const ALL = Boolean(flag("all", false));
const FORCE = Boolean(flag("force", false));
const VERSION = String(flag("version", "") || "");
const BASE = String(flag("base", "") || "");
const CORES_ARG = String(flag("cores", "") || "");
const OUT_ARG = flag("out", "");
if (typeof OUT_ARG === "string" && OUT_ARG) OUT = resolve(OUT_ARG);

/** The cores RetroDeck offers per system; the default download set. */
const DEFAULT_CORES = [
  "nes", "snes", "n64", "gambatte", "mgba", "vba_next", "mednafen_ngp", "mednafen_pce_fast",
  "genesis_plus_gx", "picodrive", "mednafen_supafaust", "fbneo", "prboom", "atari2600",
  "atari7800", "handy", "mednafen_wswan", "vice_x64", "pcsx_rearmed", "melonds", "parallel_n64",
];

const COMMON = [
  "loader.js",
  "version.json",
  "cover.png",
  "wasm/rt-wasm.js",
  "wasm/rt-wasm.data",
  "wasm/rt-wasm.shim.js",
];

async function main() {
  const { SYSTEMS } = await import("../js/data/systems.js");
  const known = new Set(SYSTEMS.flatMap((s) => (s.cores || []).map((c) => c.id)).concat(SYSTEMS.map((s) => s.ejsCore).filter(Boolean)));

  let cores = DEFAULT_CORES.filter((c) => known.has(c) || true);
  if (CORES_ARG) {
    cores = CORES_ARG.split(",").map((c) => c.trim()).filter(Boolean);
    const unknown = cores.filter((c) => !known.has(c));
    if (unknown.length) console.warn(`note: not referenced by any system in js/data/systems.js: ${unknown.join(", ")}`);
  }
  if (ALL) cores = [...known].sort();

  const files = [...COMMON];
  for (const core of cores) {
    files.push(`cores/${core}.js`, `cores/${core}.wasm`);
    // a couple of cores ship extra data or a second module
    if (/mupen|parallel|mednafen|fbneo|vice|prboom|pcsx|melonds|picodrive|genesis/.test(core)) {
      files.push(`cores/${core}.data`);
    }
  }

  const base = BASE || `https://cdn.emulatorjs.org/${VERSION || "stable"}/data/`;
  const urlFor = (rel) => `${base.replace(/\/$/, "")}/${rel}`;
  const destFor = (rel) => join(OUT, "data", rel);

  console.log(`EmulatorJS payload`);
  console.log(`  source  ${base}`);
  console.log(`  target  ${OUT}`);
  console.log(`  cores   ${cores.length}${ALL ? " (all known to this app)" : ""}`);
  console.log(`  files   ${files.length}`);

  if (LIST) {
    for (const f of files) console.log(`  - ${f}`);
    return;
  }

  // not every core ships the extra files, so a 404 on these is a shrug, not a failure
  const optional = (f) => /\.data$/.test(f) || f === "cover.png" || f === "wasm/rt-wasm.shim.js";
  // files the upstream does not actually publish: remembered between runs so a
  // second `npm run vendor` says "nothing to do" instead of re-404-ing them
  const knownMissing = new Set(prevManifest()?.optionalMissing || []);
  const have = [];
  const need = [];
  const skippedSoft = [];
  for (const f of files) {
    const dest = destFor(f);
    if (!FORCE && existsSync(dest) && statSync(dest).size > 0) have.push(f);
    else if (!FORCE && knownMissing.has(f)) skippedSoft.push(f);
    else need.push({ file: f, optional: optional(f) });
  }
  if (have.length) console.log(`  kept    ${have.length} file(s) already on disk (use --force to refetch)`);
  if (!need.length) {
    console.log("nothing to do - vendor/ is complete");
    writeManifest({ base, cores, files, fetched: 0, skipped: have.length, optionalMissing: skippedSoft });
    return;
  }

  console.log(`  fetch   ${need.length} file(s)`);
  const results = await downloadAll(need, urlFor, destFor, have.length);
  const soft = results.filter((r) => !r.ok && r.optional);
  const failed = results.filter((r) => !r.ok && !r.optional);
  const optionalMissing = [...new Set([...skippedSoft, ...soft.map((r) => r.file)])];
  writeManifest({ base, cores, files, fetched: results.length - failed.length, skipped: have.length, optionalMissing, failed: failed.map((f) => `${f.file}: ${f.error}`) });

  if (optionalMissing.length) console.log(`  note    ${optionalMissing.length} optional file(s) upstream does not publish (normal for .data / cover.png)`);
  if (failed.length) {
    console.error(`\n${failed.length} file(s) did not download:`);
    for (const f of failed.slice(0, 12)) console.error(`  - ${f.file}: ${f.error}`);
    console.error(`\nRe-run with --base <url> for a mirror, or --cores <list> for fewer files.`);
    process.exitCode = 1;
    return;
  }
  const bytes = results.reduce((a, r) => a + (r.size || 0), 0);
  console.log(`\ndone - ${(bytes / 1048576).toFixed(1)} MB in vendor/data/`);
  console.log('Now open Settings ▸ Emulator ▸ Payload source and pick "./vendor (self-hosted)".');
  console.log("Some cores want threads + SharedArrayBuffer: start the server with `npm run vendor:serve` (or node server.mjs --threads).");
}

async function downloadAll(files, urlFor, destFor, alreadyHave = 0) {
  const limit = 4;
  const queue = files.slice();
  const out = [];
  let done = 0;
  const total = files.length + alreadyHave;
  const progress = (file) => {
    if (process.stdout.isTTY) process.stdout.write(`\r  ${String(done).padStart(3)}/${total} ${file.slice(0, 46).padEnd(46)}`);
  };
  async function worker() {
    while (queue.length) {
      const job = queue.shift();
      const file = job.file || job;
      const url = urlFor(file);
      const dest = destFor(file);
      mkdirSync(dirname(dest), { recursive: true });
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const res = await fetch(url);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const size = Number(res.headers.get("content-length")) || 0;
          // one buffer per file: cores are tens of MB, and this keeps the tool
          // free of stream-interop surprises across node versions
          const buf = Buffer.from(await res.arrayBuffer());
          writeFileSync(dest, buf);
          const got = statSync(dest).size;
          if (!got) throw new Error("empty response");
          if (size && Math.abs(size - got) / size > 0.02) throw new Error(`size mismatch (got ${got} of ${size})`);
          out.push({ file, ok: true, size: got, url });
          done++;
          progress(file);
          break;
        } catch (err) {
          if (attempt === 2) {
            out.push({ file, ok: false, error: String(err.message || err), url, optional: Boolean(job.optional) });
            done++;
            progress(file);
          } else {
            await new Promise((r) => setTimeout(r, 400 * attempt));
          }
        }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, queue.length || 1) }, worker));
  if (process.stdout.isTTY) process.stdout.write("\r" + " ".repeat(70) + "\r");
  return out;
}

function prevManifest() {
  const p = join(OUT, "manifest.json");
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

function writeManifest(info) {
  const payload = {
    tool: "retrodeck/tools/vendor-emulatorjs.mjs",
    at: new Date().toISOString(),
    version: info.base.includes("cdn.emulatorjs.org") ? decodeURIComponent(info.base.split("/data/")[0].split("/").pop()) : "custom",
    source: info.base,
    cores: info.cores,
    files: info.files.length,
    fetched: info.fetched,
    skipped: info.skipped,
    optionalMissing: info.optionalMissing || [],
    failed: info.failed || [],
    licenceNote: "EmulatorJS and the cores are upstream works under their own licences; RetroDeck only downloads and serves them.",
  };
  try {
    const prev = existsSync(join(OUT, "manifest.json")) ? JSON.parse(readFileSync(join(OUT, "manifest.json"), "utf8")) : null;
    if (prev && prev.at === payload.at) payload.at = prev.at;
    payload.coresNote = prev?.coresNote;
  } catch {
    /* first run */
  }
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, "manifest.json"), JSON.stringify(payload, null, 2) + "\n");
}

try {
  await main();
} catch (err) {
  console.error(`vendor failed: ${err && err.message ? err.message : err}`);
  process.exit(1);
}
