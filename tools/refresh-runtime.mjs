/**
 * Snapshot what the EmulatorJS runtime actually is, so the app's data can be
 * checked against something other than my memory of it.
 *
 *   node tools/refresh-runtime.mjs
 *
 * Writes `data/source/emulatorjs.json`:
 *   channels     the version directories on the CDN (Settings ▸ Emulator ▸ Channel)
 *   stableVersion  what `stable` points at right now
 *   cores        every core `EJS_core` may be set to, with the extensions it reads
 *
 * `js/data/systems.js` names one of these cores per deck, and `npm test` fails if
 * any deck's `ejsCore` / `cores[].id` is not in this list. Upstream renames things;
 * when it does, run this, fix the deck that drifted, and commit both files together.
 * `npm run vendor` reads the same file to refuse a typo before it downloads 40 MB.
 */
import { writeFileSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.argv.includes("--base") ? process.argv[process.argv.indexOf("--base") + 1] : "https://cdn.emulatorjs.org";
const OUT = join(ROOT, "data", "source", "emulatorjs.json");

const get = async (path) => {
  const res = await fetch(`${BASE.replace(/\/$/, "")}${path}`, { headers: { accept: "application/json, text/html" } });
  if (!res.ok) throw new Error(`GET ${path} -> HTTP ${res.status}`);
  return res;
};

const cores = await (await get("/stable/data/cores/cores.json")).json();
const version = await (await get("/stable/data/version.json")).json();
const index = await (await get("/")).text();

// The index is a plain directory listing; each release is a `4.2.3/` link. Anchor
// on the href so a version number mentioned in prose cannot become a channel.
// The index is a plain directory listing; each release is an `href="4.2.3/"` link.
// Splitting on quotes means no regex at all, so a version number in prose cannot
// become a channel.
const versions = [...new Set(index.split('"').map((v) => (v.match(/^\.?\/?(\d+\.\d+\.\d+)\/$/) || [])[1]).filter(Boolean))]
  .sort((a, b) => {
    const A = a.split(".").map(Number);
    const B = b.split(".").map(Number);
    return A[0] - B[0] || A[1] - B[1] || A[2] - B[2];
  });

const payload = {
  source: BASE,
  retrieved: new Date().toISOString().slice(0, 10),
  stableVersion: version?.version || null,
  channels: ["stable", ...versions.slice(-6).reverse()],
  cores: (cores || []).map((c) => ({ name: c.name, extensions: c.extensions || [] })),
};
if (!payload.cores.length) throw new Error("empty core list - upstream changed data/cores/cores.json, refusing to write a snapshot that would clear the checks");

const prev = (() => { try { return JSON.parse(readFileSync(OUT, "utf8")); } catch { return null; } })();
writeFileSync(OUT, JSON.stringify(payload, null, 1) + "\n");
const added = payload.cores.map((c) => c.name).filter((n) => !prev?.cores?.some((p) => p.name === n));
const gone = (prev?.cores || []).map((c) => c.name).filter((n) => !payload.cores.some((p) => p.name === n));
console.log(`data/source/emulatorjs.json`);
console.log(`  stable    ${payload.stableVersion}`);
console.log(`  channels  ${payload.channels.join(", ")}`);
console.log(`  cores     ${payload.cores.length}${prev ? ` (${payload.cores.length - prev.cores.length >= 0 ? "+" : ""}${payload.cores.length - prev.cores.length} vs the snapshot on disk)` : ""}`);
if (added.length) console.log(`  new       ${added.join(", ")}`);
if (gone.length) console.log(`  gone      ${gone.join(", ")}  <- decks pointing at these must be retargeted`);
if (!gone.length && !added.length && prev) console.log("  unchanged from the snapshot on disk");
