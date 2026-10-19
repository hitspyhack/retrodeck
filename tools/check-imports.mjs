#!/usr/bin/env node
/**
 * Does every module in js/ actually import?
 *
 * `node --check` only parses; a missing named export, a top-level `document`
 * touch or a circular import that reads before it initialises all parse fine and
 * blow up in the browser. This runs each module through the same DOM shim the
 * smoke test uses, so the whole app is at least *loaded* in CI with no browser.
 *
 *   node tools/check-imports.mjs
 *
 * js/app.js is the one module left out: it mounts the router on import, and
 * tools/dom-smoke.mjs already drives it through every route.
 */
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { installDom } from "./dom-shim.mjs";

const ROOT = join(fileURLToPath(import.meta.url), "../..");
installDom();

const noise = [];
process.on("unhandledRejection", (e) => noise.push(`unhandledRejection: ${(e && e.message) || e}`));
process.on("uncaughtException", (e) => noise.push(`uncaughtException: ${(e && e.message) || e}`));

const files = [];
(function walk(dir) {
  for (const f of readdirSync(dir).sort()) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (f.endsWith(".js")) files.push(p);
  }
})(join(ROOT, "js"));

const SKIP = new Set([join(ROOT, "js/app.js")]);
let bad = 0;
let loaded = 0;
for (const file of files) {
  if (SKIP.has(file)) {
    loaded++;
    continue;
  }
  try {
    await import("file://" + file);
    loaded++;
  } catch (e) {
    bad++;
    const msg = String((e && e.message) || e).split("\n")[0];
    console.log(`FAIL ${relative(ROOT, file)} :: ${msg}`);
  }
}

// let anything a module scheduled at import time (rAF, microtasks) throw here
await new Promise((r) => setTimeout(r, 250));
for (const n of [...new Set(noise)].slice(0, 8)) {
  bad++;
  console.log(`FAIL (async) ${n}`);
}

if (bad) {
  console.error(`\n${bad} module(s) did not load`);
  process.exit(1);
}
console.log(`ok  ${loaded} modules import cleanly under the DOM shim (${SKIP.size} mounted by the route walk instead)`);
