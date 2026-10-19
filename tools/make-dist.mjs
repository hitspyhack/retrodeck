/**
 * Build a deploy folder (`dist/`) that contains exactly what the site needs to run
 * and nothing else: no tools/, no docs/, no .git, no source maps of my test suite.
 *
 *   npm run deploy:prepare          -> dist/
 *   node tools/make-dist.mjs --check  -> verify dist is complete, write nothing
 *
 * Completeness is proven, not assumed: after copying, the tool re-reads the copy,
 * walks `index.html`'s src/href attributes and the ES module graph under js/, and
 * fails if any file the app will actually request is missing from dist. That is the
 * difference between "the CI job uploaded some files" and "the deployed site can
 * load every module it imports" - the second one is what breaks silently when a new
 * js/data/ file lands without being added to an include list somewhere.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, existsSync, rmSync, cpSync } from "node:fs";
import { join, dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = resolve(process.env.DIST_DIR || join(ROOT, "dist"));
const CHECK = process.argv.includes("--check");

/**
 * What ships. `data/` because the app fetches the catalogue at runtime; `homebrew/`
 * and `covers/` because their READMEs document the drop folders even when no images
 * are present; `vendor/` only if you ran `npm run vendor` (the whole point of a
 * self-hosted mirror is that it is not in git).
 */
const TOP = ["index.html", "sw.js", "manifest.webmanifest", "favicon.ico"];
const DIRS = ["css", "js", "data", "icons", "homebrew", "covers", "vendor"];
/** Never copied even if present: repo plumbing, and anything a browser must not see. */
const SKIP_DIR = new Set(["node_modules", ".git", "dist", "roms", "saves", "bios", "tools", "docs"]);
function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

function build() {
  if (!CHECK) {
    rmSync(DIST, { recursive: true, force: true });
    mkdirSync(DIST, { recursive: true });
  }
  const copied = [];
  const missing = [];
  for (const f of TOP) {
    const src = join(ROOT, f);
    if (!existsSync(src)) continue;
    copied.push(f);
    if (!CHECK) copy(src, join(DIST, f));
  }
  for (const d of DIRS) {
    const src = join(ROOT, d);
    if (!existsSync(src) || SKIP_DIR.has(d)) continue;
    for (const file of walk(src)) {
      const rel = relative(ROOT, file).split("\\").join("/");
      if (SKIP_DIR.has(rel.split("/")[0]) || shouldSkip(rel)) continue;
      copied.push(rel);
      if (!CHECK) copy(file, join(DIST, rel));
    }
  }
  if (CHECK) for (const rel of copied) if (!existsSync(join(DIST, rel))) missing.push(rel);
  return { copied, missing };
}

/** Images and READMEs inside the drop folders ship; their content is the docs. */
function shouldSkip(rel) {
  if (rel.startsWith("vendor/")) return false;
  if (rel.includes("/.DS_Store")) return true;
  // homebrew/<system>/*: only the README, because a committed ROM is the one thing
  // this project must never do
  if (rel.startsWith("homebrew/")) return !rel.endsWith("README.md");
  if (rel.startsWith("covers/")) return !rel.endsWith("README.md");
  if (rel.startsWith("data/")) return false;
  return false;
}

function copy(from, to) {
  mkdirSync(dirname(to), { recursive: true });
  cpSync(from, to);
}

/* ----------------------------------------------------------- completeness */

const SRC_RE = /(?:src|href)="\.?\/([^"]+)"/g;

/** Every module specifier reachable from a set of entry files, by regex: no parser,
 *  and `import()` with a template string is reported as an unresolvable edge instead
 *  of silently ending the walk. */
function graphFrom(files) {
  const seen = new Set();
  const unresolved = [];
  const stack = files.slice();
  while (stack.length) {
    const rel = stack.pop();
    if (seen.has(rel) || !rel.endsWith(".js")) continue;
    const abs = join(DIST, rel);
    if (!existsSync(abs)) {
      unresolved.push(rel);
      continue;
    }
    seen.add(rel);
    const src = readFileSync(abs, "utf8");
    for (const m of src.matchAll(/(?:^|\n)\s*(?:import|export)[^"'`;]*?from\s+["'](\.[^"']+)["']/g)) {
      stack.push(normalize(join(dirname(rel), m[1])));
    }
    for (const m of src.matchAll(/import\(\s*["'](\.[^"']+)["']\s*\)/g)) {
      stack.push(normalize(join(dirname(rel), m[1])));
    }
  }
  // one report per missing target, however many modules import it
  return { seen: [...seen].sort(), unresolved: [...new Set(unresolved)].sort() };
}

const normalize = (p) => relative(DIST, resolve(DIST, p)).split("\\").join("/");

function verify() {
  const html = readFileSync(join(DIST, "index.html"), "utf8");
  const refs = [...html.matchAll(SRC_RE)].map((m) => m[1]).filter((r) => !/^https?:/.test(r) && !r.startsWith("data:"));
  const missingRefs = refs.filter((r) => !existsSync(join(DIST, r)));
  const entries = refs.filter((r) => r.endsWith(".js"));
  const { seen, unresolved } = graphFrom(entries);
  return { refs, missingRefs, modules: seen, unresolved };
}

const { copied, missing } = build();
const v = existsSync(join(DIST, "index.html")) ? verify() : { refs: [], missingRefs: [], modules: [], unresolved: [] };
const bytes = copied.reduce((a, rel) => {
  const p = join(DIST, rel);
  return a + (existsSync(p) ? statSync(p).size : 0);
}, 0);

console.log(`${CHECK ? "checking" : "built"} ${relative(ROOT, DIST)}/`);
console.log(`  files     ${copied.length} (${(bytes / 1024).toFixed(0)} KB)`);
console.log(`  html refs ${v.refs.length} (${v.missingRefs.length ? "MISSING: " + v.missingRefs.join(", ") : "all present"})`);
console.log(`  modules   ${v.modules.length} reachable from index.html${v.unresolved.length ? " | unresolvable: " + v.unresolved.join(", ") : ""}`);
console.log(`  caches    ${v.modules.filter((m) => m.startsWith("js/data/")).length} data modules, ${copied.filter((f) => f.startsWith("vendor/")).length} vendor file(s)`);

const problems = [
  ...missing.map((m) => `listed as copied but not in dist: ${m}`),
  ...v.missingRefs.map((m) => `index.html references ${m} which is not in dist`),
  ...v.unresolved.map((m) => `an import points at ${m}, which is not in dist`),
];
if (!copied.length) problems.push("dist is empty");
if (problems.length) {
  console.error(`\ndist is incomplete:\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
console.log("  ok        every file the deployed app asks for is in dist/");
