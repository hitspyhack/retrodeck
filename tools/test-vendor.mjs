/**
 * Regression test for tools/vendor-emulatorjs.mjs, run by `npm test`.
 *
 * No network: it stands up a fake CDN on 127.0.0.1, points the tool at it with
 * --base, and checks the parts that matter - files written where the loader
 * expects them, sizes preserved, a manifest that lets a second run be a no-op,
 * optional 404s tolerated, and a dead mirror reported as a failure instead of
 * silently leaving a half-mirror behind.
 *
 *   node tools/test-vendor.mjs
 */
import { createServer } from "node:http";
import { mkdirSync, writeFileSync, readFileSync, existsSync, statSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CDN = join(tmpdir(), "retrodeck-fake-cdn", "data");
const OUT = join(tmpdir(), "retrodeck-vendor-test");

// Exactly the shape upstream publishes (one blob per core, three shared runtime
// files). A tool written against a guessed layout - cores/<name>.js + .wasm, a
// wasm/rt-wasm.js that has never existed - would mirror nothing and still exit 0,
// so this fixture is the smallest thing that catches that class of bug.
const PAYLOAD = {
  "loader.js": "console.log('loader');\n",
  "emulator.min.js": "/*! runtime */\n".repeat(200),
  "emulator.min.css": "body{background:#000}\n",
  "version.json": JSON.stringify({ version: "test" }),
  "cores/cores.json": JSON.stringify([{ name: "fceumm", extensions: ["nes"] }, { name: "snes9x", extensions: ["sfc"] }]),
  "cores/fceumm-wasm.data": "WASM".padEnd(9000, "x"),
  "cores/snes9x-wasm.data": "WASM".padEnd(21000, "y"),
  // only snes9x publishes a threaded build here, so the other one is a tolerated 404
  "cores/snes9x-thread-wasm.data": "WASM".padEnd(20000, "z"),
};

rmSync(join(tmpdir(), "retrodeck-fake-cdn"), { recursive: true, force: true });
rmSync(OUT, { recursive: true, force: true });
for (const [rel, body] of Object.entries(PAYLOAD)) {
  const p = join(CDN, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, body);
}

const server = createServer((req, res) => {
  const rel = decodeURIComponent(req.url.replace(/^\/data\//, "").replace(/^\/+/, ""));
  const p = join(CDN, rel);
  if (!p.startsWith(CDN) || !existsSync(p)) {
    res.writeHead(404).end("not here");
    return;
  }
  const body = readFileSync(p);
  res.writeHead(200, { "content-type": "application/javascript", "content-length": body.length }).end(body);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;
const base = `http://127.0.0.1:${port}/data/`;

let failures = 0;
const say = (ok, msg) => {
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${msg}`);
};

function run(args) {
  return new Promise((resolve) => {
    const kid = spawn(process.execPath, [join(ROOT, "tools", "vendor-emulatorjs.mjs"), ...args], { cwd: ROOT });
    let out = "";
    kid.stdout.on("data", (d) => { out += d; });
    kid.stderr.on("data", (d) => { out += d; });
    const timer = setTimeout(() => kid.kill("SIGKILL"), 40000);
    kid.on("exit", (code) => {
      clearTimeout(timer);
      resolve({ code, out });
    });
  });
}

const first = await run(["--base", base, "--out", OUT, "--cores", "fceumm,snes9x", "--threads"]);
say(first.code === 0, `first run exits 0 (got ${first.code})`);
for (const [rel, body] of Object.entries(PAYLOAD)) {
  const p = join(OUT, "data", rel);
  const ok = existsSync(p) && readFileSync(p, "utf8") === body;
  say(ok, `vendor/data/${rel} byte-identical${existsSync(p) ? ` (${statSync(p).size} B)` : " - MISSING"}`);
}
const manifest = JSON.parse(readFileSync(join(OUT, "manifest.json"), "utf8"));
say(manifest.cores.join() === "fceumm,snes9x", `manifest lists the cores (${manifest.cores.join(", ")})`);
say(manifest.layout === "cores/<name>-wasm.data (+ -thread-/-legacy- siblings), loader.js, emulator.min.{js,css}, cores/cores.json", "manifest records the layout it mirrored");
say(manifest.source === base, "manifest records where the payload came from");
say(Array.isArray(manifest.optionalMissing) && manifest.optionalMissing.length > 0, `${manifest.optionalMissing?.length} optional 404s recorded instead of failing the run`);

const second = await run(["--base", base, "--out", OUT, "--cores", "fceumm,snes9x", "--threads"]);
say(second.code === 0 && /nothing to do/.test(second.out), "re-run is a no-op (idempotent)");
say(!/fetch\s+\d/.test(second.out), "re-run fetches nothing");

const dead = await run(["--base", "http://127.0.0.1:1/data/", "--out", OUT, "--force", "--cores", "fceumm"]);
const typo = await run(["--base", base, "--out", OUT, "--cores", "nes,mednafen_supafaust"]);
say(typo.code === 1, `a core EmulatorJS does not publish is refused before anything downloads (got ${typo.code})`);
const named = (typo.out.match(/publishes: [^\n]+/) || [""])[0].trim();
say(named === "publishes: nes, mednafen_supafaust", `and it names them instead of just failing  "${named}"`);
say(/gambatte, snes9x, fceumm/.test(typo.out), "and points at the naming rule (cores are named after the emulator)");
say(dead.code === 1, `unreachable mirror exits 1 (got ${dead.code})`);
say(/did not download/.test(dead.out), "unreachable mirror says so in words");

rmSync(OUT, { recursive: true, force: true });
rmSync(join(tmpdir(), "retrodeck-fake-cdn"), { recursive: true, force: true });
server.close();
if (failures) {
  console.log(`\n${failures} vendor check(s) failed`);
  process.exit(1);
}
console.log("\nvendor downloader verified against a local mirror");
process.exit(0);
