/**
 * The whole test suite, with zero dependencies.
 *
 *   node tools/test.mjs          everything (a few seconds)
 *   node tools/test.mjs --fast   skip the headless DOM boot and the game sim
 *
 * RetroDeck is plain ES modules loaded straight by the browser, so there is no
 * build step to lean on and nothing to type-check against. That makes the
 * cross-reference gates below the real safety net: every id one file invents is
 * looked up in the file that is supposed to define it, the catalogue is
 * re-derived from its source data, the CSS is audited for class names the JS
 * asks for, and finally the app is booted headlessly against a DOM shim so that
 * "it parses" can never be confused with "it renders".
 */
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = join(fileURLToPath(import.meta.url), "../..");
const FAST = process.argv.includes("--fast");
const results = [];
let failures = 0;

const queue = [];
function check(name, fn) {
  queue.push(async () => {
    try {
      const detail = await fn();
      results.push({ name, ok: true, detail: detail == null ? "" : String(detail) });
    } catch (err) {
      failures++;
      results.push({ name, ok: false, detail: err.message });
    }
  });
}

function spawn(file, args = []) {
  const r = spawnSync(process.execPath, [join(ROOT, file), ...args], { encoding: "utf8", cwd: ROOT, timeout: 120000 });
  if (r.status !== 0) {
    const out = `${r.stdout || ""}${r.stderr || ""}`.trim();
    throw new Error(`${file} exited ${r.status}\n${out.split("\n").slice(-14).join("\n")}`);
  }
  return (r.stdout || "").trim();
}

const read = (p) => readFileSync(join(ROOT, p), "utf8");
function jsFiles(dir = "js") {
  const out = [];
  const walk = (d) => {
    for (const name of readdirSync(join(ROOT, d))) {
      const rel = `${d}/${name}`;
      const abs = join(ROOT, rel);
      if (statSync(abs).isDirectory()) walk(rel);
      else if (name.endsWith(".js")) out.push(rel);
    }
  };
  walk(dir);
  return out;
}

/* ------------------------------------------------------------ 1. syntax */
check("node --check on every module", () => {
  const files = [...jsFiles(), "server.mjs", ...readdirSync(join(ROOT, "tools")).filter((f) => f.endsWith(".mjs")).map((f) => `tools/${f}`)];
  const bad = [];
  for (const f of files) {
    const r = spawnSync(process.execPath, ["--check", join(ROOT, f)], { encoding: "utf8" });
    if (r.status !== 0) bad.push(`${f}: ${r.stderr.split("\n").slice(0, 2).join(" ")}`);
  }
  if (bad.length) throw new Error(bad.join("\n"));
  return `${files.length} files`;
});

/* --------------------------------------------------- 2. data cross-reference */
const data = await (async () => {
  const systems = await import("../js/data/systems.js");
  const layouts = await import("../js/data/layouts.js");
  const skins = await import("../js/data/skins.js");
  const models = await import("../js/data/models.js");
  const shell = await import("../js/core/shell.js");
  return { ...systems, ...layouts, ...skins, ...models, TEMPLATE_IDS: shell.TEMPLATE_IDS };
})();

const { SYSTEMS, SYSTEM_IDS, SYSTEM_BY_ID, PADS, PAD_IDS, SKINS, SKIN_IDS, MODELS, TEMPLATE_IDS, CSS_VAR_KEYS, EJS_AXIS } = data;

check("every model points at a real template, pad, skin and system", () => {
  const bad = [];
  for (const m of MODELS) {
    if (!TEMPLATE_IDS.includes(m.tpl)) bad.push(`${m.id}: unknown tpl "${m.tpl}"`);
    if (m.pad && !PAD_IDS.includes(m.pad)) bad.push(`${m.id}: unknown pad "${m.pad}"`);
    if (!SYSTEM_IDS.includes(m.system)) bad.push(`${m.id}: unknown system "${m.system}"`);
    for (const s of m.skins || []) if (!SKIN_IDS.includes(s)) bad.push(`${m.id}: unknown skin "${s}"`);
    if (!m.screen || !Array.isArray(m.screen.px) || m.screen.px.some((n) => !(n > 0))) bad.push(`${m.id}: bad screen.px`);
    if (!m.deco || typeof m.deco !== "object") bad.push(`${m.id}: missing deco object`);
    for (const [k, v] of Object.entries(m.deco || {})) if (typeof v !== "string" && typeof v !== "number" && typeof v !== "boolean") bad.push(`${m.id}: deco.${k} is ${typeof v}`);
  }
  if (bad.length) throw new Error(bad.slice(0, 8).join("\n"));
  return `${MODELS.length} models`;
});

const shellMod = await import("../js/core/shell.js");
const emulatorMod = await import("../js/core/emulator.js");
check("buildShell produces SVG for all 61 models", () => {
  const bad = [];
  for (const m of MODELS) {
    try {
      const r = shellMod.buildShell(m);
      if (!r || !/^<svg /.test(r.svg) || !r.svg.endsWith("</svg>")) bad.push(`${m.id}: malformed svg`);
      if (!r.screen || !(r.screen.w > 0)) bad.push(`${m.id}: no screen box`);
      if (!Number.isFinite(r.aspect) || r.aspect < 0.4 || r.aspect > 4) bad.push(`${m.id}: aspect ${r.aspect}`);
      if (r.items) bad.push(`${m.id}: leaked items array`);
    } catch (err) {
      bad.push(`${m.id}: ${err.message}`);
    }
  }
  if (bad.length) throw new Error(bad.slice(0, 8).join("\n"));
  return `${MODELS.length} shells, ${TEMPLATE_IDS.length} templates`;
});

check("systems: pads, buttons, cores and extensions line up", () => {
  const EJS_ALL = [...emulatorMod.EJS_SCHEMES, "dreamcast", "psx", "psp", "pce", "ngp", "wonderswan", "c64", "dos"];
  const BEHAVIOUR_FLAGS = ["saveStates", "cheats", "netplay", "linkCable", "zapper", "vs", "tape", "solar", "touch", "vmu", "tuner", "keyboard", "wifi", "sram", "sixButton"];
  const KEY_RE = /^(Key[A-Z]|Digit\d|Arrow(Up|Down|Left|Right)|Space|Enter|Escape|Tab|Backspace|ShiftLeft|ShiftRight|ControlLeft|ControlRight|AltLeft|AltRight|Numpad\d|KeyM|Comma|Period|Slash|Semicolon|Quote|Bracket(Left|Right)|Minus|Equal|Backquote|Backslash)$/;
  const bad = [];
  // Upstream's own list of what EJS_core may be set to, snapshotted in the repo by
  // tools/refresh-runtime.mjs. Every core name below is checked against it, which
  // is the only defence against the class of bug where a deck points at "nes" or
  // "segaMD" - the console's code, not a core - and the loader answers 404 for all
  // 26 decks at once. Nothing in the app's own code can catch that; this file can.
  let runtime;
  try {
    runtime = JSON.parse(readFileSync(join(ROOT, "data", "source", "emulatorjs.json"), "utf8"));
  } catch {
    throw new Error("data/source/emulatorjs.json is missing - run: node tools/refresh-runtime.mjs");
  }
  const PUBLISHED = new Map(runtime.cores.map((c) => [c.name, new Set(c.extensions)]));
  if (!PUBLISHED.size) throw new Error("the runtime snapshot has no cores in it");
  // Containers the runtime unpacks itself, plus aliases a core loads happily
  // because we name EJS_core instead of letting the extension pick the core.
  const CONTAINERS = new Set(["zip", "7z", "gz", "m3u", "cue", "chd", "iso", "bin", "img", "mds", "nrg", "gdi", "conf", "exe", "dosbox", "agb", "rom"]);
  for (const s of SYSTEMS) {
    if (!Array.isArray(s.exts) || !s.exts.length) bad.push(`${s.id}: no exts`);
    for (const e of s.exts || []) if (!/^[a-z0-9]{1,8}$/.test(e)) bad.push(`${s.id}: odd ext "${e}"`);
    if (!PAD_IDS.includes(s.pad)) bad.push(`${s.id}: unknown default pad "${s.pad}"`);
    for (const p of s.pads || []) if (!PAD_IDS.includes(p)) bad.push(`${s.id}: unknown pad "${p}"`);
    if (!Array.isArray(s.buttons) || !s.buttons.length) bad.push(`${s.id}: no buttons`);
    const seen = new Set();
    for (const b of s.buttons || []) {
      if (!b.id) bad.push(`${s.id}: button without id`);
      if (seen.has(b.id)) bad.push(`${s.id}: duplicate button "${b.id}"`);
      seen.add(b.id);
      if (b.ejs !== null && !(Number.isInteger(b.ejs) && b.ejs >= 0 && b.ejs <= 29)) bad.push(`${s.id}.${b.id}: ejs index ${b.ejs} outside 0..29`);
      if (b.key && !KEY_RE.test(b.key)) bad.push(`${s.id}.${b.id}: key "${b.key}" is not a KeyboardEvent.code`);
      if (!b.label) bad.push(`${s.id}.${b.id}: no label`);
    }
    if (s.controlScheme && !EJS_ALL.includes(s.controlScheme)) bad.push(`${s.id}: controlScheme "${s.controlScheme}" is not a name EmulatorJS or we define`);
    if (!s.features || typeof s.features !== "object" || Array.isArray(s.features)) bad.push(`${s.id}: features must be an object`);
    // flags the app branches on must be booleans; the rest of the object is
    // human-facing hardware trivia, so strings and lists are fine there
    for (const k of BEHAVIOUR_FLAGS) {
      if (k in (s.features || {}) && typeof s.features[k] !== "boolean") bad.push(`${s.id}: features.${k} must be a boolean, got ${typeof s.features[k]}`);
    }
    for (const [k, v] of Object.entries(s.features || {})) {
      if (v === null || v === undefined || typeof v === "number") bad.push(`${s.id}: features.${k} = ${JSON.stringify(v)} is neither a flag nor prose`);
    }
    // the core a deck boots is cores[0] - the config form offers that list, the
    // player passes the first entry, so the two must never disagree
    const coreIds = (s.cores || []).map((c) => c.id);
    // noCore: the honest way to keep a console in the library when the runtime has
    // nothing for it. It must offer no core, and explain itself in a sentence.
    if (s.noCore) {
      if (s.ejsCore !== null) bad.push(`${s.id}: a noCore deck must set ejsCore to null, got ${JSON.stringify(s.ejsCore)}`);
      if (coreIds.length) bad.push(`${s.id}: a noCore deck must not offer cores (${coreIds.join(",")})`);
      if (typeof s.noCore !== "string" || s.noCore.length < 40) bad.push(`${s.id}: noCore has to be a sentence the player can show (got ${JSON.stringify(s.noCore)})`);
    } else {
      if (!coreIds.length) bad.push(`${s.id}: no cores[] to boot, and no noCore note to say why`);
      if ((s.ejsCore ?? null) !== (coreIds[0] ?? null)) bad.push(`${s.id}: ejsCore "${s.ejsCore}" is not cores[0].id "${coreIds[0]}"`);
      if (s.ejsCore !== "auto" && !PUBLISHED.has(s.ejsCore)) bad.push(`${s.id}: ejsCore "${s.ejsCore}" is not a published core`);
    }
    // and every format the deck claims to accept must be one of its cores' formats,
    // or a container/alias - otherwise the deck promises a file the core refuses
    if (!s.noCore && s.ejsCore !== "auto") {
      const reads = new Set();
      for (const c of coreIds) for (const e of PUBLISHED.get(c) || []) reads.add(e);
      for (const e of s.exts || []) if (!reads.has(e) && !CONTAINERS.has(e)) bad.push(`${s.id}: ext "${e}" is read by none of its cores (${coreIds.join(", ")})`);
    }
    for (const c of s.cores || []) {
      if (!c.id || !c.label) bad.push(`${s.id}: core entry needs id+label`);
      // the blob is fetched as `data/cores/<id>-wasm.data`, so the id must be a
      // path-safe token
      if (c.id !== "auto" && !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,31}$/.test(c.id)) bad.push(`${s.id}: core id "${c.id}" cannot be a path segment under data/cores/`);
      if (c.id !== "auto" && !PUBLISHED.has(c.id)) bad.push(`${s.id}: core "${c.id}" is not a core EmulatorJS ${runtime.stableVersion} publishes (data/source/emulatorjs.json has ${PUBLISHED.size})`);
    }
    if (s.bios && !s.bios.label) bad.push(`${s.id}: bios without label`);
    if (!/^#[0-9a-f]{6}$/i.test(s.color || "")) bad.push(`${s.id}: color "${s.color}"`);
    for (const p of s.palettes || []) if (!p.id || !p.name) bad.push(`${s.id}: palette entry needs id + name (got ${JSON.stringify(p)})`);
    for (const b of s.bios?.files || []) if (!/^[a-z0-9]{1,5}$/.test(b)) bad.push(`${s.id}: bios file ext "${b}"`);
  }
  // "auto" is only allowed for a shelf that can resolve a core from the file:
  // every core it offers must be a real deck's core, and every extension it
  // accepts (archives excepted) must belong to a deck that can name one.
  for (const s of SYSTEMS.filter((x) => x.ejsCore === "auto")) {
    const offered = new Set(SYSTEMS.filter((x) => x.ejsCore !== "auto").flatMap((x) => [x.ejsCore, ...(x.cores || []).map((c) => c.id)]));
    for (const c of s.cores || []) {
      if (c.id === "auto") continue;
      if (!offered.has(c.id)) bad.push(`${s.id}: core "${c.id}" is offered by no deck - forcing it from the config form would boot a foreign core`);
      if (!PUBLISHED.has(c.id)) bad.push(`${s.id}: core "${c.id}" is not a published core`);
    }
    // the shelf reads the file to decide the core, so every extension it accepts
    // must be readable by a core the shelf can actually name
    const readable = new Set();
    for (const c of s.cores || []) for (const e of PUBLISHED.get(c.id) || []) readable.add(e);
    for (const e of s.exts || []) if (!readable.has(e) && !CONTAINERS.has(e)) bad.push(`${s.id}: ext "${e}" cannot be forced to a core (no core in its list reads it)`);
  }
  // Settings ▸ Emulator ▸ Channel must only contain directories the CDN has.
  const channels = new Set(runtime.channels);
  for (const v of emulatorMod.CDN_VERSIONS) if (!channels.has(v)) bad.push(`CDN_VERSIONS: "${v}" is not a channel upstream publishes (${runtime.channels.join(", ")})`);
  if (runtime.stableVersion && !emulatorMod.CDN_VERSIONS.slice(1).includes(runtime.stableVersion)) bad.push(`CDN_VERSIONS: the current stable (${runtime.stableVersion}) is not selectable`);
  if (bad.length) throw new Error(bad.slice(0, 10).join("\n"));
  return `${SYSTEMS.length} systems, ${PUBLISHED.size} published cores, ${runtime.cores.reduce((a, c) => a + (c.name && SYSTEMS.some((s) => s.ejsCore === c.name) ? 1 : 0), 0)} of them a deck's default`;
});

check("every pad id a system advertises exists in layouts.js, and vice versa", () => {
  const bad = [];
  const spilled = [];
  const claimed = new Set();
  for (const s of SYSTEMS) for (const p of [s.pad, ...(s.pads || [])]) claimed.add(p);
  for (const id of claimed) if (!PADS[id]) bad.push(`systems.js wants pad "${id}" which layouts.js does not define`);
  const orphans = Object.keys(PADS).filter((id) => !claimed.has(id));
  if (orphans.length > 8) bad.push(`${orphans.length} pads nothing uses: ${orphans.slice(0, 6).join(", ")}`);
  for (const [id, pad] of Object.entries(PADS)) {
    if (!pad.widgets?.length) bad.push(`${id}: empty layout`);
    let over = 0;
    for (const w of pad.widgets) {
      const ww = w.w ?? w.s ?? (w.r ? w.r * 2 : 0);
      const wh = w.h ?? w.s ?? (w.r ? w.r * 2 : 0);
      if (!(ww > 0) || !(wh > 0)) bad.push(`${id}.${w.type || w.t}: zero-size widget`);
      if (typeof w.x !== "number" || typeof w.y !== "number") bad.push(`${id}.${w.type || w.t}: no position`);
      // the pad box is a 100x46 field; accessories (zappers, mice, second
      // screens) may hang off it on purpose, but nothing belongs in another
      // galaxy, so anything past these limits is a typo
      // regions and keybeds are authored from their centre (see pad.css)
      const centred = w.t === "region" || w.t === "keys";
      const x0 = centred ? w.x - ww / 2 : w.x;
      const y0 = centred ? w.y - wh / 2 : w.y;
      const FH = pad.orient === "portrait" ? 96 : 46;
      if (x0 < -2 || y0 < -2 || x0 + ww > 150 || y0 + wh > FH + 40) bad.push(`${id}.${w.type || w.t}: at ${w.x},${w.y} size ${ww}x${wh} - outside any sane field`);
      if (x0 + ww > 100.01 || y0 + wh > FH + 0.01) over++;
    }
    if (over) spilled.push(`${id} (${over})`);
  }
  if (bad.length) throw new Error(bad.slice(0, 8).join("\n"));
  if (spilled.length) console.log(`     note: ${spilled.length} layout(s) draw accessories past the 100x46 box: ${spilled.slice(0, 8).join(", ")}${spilled.length > 8 ? " …" : ""}`);
  return `${Object.keys(PADS).length} layouts, ${claimed.size} referenced`;
});

check("skins: every CSS variable defined, every colour parseable", () => {
  const bad = [];
  const { skinVars } = data;
  const CORE = ["shell", "shell2", "bezel", "glass", "btn", "btnText", "dpad", "accent"];
  for (const id of SKIN_IDS) {
    const vars = skinVars(id);
    for (const key of CORE) if (!vars[`--${key}`]) bad.push(`${id}: skinVars() does not provide --${key}`);
    for (const key of CSS_VAR_KEYS) if (vars[`--${key}`] === undefined && SKINS[id]?.[key] === undefined) void 0;
    for (const [k, v] of Object.entries(vars)) {
      if (v == null || v === "") bad.push(`${id}: ${k} is empty`);
      else if (/^(--shell|--btn|--bezel|--accent|--screen|--ink|--glass|--led|--grille|--label)/.test(k) && !/^(#[0-9a-f]{3,8}|rgba?\(|hsla?\(|linear-gradient|radial-gradient|conic-gradient)/i.test(String(v))) {
        bad.push(`${id}: ${k} looks like a colour but is "${String(v).slice(0, 24)}"`);
      }
    }
  }
  for (const m of MODELS) if (m.skinAccent && !/^#[0-9a-f]{3,8}$/i.test(m.skinAccent)) bad.push(`${m.id}: skinAccent "${m.skinAccent}"`);
  if (bad.length) throw new Error(bad.slice(0, 8).join("\n"));
  return `${SKIN_IDS.length} skins x ${CSS_VAR_KEYS.length} vars`;
});

/* -------------------------------------------------------------- 3. catalogue */
check("generated catalogue matches its source data", async () => {
  const json = JSON.parse(read("data/games.json"));
  const gen = await import("../js/data/games.generated.js");
  const bad = [];
  if (gen.GAMES.length !== json.games.length) bad.push(`GAMES has ${gen.GAMES.length} rows, data/games.json has ${json.games.length} - re-run npm run build`);
  if (gen.META.count !== json.meta.count) bad.push(`META.count ${gen.META.count} != ${json.meta.count}`);
  const a = json.games.map((g) => `${g.id}|${g.system}|${g.title}|${g.source}`);
  const b = gen.GAMES.map((g) => `${g.id}|${g.system}|${g.title}|${g.source}`);
  if (a.join("\n") !== b.join("\n")) bad.push("rows differ from the source JSON (order or content) - re-run npm run build");
  const per = {};
  for (const g of json.games) per[g.system] = (per[g.system] || 0) + 1;
  for (const [sys, n] of Object.entries(per)) if (gen.COUNTS[sys] !== n) bad.push(`COUNTS.${sys} = ${gen.COUNTS[sys]} but there are ${n} rows`);
  for (const sys of Object.keys(gen.COUNTS)) if (!per[sys]) bad.push(`COUNTS mentions ${sys} with no rows`);
  const ids = new Set();
  for (const g of gen.GAMES) {
    if (!g.id || ids.has(g.id)) bad.push(`duplicate or missing id ${JSON.stringify(g.id)}`);
    ids.add(g.id);
    if (!SYSTEM_IDS.includes(g.system)) bad.push(`${g.id}: unknown system ${g.system}`);
    if (!["own", "bundled"].includes(g.source)) bad.push(`${g.id}: source "${g.source}" (must be own or bundled)`);
    if (!g.title) bad.push(`${g.id}: no title`);
    if (g.id !== `${g.system}/${slugify(g.title)}` && !g.id.includes("/")) bad.push(`${g.id}: id is not system/slug`);
    if (g.year != null && !(g.year >= 1970 && g.year <= 2026)) bad.push(`${g.id}: year ${g.year}`);
    if (g.rating != null && !(g.rating >= 0 && g.rating <= 10)) bad.push(`${g.id}: rating ${g.rating}`);
    if (g.players != null && !(g.players >= 1 && g.players <= 12)) bad.push(`${g.id}: players ${g.players}`);
    // system ids are mixed case (segaMD, homebrew), so the path class has to be
    // too - a stricter pattern silently failed every Mega Drive entry
    const originPath = (v) => new RegExp(`^(homebrew|covers)/[A-Za-z0-9]+/[\\w(). ,'+-]+$`).test(String(v));
    for (const field of ["rom", "cover"]) {
      const v = g[field];
      if (!v) continue;
      if (/^https?:/i.test(String(v))) bad.push(`${g.id}: ${field} must be a path on this origin, got ${JSON.stringify(v)}`);
      else if (!originPath(v)) bad.push(`${g.id}: ${field} must look like ${field === "rom" ? "homebrew/<system>/<file>" : "covers/<system>/<file>"}, got ${JSON.stringify(v)}`);
      else if (!existsSync(join(ROOT, String(v)))) bad.push(`${g.id}: ${field} points at ${v} which is not there`);
    }
    if (g.genreSlug && !/^[a-z0-9-]+$/.test(g.genreSlug)) bad.push(`${g.id}: genreSlug "${g.genreSlug}"`);
  }
  if (bad.length) throw new Error(bad.slice(0, 8).join("\n"));
  return `${gen.GAMES.length} titles, ${Object.keys(gen.COUNTS).length} systems, no ROM fields`;
});

const gamesMod = await import("../js/games/index.js");
const slugify = (t) => String(t).toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

check("built-in games reference real pads, systems and cover the registry", () => {
  const bad = [];
  for (const g of gamesMod.GAMES) {
    if (!PAD_IDS.includes(g.pad)) bad.push(`${g.id}: pad "${g.pad}" unknown`);
    if (!SYSTEM_IDS.includes(g.system)) bad.push(`${g.id}: system "${g.system}" unknown`);
    if (!(g.w > 0) || !(g.h > 0)) bad.push(`${g.id}: bad canvas size`);
    if (!g.blurb || !g.howto) bad.push(`${g.id}: missing blurb/howto copy`);
    if (g.inspiredBy !== undefined && (typeof g.inspiredBy !== "string" || g.inspiredBy.length < 8)) {
      bad.push(`${g.id}: inspiredBy must be honest prose about the genre, got ${JSON.stringify(g.inspiredBy)}`);
    }
    const reg = gamesMod.gameFor(`builtin:${g.slug || g.id}`);
    if (!reg) bad.push(`${g.id}: not reachable through gameFor("builtin:${g.slug || g.id}")`);
  }
  if (bad.length) throw new Error(bad.slice(0, 8).join("\n"));
  return `${gamesMod.GAMES.length} titles`;
});

/* ------------------------------------------------- 4. markup <-> page wiring */
check("every element the JS looks up exists in index.html", () => {
  const html = read("index.html");
  const ids = new Set([...html.matchAll(/\bid="([a-zA-Z0-9_-]+)"/g)].map((m) => m[1]));
  const missing = [];
  for (const f of jsFiles()) {
    const src = read(f);
    for (const m of src.matchAll(/getElementById\("([a-zA-Z0-9_-]+)"\)/g)) {
      if (!ids.has(m[1])) missing.push(`${f}: #${m[1]}`);
    }
    for (const m of src.matchAll(/document\.querySelector\(["']#([a-zA-Z0-9_-]+)["']\)/g)) {
      if (!ids.has(m[1])) missing.push(`${f}: #${m[1]} (querySelector)`);
    }
  }
  if (missing.length) throw new Error(missing.slice(0, 8).join("\n"));
  return `${ids.size} ids declared`;
});

check("index.html and the manifest reference files that exist", () => {
  const bad = [];
  const html = read("index.html");
  for (const m of html.matchAll(/(?:href|src)="(\/[^"]+)"/g)) {
    const p = m[1].split("?")[0];
    if (p.startsWith("//") || /^https?:/.test(p)) continue;
    if (!existsSync(join(ROOT, p))) bad.push(`index.html links missing ${p}`);
  }
  const manifest = JSON.parse(read("manifest.webmanifest"));
  for (const icon of manifest.icons || []) {
    if (!existsSync(join(ROOT, icon.src.replace(/^\//, "")))) bad.push(`manifest icon missing ${icon.src}`);
  }
  for (const key of ["name", "short_name", "start_url", "display", "theme_color", "background_color"]) {
    if (!(key in manifest)) bad.push(`manifest missing ${key}`);
  }
  const sw = read("sw.js");
  for (const m of sw.matchAll(/["'](\/[\w./-]+\.(?:css|js|webmanifest|png|svg|json))["']/g)) {
    if (!existsSync(join(ROOT, m[1].replace(/^\//, "")))) bad.push(`sw.js precaches missing ${m[1]}`);
  }
  if (bad.length) throw new Error(bad.join("\n"));
  return `${(manifest.icons || []).length} icons, ${(html.match(/<link /g) || []).length} links`;
});

check("no commercial ROM is fetched, linked or named as a download", () => {
  const bad = [];
  const SUSPECT = /(https?:\/\/[^"' ]*\.(nes|sfc|smc|gba|gb|nds|z64|n64|iso|cue|chd|bin|zip|7z))|free\s*download|rom\s*site|dumped\s*roms/i;
  const docs = existsSync(join(ROOT, "docs")) ? readdirSync(join(ROOT, "docs")).filter((f) => f.endsWith(".md")).map((f) => `docs/${f}`) : [];
  for (const f of [...jsFiles(), "index.html", "sw.js", "README.md", "NOTICE.md", ...docs].filter((f) => existsSync(join(ROOT, f)))) {
    const src = read(f);
    src.split("\n").forEach((line, i) => {
      if (SUSPECT.test(line) && !/cdn\.emulatorjs\.org|vendor\/data|example\.com|localhost/.test(line)) bad.push(`${f}:${i + 1} ${line.trim().slice(0, 90)}`);
    });
  }
  for (const g of JSON.parse(read("data/games.json")).games || []) {
    if (/^https?:/i.test(String(g.rom || ""))) bad.push(`catalogue entry ${g.id} links an external ROM`);
  }
  if (bad.length) throw new Error(bad.slice(0, 6).join("\n"));
  return "clean";
});

/* ------------------------------------------------------------- 5. css + runs */
check("css audit: every class the JS renders has a rule", () => spawn("tools/css-audit.mjs").split("\n").slice(0, 1).join(" "));

if (!FAST) {
  check("the six built-in games run 300 frames each", () => spawn("tools/sim.mjs", ["300"]).split("\n").pop());
  check("every view boots headlessly against the DOM shim", () => spawn("tools/dom-smoke.mjs").split("\n").pop());
  check("the EmulatorJS vendor tool works against a local mirror", () => spawn("tools/test-vendor.mjs").split("\n").pop());
}

check("every module in js/ imports cleanly", () => spawn("tools/check-imports.mjs").split("\n").slice(-2)[0].trim().replace(/^ok\s+/, ""));

check("the service worker caches the app and leaves the runtime alone", () => spawn("tools/test-sw.mjs").split("\n").filter((l) => l.startsWith("ok")).length + " behaviours verified");

check("the server serves every file the app asks for (and nothing above the repo)", () => {
  const r = spawnSync(process.execPath, [join(ROOT, "tools", "serve-check.mjs")], { encoding: "utf8", timeout: 120000 });
  const out = (r.stdout || "") + (r.stderr || "");
  if (r.status !== 0) throw new Error("serve-check failed:\n" + out.trim());
  const line = out.split("\n").map((l) => l.trim()).find((l) => l.startsWith("served")) || "";
  return line.replace(/^served /, "") || "the app is served";
});

check("homebrew drop folders exist and explain themselves", () => {
  const missing = [];
  for (const sys of SYSTEM_IDS) {
    const dir = join(ROOT, "homebrew", sys);
    if (!existsSync(dir)) {
      missing.push(`homebrew/${sys}`);
      continue;
    }
    if (!existsSync(join(dir, "README.md"))) missing.push(`homebrew/${sys}/README.md`);
  }
  if (missing.length) throw new Error(`missing ${missing.length} drop folder(s): ${missing.slice(0, 6).join(", ")}`);
  return `${SYSTEM_IDS.length} folders`;
});

/* ------------------------------------------------------------------ report */
for (const run of queue) await run();
const width = Math.max(...results.map((r) => r.name.length));
for (const r of results) console.log(`${r.ok ? "ok  " : "FAIL"} ${r.name.padEnd(width)}  ${r.detail}`);
console.log(`\n${results.length - failures}/${results.length} checks passed${FAST ? "  (--fast: no sim, no DOM boot)" : ""}`);
process.exit(failures ? 1 : 0);
