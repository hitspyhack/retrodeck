/**
 * Headless boot test: installs the DOM shim, imports the real app, and visits
 * every route. Catches the class of bug that syntax checks and unit tests both
 * miss - a view that throws the first time a user opens it.
 *
 *   node tools/dom-smoke.mjs [verbose]
 */
import { installDom, pumpFrames, doc } from "./dom-shim.mjs";

const VERBOSE = process.argv.includes("verbose");
globalThis.__RD_DEBUG = process.env.RD_DEBUG === "1";
process.on("beforeExit", () => console.log(`(event loop drained at ${elapsed()})`));
const T0 = Date.now();
const elapsed = () => ((Date.now() - T0) / 1000).toFixed(1) + "s";
installDom();

// The app expects these mount points (index.html provides them in a browser).
const d = doc();
// Recreate every id index.html declares, so this harness can never drift away
// from the real page.
const { readFileSync } = await import("node:fs");
const { fileURLToPath } = await import("node:url");
const { dirname, join } = await import("node:path");
const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, "../index.html"), "utf8");
const mount = {};
for (const m of html.matchAll(/\bid="([a-zA-Z0-9_-]+)"/g)) {
  const el = d.createElement(m[1] === "q" ? "input" : "div");
  el.id = m[1];
  d.body.appendChild(el);
  mount[m[1]] = el;
}
const errors = [];
const origError = console.error;
const origWarn = console.warn;
console.error = (...a) => {
  errors.push(`error: ${a.join(" ")}`);
  if (VERBOSE) origError(...a);
};
console.warn = (...a) => {
  errors.push(`warn: ${a.join(" ")}`);
  if (VERBOSE) origWarn(...a);
};

function countText(root) {
  const t = (root?.textContent || "").replace(/\s+/g, " ").trim();
  return t.length;
}

async function visit(hash, expect, label = hash) {
  globalThis.location.hash = hash;
  d.dispatchEvent(new globalThis.Event("hashchange"));
  await new Promise((r) => setTimeout(r, 0));
  await Promise.resolve();
  const node = hash.startsWith("#/play") ? d.getElementById("player-root") : d.getElementById("view");
  const chars = countText(node);
  const problems = errors.filter((e) => e.includes("view crashed"));
  const text = (node?.textContent || "").replace(/\s+/g, " ");
  const missing = expect.filter((needle) => !text.includes(needle));
  if (chars < 40 || missing.length || problems.length) {
    console.log(
      `FAIL ${label.padEnd(22)} ${chars} chars` +
        (missing.length ? ` · missing ${JSON.stringify(missing)}` : "") +
        (problems.length ? ` · ${problems.slice(-1)[0]}` : "")
    );
    if (process.env.RD_DUMP) console.log("     text: " + text.slice(0, 220).replace(/\s+/g, " "));
    return false;
  }
  if (VERBOSE) console.log(`  ${label}: ${chars} chars`);
  console.log(`ok   ${label.padEnd(22)} ${chars} chars of markup`);
  return true;
}

const routes = [
  ["#/", ["Maze Chomp"], "home"],
  ["#/library", ["All systems"], "library"],
  ["#/library/gb", ["Game Boy"], "library/gb"],
  ["#/decks", ["Hardware"], "decks"],
  ["#/deck/gb", ["Model", "Skins", "Controls"], "deck/gb"],
  ["#/deck/psx", ["PlayStation"], "deck/psx"],
  ["#/vault", ["Cartridges", "BIOS", "Danger zone"], "vault"],
  ["#/settings", ["Settings", "Your data", "About"], "settings"],
];

let allOk = true;
try {
  const app = await import("../js/app.js");
  await app.render();
  for (const [hash, expect, label] of routes) allOk = (await visit(hash, expect, label)) && allOk;

  // player: built-in game, then drive frames, then leave (mount/destroy)
  const okPlay = await visit("#/play/builtin:chomp", ["Maze Chomp"], "play/builtin:chomp");
  allOk = okPlay && allOk;
  if (okPlay) {
    const pr = d.getElementById("player-root");
    const hasCanvas = !!pr.querySelector("canvas");
    const hasPad = !!pr.querySelector(".pad");
    pumpFrames(30, 0);
    await new Promise((r) => setTimeout(r, 10));
    pumpFrames(30, 1000);
    allOk = hasCanvas && hasPad && allOk;
    console.log(`${hasCanvas && hasPad ? "ok  " : "FAIL"}  chomp mounted canvas=${hasCanvas} pad=${hasPad}`);
    // press a button through the pad DOM and confirm the game sees it
    const btn = pr.querySelectorAll(".pad .w[data-btn]")[0];
    if (btn) {
      btn.dispatchEvent({ type: "pointerdown", pointerId: 1, clientX: 1, clientY: 1, isPrimary: true });
      pumpFrames(5, 2000);
      btn.dispatchEvent({ type: "pointerup", pointerId: 1 });
    }
    await visit("#/", [], "back to home (player destroyed)");
  }

  // every other built-in should mount too
  for (const id of ["blastr", "blitz", "bricks", "stack", "lancer"]) {
    allOk = (await visit(`#/play/builtin:${id}`, [], `play/${id}`)) && allOk;
    pumpFrames(20, 3000);
    await visit("#/", [], `leave/${id}`);
  }
  await deepPass();
} catch (err) {
  allOk = false;
  console.log(`THREW ${err && err.stack ? err.stack.split("\n").slice(0, 4).join(" | ") : err}`);
}

/* ------------------------------------------------- deep interaction pass */
async function deepPass() {
  const { vault } = await import("../js/core/idb.js");
  const { store } = await import("../js/core/store.js");
  const d = doc();
  const body = d.body;
  const hit = (el, needle) => {
    const n = needle.toLowerCase();
    const t = (el.textContent || "").toLowerCase();
    const title = (el.getAttribute("title") || "").toLowerCase();
    const aria = (el.getAttribute("aria-label") || "").toLowerCase();
    return t.includes(n) || title.includes(n) || aria.includes(n);
  };
  const findText = (root, needle, tag = "button") => root.querySelectorAll(tag).find((x) => hit(x, needle)) || null;
  const clickText = (root, needle, tag = "button") => {
    const el = findText(root, needle, tag);
    if (!el) return false;
    el.click();
    return true;
  };
  const settle = async (ms = 30) => {
    await new Promise((r) => setTimeout(r, ms));
    pumpFrames(6, performance.now() + ms);
  };

  // 1. build a fake Game Boy ROM the sniffer should recognise
  const bytes = new Uint8Array(0x8000);
  const title = "VAULT TEST";
  for (let i = 0; i < title.length; i++) bytes[0x134 + i] = title.charCodeAt(i);
  bytes[0x147] = 0; // CGB flag: plain GB
  bytes[0x148] = 0x57; // cartridge type (ROM only would be 0, keep sane)
  bytes[0x14a] = 0; // ROM size 32K
  bytes[0x14b] = 0; // RAM size
  bytes[0x143] = 0x33; // fixed Nintendo logo byte that sniffers look for
  let x = 0;
  for (let a = 0x134; a <= 0x14c; a++) x = (x - bytes[a] - 1) & 0xff;
  bytes[0x14d] = x;
  const file = new File([bytes], "Vault Test (World).gb", { type: "application/octet-stream" });
  const rec = await vault.addRom(file);
  const okAdd = rec && rec.hash && rec.system === "gb";
  console.log(`${okAdd ? "ok  " : "FAIL"}  vault.addRom          hash=${String(rec?.hash).slice(0, 10)} system=${rec?.system} title=${rec?.titleFromHeader}`);
  allOk = okAdd && allOk;

  // 2. it must show up in the vault screen, and in the library as "ready"
  await visit("#/vault", ["Vault Test"], "vault shows the ROM");
  const vaultText = (d.getElementById("view")?.textContent || "").replace(/\s+/g, " ");
  const okList = vaultText.includes("Vault Test") || vaultText.includes("vault-test");
  console.log(`${okList ? "ok  " : "FAIL"}  vault list mentions the file`);
  allOk = okList && allOk;

  // 3. attach it to a catalogue game, then the game sheet offers Play
  const { INDEX, gameByDb } = await import("../js/views/parts.js");
  const gbGames = [...INDEX].filter((g) => g.system === "gb").slice(0, 4);
  let okAttach = false;
  if (gbGames.length) {
    const game = gbGames[0];
    store.setGame(game.id, { romHash: rec.hash, system: "gb", fileName: "Vault Test (World).gb", size: rec.size });
    const owned = await import("../js/views/parts.js").then((m) => m.ownedCount("gb"));
    okAttach = owned >= 1;
    console.log(`${okAttach ? "ok  " : "FAIL"}  ownedCount("gb") = ${owned} after attaching to ${game.id}`);
    await visit("#/library/gb", [String(game.title).split(" (")[0].slice(0, 12)], "library/gb after attach");
    // open the game sheet by clicking its card
    const cards = d.getElementById("view").querySelectorAll(".card");
    if (cards[0]) {
      cards[0].click();
      await settle();
      const sheetEl = body.querySelector(".sheet");
      const sheetText = (sheetEl?.textContent || "").replace(/\s+/g, " ");
      const okSheet = !!sheetEl && sheetText.length > 40;
      console.log(`${okSheet ? "ok  " : "FAIL"}  game sheet open (${sheetText.length} chars)`);
      allOk = okSheet && allOk;
      // and the per-game config inside it must render
      const okCfg = sheetText.includes("Console model") || sheetText.includes("model");
      console.log(`${okCfg ? "ok  " : "FAIL"}  game sheet has config`);
      allOk = okCfg && allOk;
      // close it, and prove the close control works
      const close = sheetEl?.querySelector(".sheet__close") || body.querySelector(".sheet .btn--ghost") || body.querySelector(".sheet .btn");
      close?.click();
      await settle(5);
      const stillOpen = !!body.querySelector(".sheet:not(.is-closing)");
      console.log(`${!stillOpen ? "ok  " : "FAIL"}  game sheet closes`);
      allOk = !stillOpen && allOk;
    } else {
      console.log("FAIL  no .card nodes in library");
      allOk = false;
    }
  }
  allOk = okAttach && allOk;

  // 4. play the ROM: no runtime offline, so the deck must explain itself, not hang
  globalThis.location.hash = `#/play/rom:${rec.hash}?game=${encodeURIComponent(gbGames[0]?.id || "")}`;
  d.dispatchEvent(new globalThis.Event("hashchange"));
  await settle(60);
  await settle(60);
  await settle(60);
  const playText = (d.getElementById("player-root")?.textContent || "").replace(/\s+/g, " ");
  const okExplain = /vendor|offline|runtime|core|emulator|CDN|not reach/i.test(playText);
  console.log(`${okExplain ? "ok  " : "FAIL"}  rom route explains runtime (${playText.length} chars)`);
  if (!okExplain) console.log("     text: " + playText.slice(0, 200));
  allOk = okExplain && allOk;
  // dismiss any sheet, leave the player
  body.querySelector(".sheet .btn")?.click();
  await visit("#/", [], "leave the rom player");

  // 5. save state + screenshot through the real toolbar of a built-in
  await visit("#/play/builtin:stack", ["Stack Drop"], "play/builtin:stack (toolbar)");
  const pr = d.getElementById("player-root");
  const btns = pr.querySelectorAll("button").map((b) => (b.textContent || "").trim()).filter(Boolean);
  const saved = clickText(pr, "Save state");
  await settle(40);
  const states = await vault.statesFor("builtin:stack").catch(() => []);
  const okState = saved && states.length >= 1 && !!states[0].at;
  console.log(`${okState ? "ok  " : "FAIL"}  toolbar Save -> ${states.length} state(s), at=${states[0]?.at ? "set" : "MISSING"} (${btns.join("/")})`);
  allOk = okState && allOk;
  const loaded = clickText(pr, "States");
  await settle(20);
  console.log(`${loaded ? "ok  " : "FAIL"}  toolbar Load/States responds`);
  allOk = loaded && allOk;
  if (body.querySelector(".sheet")) {
    const stSheet = (body.querySelector(".sheet")?.textContent || "").replace(/\s+/g, " ");
    const okSheet2 = stSheet.includes("Vault") || stSheet.toLowerCase().includes("state") || stSheet.includes("Load");
    console.log(`${okSheet2 ? "ok  " : "FAIL"}  states sheet content: ${stSheet.slice(0, 90)}`);
    allOk = okSheet2 && allOk;
    body.querySelector(".sheet .btn")?.click();
  }
  const shot = clickText(pr, "Screenshot");
  await settle(20);
  console.log(`${shot ? "ok  " : "FAIL"}  screenshot button wired`);
  allOk = shot && allOk;
  await visit("#/", [], "back home after toolbar pass");

  // 5b. a bundled homebrew row must reach the player and fail *loudly* rather
  // than silently: in a fresh clone there is no such row, in a build with one
  // the fetch is blocked here, and both must produce an explanation, not a
  // spinner. (The real file fetch is covered by the HTTP checks in the README.)
  {
    const { INDEX } = await import("../js/views/parts.js");
    const anyBundled = INDEX.find((g) => g.source === "bundled");
    const ref = anyBundled ? `bundled:${anyBundled.id}` : "bundled:nes/not-in-the-catalogue";
    globalThis.location.hash = `#/play/${ref}`;
    d.dispatchEvent(new globalThis.Event("hashchange"));
    await settle(40);
    const txt = (d.getElementById("player-root")?.textContent || "").replace(/\s+/g, " ");
    const okFail = /could not read|no file in homebrew|nothing in the catalogue|no emulator|runtime|core/i.test(txt);
    console.log(`${okFail ? "ok  " : "FAIL"}  bundled route explains itself (${txt.slice(0, 70) || "empty"})`);
    allOk = okFail && allOk;
    await visit("#/", [], "leave the bundled route");
  }

  // 5b2. card art: a real image when there is one, the generated cover when the
  // image cannot load. Both halves matter - the shelf must never show a hole.
  {
    const { cover, coverSrc, gameById } = await import("../js/views/parts.js");
    const withPath = { id: "nes/art-check", title: "Art Check", system: "nes", cover: "covers/nes/art-check.png" };
    const el = cover(withPath, { w: 120, h: 160 });
    const img = el.querySelector("img");
    const okImg = Boolean(img) && img.getAttribute("src") === "covers/nes/art-check.png" && /--photo/.test(el.className);
    console.log(`${okImg ? "ok  " : "FAIL"}  a game with a cover file renders the real image    ${img ? img.getAttribute("src") : "no <img>"}`);
    allOk = okImg && allOk;
    img.dispatchEvent(new globalThis.Event("error"));
    const okSwap = !el.querySelector("img") && el.childNodes.length === 1 && !/--photo/.test(el.className);
    console.log(`${okSwap ? "ok  " : "FAIL"}  a missing cover file falls back to generated art   children=${el.childNodes.length} class=${el.className}`);
    allOk = okSwap && allOk;
    const bare = { id: "gb/no-art", title: "No Art", system: "gb" };
    const el3 = cover(bare, { w: 120, h: 160 });
    // the generated cover arrives through the `html` prop, so assert what matters:
    // no <img>, no photo class, and something is actually in there
    const okGen = !el3.querySelector("img") && !/--photo/.test(el3.className) && coverSrc(bare) === null && el3.childNodes.length >= 1;
    console.log(`${okGen ? "ok  " : "FAIL"}  no artwork at all still draws a generated cover    children=${el3.childNodes.length}, no <img>`);
    allOk = okGen && allOk;
    if (gameById) {
      const real = gameById("nes/super-mario-bros");
      if (real?.cover) console.log(`      note: the build indexes ${real.cover} into the catalogue`);
    }
  }

  // 5b3. the artwork a player picks: decode, store, read back, remove. No canvas
  // exists in this harness, so this also proves the code degrades to keeping the
  // original bytes instead of throwing (js/core/art.js hasCanvas branch).
  {
    const { setArtFromFile, artFor, artIds, clearArt } = await import("../js/core/art.js");
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFUlEQVR4nGP8z8DAwMDAwMDAwMAAAA4AA/8Q8CkAAAAASUVORK5CYII=", "base64");
    const file = { name: "my cover.png", type: "image/png", arrayBuffer: async () => png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength) };
    const id = "nes/super-mario-bros";
    const rec = await setArtFromFile(id, file);
    const back = await artFor(id);
    const ids = await artIds();
    const okStore = Boolean(back && back.src.startsWith("data:image/png") && back.name === "my cover.png" && ids.has(id) && rec.bytes > 0);
    console.log(`${okStore ? "ok  " : "FAIL"}  picked artwork is stored in the vault and read back  ${rec.w}x${rec.h} ${rec.bytes}B`);
    allOk = okStore && allOk;
    const { coverSrc, rememberArt, loadArt } = await import("../js/views/parts.js");
    await loadArt();
    rememberArt(id, back);
    const viaApp = coverSrc({ id, title: "Super Mario Bros.", system: "nes" });
    const okWire = typeof viaApp === "string" && viaApp.startsWith("data:image/");
    console.log(`${okWire ? "ok  " : "FAIL"}  the card reads stored art through coverSrc()           ${String(viaApp).slice(0, 22)}...`);
    allOk = okWire && allOk;
    await clearArt(id);
    rememberArt(id, null);
    const gone = await artFor(id);
    console.log(`${!gone ? "ok  " : "FAIL"}  removing artwork puts the generated cover back`);
    allOk = (!gone) && allOk;
    let refused = false;
    try {
      await setArtFromFile(id, { name: "notes.txt", type: "text/plain", arrayBuffer: async () => new ArrayBuffer(4) });
    } catch {
      refused = true;
    }
    console.log(`${refused ? "ok  " : "FAIL"}  a non-image is refused, not stored`);
    allOk = refused && allOk;
  }

  // 5c. the "Homebrew & Public Domain" shelf holds files from many consoles, so
  // its core is resolved from the file. It must never hand the loader a core
  // named "auto" (that is a 404 for cores/auto-wasm.data) and never guess for a .zip.
  {
    const { pickCore, coreForExt } = await import("../js/core/emulator.js");
    const got = {
      nesFile: pickCore("homebrew", { ext: "nes" }),
      snesName: pickCore("homebrew", { fileName: "Demo Game (World).sfc" }),
      zipFile: pickCore("homebrew", { ext: "zip" }),
      forced: pickCore("homebrew", { core: "gambatte", ext: "nes" }),
      normalShelf: pickCore("gb", {}),
      corelessDeck: pickCore("dreamcast", {}),
    };
    // Every value here must be a core the runtime publishes (tools/test.mjs checks
    // the list), which is why the file-extension answer is fceumm/snes9x and not a
    // console code - a console code is exactly what makes the loader 404.
    const okCore = got.nesFile === "fceumm" && got.snesName === "snes9x" && got.zipFile === null && got.forced === "gambatte"
      && got.normalShelf === "gambatte" && got.corelessDeck === null;
    console.log(`${okCore ? "ok  " : "FAIL"}  cores resolve from files, and a coreless deck resolves nothing  ${JSON.stringify(got)}`);
    const { SYSTEM_BY_ID } = await import("../js/data/systems.js");
    const dc = SYSTEM_BY_ID.dreamcast;
    const okNoCore = Boolean(dc) && dc.ejsCore === null && dc.cores.length === 0 && typeof dc.noCore === "string";
    console.log(`${okNoCore ? "ok  " : "FAIL"}  the coreless deck carries the sentence the player shows  "${String(dc?.noCore).slice(0, 42)}..."`);
    allOk = okNoCore && allOk;
    allOk = okCore && allOk;
    const { SYSTEMS } = await import("../js/data/systems.js");
    const auto = SYSTEMS.filter((sys) => pickCore(sys.id, { ext: "bin" }) === "auto").map((sys) => sys.id);
    console.log(`${auto.length ? "FAIL" : "ok  "}  no deck asks for a core called auto                ${auto.join(",") || "(26 decks resolve a real core)"}`);
    allOk = (auto.length === 0) && allOk;
    // every extension the shelf accepts must belong to a console it can name
    const hb = SYSTEMS.find((sys) => sys.id === "homebrew");
    const orphans = (hb.exts || []).filter((e) => !["zip", "7z"].includes(e) && !coreForExt(e));
    console.log(`${orphans.length ? "FAIL" : "ok  "}  homebrew extensions all map to a core            ${orphans.join(",") || hb.exts.length + " extensions"}`);
    allOk = (orphans.length === 0) && allOk;
  }

  // 5d. no deck may render an empty choice anywhere: a select with no options is
  // how a form advertises a setting it cannot honour.
  {
    const { configForm } = await import("../js/views/config.js");
    const { SYSTEMS } = await import("../js/data/systems.js");
    const walk = (node, out = []) => { for (const c of node.childNodes || []) { out.push(c); walk(c, out); } return out; };
    const empty = [];
    for (const s of SYSTEMS) {
      let el;
      try { el = configForm({ sysId: s.id, cfg: {}, set() {}, scope: "system" }); }
      catch (err) { empty.push(`${s.id}: threw ${err.message}`); continue; }
      for (const n of walk(el)) if (String(n.tagName || "").toLowerCase() === "select" && !(n.childNodes || []).length) empty.push(`${s.id}: a select with no options`);
    }
    console.log(`${empty.length ? "FAIL" : "ok  "}  every deck's config form has a choice for every row    ${empty.slice(0, 3).join(" | ") || SYSTEMS.length + " forms rendered"}`);
    allOk = (empty.length === 0) && allOk;
  }

  // 6. settings: warm-cache button and key capture must not throw
  await visit("#/settings", ["Keyboard map"], "settings (deep)");
  const view = d.getElementById("view");
  clickText(view, "Warm");
  await settle(30);
  const kbd = view.querySelector(".kbd");
  if (kbd) {
    const setBtn = view.querySelectorAll("button").find((b) => (b.textContent || "").includes("Rebind"));
    setBtn?.click();
    globalThis.dispatchEvent(new globalThis.KeyboardEvent("keydown", { key: "j", code: "KeyJ" }));
    await settle(10);
    const okKey = (view.textContent || "").includes("J");
    console.log(`${okKey ? "ok  " : "FAIL"}  key capture wrote "J" into the map`);
    allOk = okKey && allOk;
  } else {
    console.log("FAIL  no .kbd cell in the keyboard map");
    allOk = false;
  }
}

const noise = errors.filter((e) => !e.includes("offline") && !e.includes("view crashed"));
if (noise.length) {
  console.log(`\nconsole noise (${noise.length}):`);
  for (const e of [...new Set(noise)].slice(0, 10)) console.log("  - " + e.slice(0, 200));
}
if (!allOk) {
  console.log(`\nSMOKE FAILURES (${elapsed()})`);
  process.exit(1);
}
console.log(`\nall views rendered headlessly in ${elapsed()}`);

// pending watchdog timers are expected; do not sit on them
process.exit(allOk ? 0 : 1);
