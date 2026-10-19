#!/usr/bin/env node
/**
 * Builds two artifacts from the human-editable sources in data/source/:
 *
 *   data/games.json       - the browsable index (hundreds of entries, METADATA ONLY)
 *   js/data/games.generated.js - same data as an ES module, so the app runs
 *                                from file:// and from a static host without fetch
 *
 * IMPORTANT: this indexes *titles*, not files. It never reads, copies or links
 * to a ROM. Entries with a `rom` field are ones where a freely-licensed file
 * actually exists in homebrew/<system>/<rom> at build time (see NOTICE.md).
 *
 * Source line format (pipe separated, # = comment):
 *   system|Title|year|genre|players|rating|note
 *   note is optional; use it for "needs BIOS", "6-button", "link cable", etc.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, statSync } from "node:fs";
import { dirname, join, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const SRC = join(ROOT, "data", "source", "games.tsv");
const OUT_JSON = join(ROOT, "data", "games.json");
const OUT_MOD = join(ROOT, "js", "data", "games.generated.js");

/** Systems we know how to draw a controller for - imported straight from the app's
 *  own data module so the two can never drift apart. */
const KNOWN = new Set(
  (await import("../js/data/systems.js")).SYSTEMS.map((s) => s.id)
);

const GENRE_SLUG = {
  "Action": "action", "Platformer": "platform", "Racing": "racing", "Shooter": "shooter",
  "RPG": "rpg", "Puzzle": "puzzle", "Sports": "sports", "Fighting": "fighting",
  "Beat 'em up": "beat-em-up", "Strategy": "strategy", "Simulation": "simulation",
  "Adventure": "adventure", "Arcade": "arcade", "Stealth": "stealth",
  "Run 'n gun": "run-n-gun", "Rhythm": "rhythm", "Sandbox": "sandbox",
  "Pinball": "pinball", "Horror": "horror", "MMO": "mmo", "Educational": "educational",
  "Card/Board": "tabletop", "Metroidvania": "metroidvania", "Roguelike": "roguelike",
  "Traffic": "simulator",
};

const slug = (s) =>
  s.toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

function stableId(str) {
  // FNV-1a -> positive 53-bit-safe int, used for EJS_gameID (per-game save isolation)
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return (h % 2_000_000_000) + 1;
}

function readSystems() {
  return KNOWN;
}

const rows = [];
const problems = [];
const raw = readFileSync(SRC, "utf8");
raw.split(/\r?\n/).forEach((line, i) => {
  const text = line.trim();
  if (!text || text.startsWith("#")) return;
  const parts = text.split("|").map((p) => p.trim());
  if (parts.length < 6) {
    problems.push(`line ${i + 1}: expected 6-7 pipe-separated fields, got ${parts.length}`);
    return;
  }
  const [system, title, yearS, genre, playersS, ratingS, note] = parts;
  const year = Number(yearS);
  const players = Number(String(playersS).replace(/[^0-9+]/g, "")) || 1;
  const rating = Number(ratingS);
  if (!Number.isFinite(year) || year < 1972 || year > 2026)
    problems.push(`line ${i + 1}: bad year "${yearS}" for ${title}`);
  if (!Number.isFinite(rating) || rating < 0 || rating > 10)
    problems.push(`line ${i + 1}: bad rating "${ratingS}" for ${title}`);
  const known = readSystems();
  if (known && !known.has(system)) problems.push(`line ${i + 1}: unknown system "${system}" (${title})`);
  rows.push({ system, title, year, genre, players, rating, note: note || "" });
});

// --- dedupe (same system + same slug) ---------------------------------------
const seen = new Map();
for (const r of rows) {
  const key = `${r.system}/${slug(r.title)}`;
  if (seen.has(key)) {
    problems.push(`duplicate entry: ${key}`);
    continue;
  }
  seen.set(key, r);
}

/* --- index bundled, freely-licensed homebrew ---------------------------------
   Anything with a real ROM extension in homebrew/<system>/ becomes a catalogue
   row of its own (source "bundled") and gets a `rom` path the player can fetch
   from this origin. READMEs and dotfiles are ignored, and so is any file whose
   extension the deck does not accept for that system - a .txt in there is
   documentation, not a game. */
const bundled = new Map(); // `system/slug` -> { file, size, ext }
const hbRoot = join(ROOT, "homebrew");
if (existsSync(hbRoot)) {
  for (const sys of readdirSync(hbRoot).sort()) {
    const dir = join(hbRoot, sys);
    if (!statSync(dir).isDirectory()) continue;
    const def = (await import("../js/data/systems.js")).SYSTEM_BY_ID[sys];
    if (!def) {
      problems.push(`homebrew/${sys}/: no such system in js/data/systems.js - skipped`);
      continue;
    }
    const exts = new Set((def.exts || []).map((e) => String(e).toLowerCase()));
    for (const f of readdirSync(dir).sort()) {
      if (f.startsWith(".") || /^readme\.md$/i.test(f)) continue;
      const ext = (f.match(/\.([A-Za-z0-9]+)$/) || [])[1]?.toLowerCase();
      if (!ext || !exts.has(ext)) {
        problems.push(`homebrew/${sys}/${f}: .${ext || "?"} is not a ${def.name} extension - skipped`);
        continue;
      }
      const key = `${sys}/${slug(f.replace(/\.[^.]+$/, ""))}`;
      let size = 0;
      try {
        size = statSync(join(dir, f)).size;
      } catch {
        /* size is only for the label */
      }
      bundled.set(key, { file: f, size, ext });
    }
  }
}

const claimed = new Set();

const games = [...seen.values()]
  .map((r) => {
    const id = slug(r.title);
    const key = `${r.system}/${id}`;
    const file = bundled.get(key);
    if (file) claimed.add(key);
    return {
      id: key,
      db: stableId(key), // numeric id for the emulator's per-game storage
      system: r.system,
      title: r.title,
      year: r.year,
      genre: r.genre,
      genreSlug: GENRE_SLUG[r.genre] || slug(r.genre),
      players: r.players,
      rating: r.rating,
      note: r.note,
      source: file ? "bundled" : "own",
      rom: file ? `homebrew/${r.system}/${file.file}` : null,
      tags: deriveTags(r),
    };
  })
  .sort((a, b) => a.system.localeCompare(b.system) || b.rating - a.rating || a.title.localeCompare(b.title));

// files nobody matched by title still deserve a row of their own
for (const [key, file] of bundled) {
  if (claimed.has(key)) continue;
  const [sys] = key.split("/");
  const title = basename(file.file).replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim() || key;
  games.push({
    id: key,
    db: stableId(key),
    system: sys,
    title,
    year: null,
    genre: "Homebrew",
    genreSlug: "homebrew",
    players: 1,
    rating: null,
    note: `bundled file (${fmtSize(file.size)}) - free to ship`,
    source: "bundled",
    rom: `homebrew/${sys}/${file.file}`,
    tags: ["homebrew"],
  });
  claimed.add(key);
}

function fmtSize(n) {
  if (!n) return "unknown size";
  const u = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v < 10 && i ? v.toFixed(1) : Math.round(v)}${u[i]}`;
}

function deriveTags(r) {
  const t = [];
  if (r.players > 1) t.push(" multiplayer");
  if (/local co-op|co-op/i.test(r.note)) t.push("co-op");
  if (/link cable/i.test(r.note)) t.push("link-cable");
  if (/needs bios|bios/i.test(r.note)) t.push("needs-bios");
  if (/6-button/i.test(r.note)) t.push("6-button");
  if (/rumble|pak/i.test(r.note)) t.push("expansion-pak");
  if (/saving|battery/i.test(r.note)) t.push("battery-save");
  if (/not for kids|horror|mature/i.test(r.note)) t.push("mature");
  if (/^(segaMD|arcade|neo|fbneo|neogeo)/.test(r.system) && /arcade/i.test(r.genre)) t.push("arcade");
  if (/platform|metroidvania/i.test(r.genre)) t.push("platformer");
  if (/puzzle/i.test(r.genre)) t.push("puzzle");
  if (/racing/i.test(r.genre)) t.push("racing");
  return t.map((s) => s.trim());
}

// --- emit --------------------------------------------------------------------
const bySystem = {};
for (const g of games) (bySystem[g.system] ||= []).push(g.id);

const payload = {
  meta: {
    built: new Date().toISOString().slice(0, 10),
    count: games.length,
    systems: Object.keys(bySystem).length,
    note: "Metadata index only. No ROMs are shipped, hosted or linked. See NOTICE.md.",
  },
  counts: Object.fromEntries(Object.entries(bySystem).map(([k, v]) => [k, v.length])),
  games,
};

mkdirSync(dirname(OUT_JSON), { recursive: true });
writeFileSync(OUT_JSON, JSON.stringify(payload, null, 2));

mkdirSync(dirname(OUT_MOD), { recursive: true });
writeFileSync(
  OUT_MOD,
  `/* GENERATED by tools/build-catalog.mjs - do not edit by hand.\n` +
    ` * Edit data/source/games.tsv and run \`npm run build\`.\n` +
    ` * Metadata only: no ROM data is embedded or referenced here. */\n` +
    `export const META = ${JSON.stringify(payload.meta)};\n` +
    `export const COUNTS = ${JSON.stringify(payload.counts)};\n` +
    `export const GAMES = ${JSON.stringify(games)};\n`
);

const tally = Object.entries(bySystem)
  .map(([k, v]) => `${k}:${v.length}`)
  .join("  ");
console.log(`catalog: ${games.length} titles across ${Object.keys(bySystem).length} systems`);
console.log(`         ${tally}`);
if (bundled.size) console.log(`bundled homebrew indexed: ${bundled.size} file(s) in homebrew/`);
if (problems.length) {
  console.warn(`\n${problems.length} problem(s):`);
  for (const p of problems.slice(0, 25)) console.warn("  - " + p);
  process.exitCode = 1;
}
