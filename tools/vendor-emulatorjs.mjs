/**
 * Mirror the EmulatorJS payload into `vendor/` so RetroDeck runs with no CDN and
 * no network at all - the difference between "works on my laptop" and "works on
 * a phone in a train, installed to the home screen".
 *
 *   npm run vendor                      every core this app's decks boot by default
 *   npm run vendor -- --cores gambatte   exactly these cores (comma separated)
 *   npm run vendor -- --all              every core the CDN has (hundreds of MB)
 *   npm run vendor -- --threads          also mirror the -thread- build of each core
 *
 * What a mirror is made of, per the layout upstream actually publishes (checked
 * against https://cdn.emulatorjs.org/stable/data/, and recorded in
 * data/source/emulatorjs.json): the runtime is three files next to the loader -
 * loader.js, emulator.min.js, emulator.min.css - and each core is ONE blob,
 * data/cores/<name>-wasm.data, with -thread- and -legacy- siblings for browsers
 * with or without SharedArrayBuffer. There are no per-core .js/.wasm pairs and no
 * data/wasm/ directory; a tool that asked for those would mirror nothing at all.
 *   npm run vendor -- --list            show what would be fetched and stop
 *   npm run vendor -- --base <url>      point at a mirror instead of the CDN
 *   npm run vendor -- --full            every core any deck can be configured to use
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
const THREADS = Boolean(flag("threads", false));
const LEGACY = Boolean(flag("legacy", false));
const FULL = Boolean(flag("full", false));
const FORCE = Boolean(flag("force", false));
const VERSION = String(flag("version", "") || "");
const BASE = String(flag("base", "") || "");
const CORES_ARG = String(flag("cores", "") || "");
const OUT_ARG = flag("out", "");
if (typeof OUT_ARG === "string" && OUT_ARG) OUT = resolve(OUT_ARG);

/** What every boot needs, whatever the game is. */
const COMMON = ["loader.js", "emulator.min.js", "emulator.min.css", "version.json", "cores/cores.json"];

/** Suffix of the core blob, by build flavour. */
const FLAVOUR = { plain: "-wasm.data", thread: "-thread-wasm.data", legacy: "-legacy-wasm.data" };

/**
 * The cores this app can boot, in deck order, deduped. Default is what each deck
 * actually starts with; `--full` adds the alternates the config form offers, so a
 * mirror can be as small as "the 24 cores I play" or as wide as the whole app.
 */
function deckCores(systems, withAlts = false) {
  const out = [];
  const push = (c) => { if (c && c !== "auto" && !out.includes(c)) out.push(c); };
  for (const s of systems) {
    push(s.ejsCore);
    if (withAlts) for (const c of (s.cores || []).map((x) => x.id)) push(c);
  }
  return out;
}

async function main() {
  const { SYSTEMS } = await import("../js/data/systems.js");
  const offered = deckCores(SYSTEMS, true);
  // Upstream's own list, when the snapshot is in the repo: a core name that is not
  // in it cannot be mirrored, so say that before downloading anything.
  let published = null;
  try {
    published = new Set(JSON.parse(readFileSync(join(ROOT, "data", "source", "emulatorjs.json"), "utf8")).cores.map((c) => c.name));
  } catch {
    /* snapshot missing (fresh checkout without data/source?) - fall back to trusting the name */
  }

  let cores = FULL ? deckCores(SYSTEMS, true) : deckCores(SYSTEMS);
  if (CORES_ARG) cores = CORES_ARG.split(",").map((c) => c.trim()).filter(Boolean);
  if (ALL) cores = published ? [...published].sort() : offered;
  const bogus = published ? cores.filter((c) => !published.has(c)) : [];
  if (bogus.length && !FORCE) {
    console.error(`\n${bogus.length} name(s) are not cores EmulatorJS publishes: ${bogus.join(", ")}`);
    console.error("Cores are named after the emulator (gambatte, snes9x, fceumm), not the console (gb, snes, nes).");
    console.error("data/source/emulatorjs.json is the list; --force mirrors what you asked for anyway.");
    process.exit(1);
  }
  // The coreless decks (ejsCore: null) are how a console with no upstream core is
  // represented; they must never reach the download list as the string "null".
  cores = cores.filter(Boolean);

  const flavours = THREADS ? ["plain", "thread"] : ["plain"];
  const files = [...COMMON];
  for (const core of cores) for (const f of flavours) files.push(`cores/${core}${FLAVOUR[f]}`);
  if (LEGACY) for (const core of cores) files.push(`cores/${core}${FLAVOUR.legacy}`);

  const base = BASE || `https://cdn.emulatorjs.org/${VERSION || "stable"}/data/`;
  const urlFor = (rel) => `${base.replace(/\/$/, "")}/${rel}`;
  const destFor = (rel) => join(OUT, "data", rel);

  console.log(`EmulatorJS payload`);
  console.log(`  source  ${base}`);
  console.log(`  target  ${OUT}`);
  console.log(`  cores   ${cores.length}${ALL ? " (everything upstream has)" : CORES_ARG || FULL ? "" : " (each deck's default; --full adds the alternates)"}`);
  console.log(`  files   ${files.length}`);

  if (LIST) {
    for (const f of files) console.log(`  - ${f}`);
    return;
  }

  // not every core ships the extra files, so a 404 on these is a shrug, not a failure
  // The plain blob is what a core is; a flavour a browser cannot use is simply
  // not published for that core, which is a shrug and not a failed mirror.
  const optional = (f) => !/-wasm\.data$/.test(f) || /-(thread|legacy)-wasm\.data$/.test(f);
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

  if (optionalMissing.length) console.log(`  note    ${optionalMissing.length} optional flavour(s) not published for those cores (thread/legacy builds)`);
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
    layout: "cores/<name>-wasm.data (+ -thread-/-legacy- siblings), loader.js, emulator.min.{js,css}, cores/cores.json",
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
