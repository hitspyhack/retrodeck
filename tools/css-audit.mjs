/**
 * Which classes does the JS ask for, and which does the CSS actually define?
 *
 * RetroDeck has no bundler and no CSS framework, so the only thing keeping the
 * markup honest is this check: every class name that appears in an `h()` spec,
 * a `class:` prop or a classList call must exist in a stylesheet (or be
 * explicitly listed as a DOM-only marker). Run directly for a report, or via
 * `npm test`, which fails the build on real gaps.
 *
 *   node tools/css-audit.mjs [--json]
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(import.meta.url), "../..");

/** Classes that only ever live in the DOM (state markers, JS hooks). */
const ALLOW_MISSING = new Set([
  "is-open", // player root / sheet
  "is-on", // chips and toggles
  "is-over", // drag targets
  "is-landscape",
  "is-capturing",
  "is-playing",
  "is-loading",
  "is-closing",
  "is-listening",
  "is-default",
  "is-dragover",
  "is-hidden",
  "monospace",
  "b", // inside the emulator srcdoc, styled by that document's own <style>
  "i", // ditto (the boot progress bar)
]);

/** Kinds ui.js can pass to toast(); each needs a modifier rule. */
const TOAST_KINDS = ["info", "good", "bad", "warn"];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const files = walk(join(ROOT, "js")).filter((f) => f.endsWith(".js"));
const html = join(ROOT, "index.html");
const cssFiles = walk(join(ROOT, "css")).filter((f) => f.endsWith(".css"));

const used = new Map(); // class -> Set("file:line")
function note(cls, where) {
  if (!cls || !/^[a-zA-Z][\w-]*$/.test(cls)) return;
  if (/[-_]$/.test(cls) || cls.includes("$") || cls === "DYN") return;
  if (!used.has(cls)) used.set(cls, new Set());
  used.get(cls).add(where);
}

const JS_PATTERNS = [
  // h("div.foo.bar", ...) / h(`button.chip${cond ? ".is-on" : ""}`)
  /\bh\(\s*[`"']([a-zA-Z][\w-]*(?:[#.][\w-]+)*)[`'"]/g,
  // class: "foo bar"
  /\bclass:\s*[`"']([^`"']*)[`"']/g,
  // className = "foo"
  /\.className\s*=\s*[`"']([^`"']*)[`"']/g,
  // classList.add|remove|toggle("foo"
  /classList\.(?:add|remove|toggle|contains)\(\s*[`"']([^`"']+)[`"']/g,
  // setAttribute("class", "foo")
  /setAttribute\(\s*["']class["']\s*,\s*["']([^"']+)["']/g,
  // markup strings: class="pad pad--gb"
  /\bclass="([^"$`]{2,80})"/g,
];

for (const file of [...files, html]) {
  const src = readFileSync(file, "utf8");
  const rel = relative(ROOT, file);
  const text = src.split("\n");
  text.forEach((line, i) => {
    const at = `${rel}:${i + 1}`;
    // 1. element specs: "div.card.is-on" or `button.chip${...}` (quote may not close on this line)
    for (const m of line.matchAll(/\bh\(\s*[`"']([a-zA-Z][\w-]*(?:[#.][\w-]+)*)/g)) {
      const parts = m[1].split("#")[0].split(".");
      for (const c of parts.slice(1)) note(c, at); // parts[0] is the tag name
    }
    // 1b. classes chosen by a ternary *inside an h() spec template*:
    //     h(`div.sheet${wide ? ".sheet--wide" : ""}`) - only that position, so
    //     file-extension strings elsewhere do not look like class names.
    for (const im of line.matchAll(/\bh\(\s*`[^`]*?\$\{([^{}]*)\}/g)) {
      for (const m of im[1].matchAll(/["'`](\.[\w.-]+)["'`]/g)) {
        for (const c of m[1].split(".").slice(1)) note(c, at);
      }
    }
    // 2. explicit class props
    for (const m of line.matchAll(/\bclass(?:Name)?\s*[:=]\s*[`"']([^`"']*)[`"']/g)) {
      for (const c of m[1].split(/\s+/)) note(c, at);
    }
    // 3. classList calls
    for (const m of line.matchAll(/classList\.(?:add|remove|toggle|contains)\(\s*[`"']([^`"']*)[`"']/g)) {
      for (const c of m[1].split(/\s+/)) note(c, at);
    }
    // 4. classList with a template expression: classList.add(`is-${x}`)
    for (const m of line.matchAll(/classList\.(?:add|remove|toggle)\(\s*`([^`]*)`/g)) {
      for (const c of m[1].replace(/\$\{[^}]*\}/g, "DYN").split(/\s+/)) if (!c.includes("DYN")) note(c, at);
    }
    // 5. markup strings (innerHTML templates)
    for (const m of line.matchAll(/\bclass=\\?"([^"\\]*)\\?"/g)) {
      for (const c of m[1].replace(/\$\{[^}]*\}/g, " DYN ").split(/\s+/)) if (c && !c.includes("DYN")) note(c, at);
    }
  });
}

// ---- defined in CSS
const defined = new Set();
const selectors = new Map(); // class -> files
for (const file of cssFiles) {
  const src = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const rel = relative(ROOT, file);
  for (const m of src.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) {
    defined.add(m[1]);
    if (!selectors.has(m[1])) selectors.set(m[1], new Set());
    selectors.get(m[1]).add(rel);
  }
}

// Dynamic class names. Rather than pretend a prefix match proves anything, the
// audit enumerates the real value sets from the data files and requires a rule
// for each - that is how a new widget type or tint gets caught the day it is
// added. Anything not listed here falls back to `DYNAMIC_OK` (pure hooks).
const DYNAMIC_OK = new Set(["pad--"]); // .pad--<padId> is a styling hook, optional

const { PADS } = await import("../js/data/layouts.js");
const dynamic = new Map(); // class -> why
const widgetTypes = new Set();
const tints = new Set();
for (const pad of Object.values(PADS)) {
  for (const w of pad.widgets || []) {
    if (w.t) widgetTypes.add(`w--${w.t}`);
    if (w.tint) tints.add(`is-tinted-${String(w.tint).replace(/[^a-z0-9]/gi, "")}`);
  }
}
for (const cls of [...widgetTypes, ...tints]) dynamic.set(cls, `layouts.js (${cls.startsWith("w--") ? "widget type" : "tint"})`);
for (const kind of TOAST_KINDS) dynamic.set(`toast--${kind}`, "ui.js toast(kind)");
const missing = [];
const definedUnused = [...defined].filter((c) => !used.has(c));
const softNote = (cls) => (cls.startsWith("pad--") ? "hook" : null);
for (const [cls, where] of [...used].sort()) {
  if (defined.has(cls) || ALLOW_MISSING.has(cls) || softNote(cls)) continue;
  missing.push({ cls, where: [...where] });
}
// data-driven requirements are not always referenced by a literal in the JS
for (const [cls, why] of dynamic) {
  if (defined.has(cls)) continue;
  if (![...used.keys()].some((u) => u.split("--")[0] === cls.split("--")[0])) continue;
  missing.push({ cls, where: [why] });
}

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ used: used.size, defined: defined.size, missing, unusedCss: definedUnused }, null, 2));
  process.exit(missing.length ? 1 : 0);
}

console.log(`classes used: ${used.size}   defined in css: ${defined.size}   css files: ${cssFiles.length}`);
if (missing.length) {
  console.log(`\n${missing.length} class(es) the JS asks for with no rule in css/`);
  for (const m of missing) console.log(`  .${m.cls.padEnd(24)} ${m.where.slice(0, 3).join(", ")}${m.where.length > 3 ? ` (+${m.where.length - 3})` : ""}`);
} else {
  console.log("every class used by the JS has a rule");
}
if (definedUnused.length) {
  console.log(`\n${definedUnused.length} CSS class(es) nothing renders (fine if intentional, worth a look):`);
  console.log("  " + definedUnused.slice(0, 40).join(", "));
}
process.exit(missing.length ? 1 : 0);
