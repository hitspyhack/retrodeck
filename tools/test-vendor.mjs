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

const PAYLOAD = {
  "loader.js": "console.log('loader');\n",
  "version.json": JSON.stringify({ version: "test" }),
  "wasm/rt-wasm.js": "// runtime\n".repeat(40),
  "cores/nes.js": "// core module\n",
  "cores/nes.wasm": "WASM".padEnd(9000, "x"),
  "cores/snes.js": "// core module\n",
  "cores/snes.wasm": "WASM".padEnd(21000, "y"),
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

const first = await run(["--base", base, "--out", OUT, "--cores", "nes,snes"]);
say(first.code === 0, `first run exits 0 (got ${first.code})`);
for (const [rel, body] of Object.entries(PAYLOAD)) {
  const p = join(OUT, "data", rel);
  const ok = existsSync(p) && readFileSync(p, "utf8") === body;
  say(ok, `vendor/data/${rel} byte-identical${existsSync(p) ? ` (${statSync(p).size} B)` : " - MISSING"}`);
}
const manifest = JSON.parse(readFileSync(join(OUT, "manifest.json"), "utf8"));
say(manifest.cores.join() === "nes,snes", `manifest lists the cores (${manifest.cores.join(", ")})`);
say(manifest.source === base, "manifest records where the payload came from");
say(Array.isArray(manifest.optionalMissing) && manifest.optionalMissing.length > 0, `${manifest.optionalMissing?.length} optional 404s recorded instead of failing the run`);

const second = await run(["--base", base, "--out", OUT, "--cores", "nes,snes"]);
say(second.code === 0 && /nothing to do/.test(second.out), "re-run is a no-op (idempotent)");
say(!/fetch\s+\d/.test(second.out), "re-run fetches nothing");

const dead = await run(["--base", "http://127.0.0.1:1/data/", "--out", OUT, "--force", "--cores", "nes"]);
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
