/**
 * Settings: the global half of the configuration ladder (the deck view owns the
 * per-console half, the game sheet owns per-game overrides).
 *
 * Every control writes through store.set(), so the value lands in localStorage
 * immediately and any view watching that path updates.
 */
import { store, fmtBytes } from "../core/store.js";
import { SYSTEMS, SYSTEM_BY_ID } from "../data/systems.js";
import { PADS } from "../data/layouts.js";
import { vault } from "../core/idb.js";
import { probeEmulator, localVendorPresent, dataBase, CDN_VERSIONS } from "../core/emulator.js";
import { h, mount, toggle, range, select, sectionTitle, toast, sheet, pickFiles, confirmSheet, copyText, download } from "../ui.js";
import { keyGrid } from "./config.js";
import { INDEX_META, BUILTINS, sysName } from "./parts.js";

export async function renderSettings(root, ctx) {
  let storageLine = "…";
  const g = (k, d) => store.get(k, d);
  const set = (path, v) => {
    store.set(path, v);
    if (path.startsWith("ui.")) render();
  };

  mount(
    root,
    h("section", {},
      h("h1", {}, "Settings"),
      h("p.muted.small", {}, `${INDEX_META.count} indexed titles · ${SYSTEMS.length} systems · ${BUILTINS.length} built-in games. ` +
        "Stored in localStorage under ", h("code", {}, "retrodeck.v1"), "; game files live in IndexedDB.")),
    runtimeSection(),
    block("Look",
      sel("ui.theme", "Theme", [["midnight", "Midnight"], ["light", "Daylight"], ["high-contrast", "High contrast"]]),
      sel("ui.density", "Density", [["cozy", "Cozy"], ["compact", "Compact"]]),
      sel("ui.coverStyle", "Card artwork", [["pixel", "Pixel mosaic"], ["flat", "Flat panel"], ["label", "Label"]], "drawn in the browser, never downloaded"),
      tgl("ui.reduceMotion", "Reduce motion"),
      tgl("ui.showNagAboutRoms", "Show the bring-your-own-ROM notice on Home")),
    block("Playing",
      tgl("play.autoStart", "Boot the core as soon as it loads"),
      tgl("play.fullscreenOnPlay", "Go fullscreen when a game starts"),
      tgl("play.keepScreenOn", "Keep the screen awake"),
      sel("play.orientationLock", "Orientation lock", [["auto", "Auto"], ["landscape", "Landscape"], ["portrait", "Portrait"]], "phones only honour this in fullscreen"),
      tgl("play.showPad", "Show the on-screen pad"),
      tgl("play.padFloat", "Float the pad over the picture", "off = the pad gets its own strip under the screen"),
      sel("play.padZone", "Pad placement", [["edges", "Corners (thumbs)"], ["left-right", "Split left / right"], ["bottom", "Bottom strip"]]),
      rng("play.padScale", "Pad size", 0.6, 1.6, 0.05, 1, (v) => `${Math.round(v * 100)}%`),
      rng("play.padOpacity", "Pad opacity", 0.25, 1, 0.05, 1, (v) => `${Math.round(v * 100)}%`),
      tgl("play.haptics", "Vibrate on button hits", "navigator.vibrate - Android Chrome, not iOS"),
      tgl("play.rumble", "Rumble for gamepads that support it"),
      gamepadRow(),
      tgl("play.showMenuButton", "Show the emulator menu button"),
      tgl("play.doubleTapForMenu", "Double-tap the screen for the emulator menu")),
    block("Emulator",
      sel("emulator.source", "Payload source", [["cdn", "cdn.emulatorjs.org"], ["local", "./vendor (self-hosted)"]], "`npm run vendor` creates the local copy"),
      sel("emulator.version", "Channel", CDN_VERSIONS.map((v) => [v, v])),
      tgl("emulator.threads", "Shared WASM memory / threads", "needs COOP+COEP - `npm run dev -- --threads` sends them"),
      tgl("emulator.cache", "Keep cores in browser storage"),
      rng("emulator.cacheMaxSizeMB", "Core cache cap", 256, 8192, 256, 1, (v) => `${v} MB`),
      sel("emulator.inputBridge", "Button bridge", [
        ["keyboard", "Keyboard events - default, works with every core"],
        ["direct", "Direct callEvent RPC - fewer hops, experimental"],
        ["both", "Both"],
      ], "how the on-screen pad and your keys reach the core"),
      sel("emulator.saveStateLocation", "Save states", [
        ["browser", "Browser - RetroDeck reads them back"],
        ["download", "Download to my files"],
        ["both", "Both"],
      ]),
      tgl("emulator.exitConfirm", "Ask before leaving a running game"),
      tgl("emulator.disableAutoUnload", "Do not unload the core when the tab hides"),
      rng("emulator.volume", "Volume", 0, 100, 1, 100, (v) => `${v}%`),
      sel("emulator.shaders", "Default shader", [["none", "None"], ["crt", "CRT"], ["scanlines", "Scanlines"], ["grille", "Grille"]]),
      tgl("emulator.rewind", "Rewind by default"),
      tgl("emulator.fastForward", "Fast forward by default"),
      h("div.row", {},
        h("span.row__label", {}, "Per-console core overrides", h("small.muted", {}, "live in each deck's Defaults panel")),
        h("button.btn.btn--sm.btn--ghost", { onclick: () => ctx.go("/decks") }, "Hardware ▸"))),
    controlsSection(),
    dataSection(),
    aboutSection(),
  );

  vault.usage().then((u) => {
    storageLine = u ? `${fmtBytes(u.usage)} of ${fmtBytes(u.quota)}` : "unavailable";
    const el = root.querySelector("[data-storage]");
    if (el) el.textContent = storageLine;
  });

  function render() {
    return import("../app.js").then((m) => m.render());
  }
  function tgl(path, label, hint) {
    return toggle(label, g(path, false), (v) => set(path, v), hint);
  }
  function sel(path, label, options, hint) {
    return select(label, g(path, options[0][0]), options, (v) => set(path, v), hint);
  }
  /** stored 0..1 values are shown as 0..100 via `scale` */
  function rng(path, label, min, max, step, scale, fmt) {
    const raw = g(path, 1);
    return range(label, scale === 100 ? Math.round(raw * 100) : raw, min, max, step, (v) => set(path, scale === 100 ? v / 100 : v), fmt);
  }
  function block(title, ...rows) {
    return h("section", {}, sectionTitle(title), h("div.rows", {}, ...rows));
  }

  /* ------------------------------------------------------------- runtime */
  /**
   * What the browser has actually seen. The pad layer polls gamepads while a
   * game runs, so this row is a diagnostic, not a requirement - hence no
   * listeners and no lifecycle to unwind.
   */
  function gamepadRow() {
    const list = h("b.mono.small", {}, "checking…");
    const scan = () => {
      const pads = [];
      try {
        for (const p of navigator.getGamepads?.() || []) if (p) pads.push(p);
      } catch {
        /* no Gamepad API in this browser */
      }
      list.textContent = pads.length
        ? pads.map((p, i) => `#${i + 1} ${String(p.id).replace(/\s*\(.*\)\s*$/, "")} · ${p.buttons.length} btn`).join(" | ")
        : "none connected";
    };
    scan();
    return h("div.row", {},
      h("span.row__label", {}, "Gamepads", h("small.muted", {}, "standard mapping - the deck reads them while you play")),
      h("div", { style: { display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" } },
        list,
        h("button.btn.btn--sm.btn--ghost", { onclick: scan }, "Rescan")));
  }

  function runtimeSection() {
    const box = h("div.notice", {}, h("span.small.muted", {}, "Checking the emulator runtime…"));
    fill();
    return box;

    async function fill() {
      const local = await localVendorPresent();
      const p = await probeEmulator({ timeout: 4000 });
      const src = g("emulator.source", "cdn");
      const ready = src === "local" ? local : p.ok;
      box.className = `notice${ready ? "" : " notice--warn"}`;
      mount(box,
        h("b", {}, `Runtime: ${ready ? "ready" : "not reachable"}`),
        h("span", {}, "Active data path: ", h("code", {}, dataBase()), ". ",
          local ? "A local mirror is present, so cartridges load with the radio off. "
                : "No local mirror here - run `npm run vendor` once and this install becomes fully offline. ",
          p.ok ? "The EmulatorJS CDN answered." : "The CDN did not answer (offline, or a policy blocking it)."),
        h("div.notice__row", {},
          h("button.btn.btn--sm", { onclick: (e) => warm(e.currentTarget) }, "Warm the loader cache"),
          h("button.btn.btn--sm.btn--ghost", { onclick: () => { mount(box, h("span.small.muted", {}, "Checking…")); fill(); } }, "Re-check"),
          h("span.small.mono.muted", {}, `source: ${src} · ${g("emulator.version", "stable")}`)));
    }

    /**
     * Hand the runtime's small files to whoever can keep them: the service
     * worker (Cache Storage, so a cold offline start still boots) and the
     * browser's own HTTP cache (which the core's loader reads directly).
     * The core blobs (cores/<name>-wasm.data, tens of MB each) are deliberately
     * not fetched here - the emulator caches those in IndexedDB, and pulling them
     * twice would be a lot of megabytes for nothing.
     */
    async function warm(btn) {
      btn.disabled = true;
      btn.textContent = "fetching…";
      const urls = coreUrls();
      const reg = await navigator.serviceWorker?.getRegistration?.().catch(() => null);
      reg?.active?.postMessage({ type: "warm", urls });
      const res = await Promise.allSettled(urls.map((u) => fetch(u, { mode: "cors", cache: "reload" }).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))));
      const ok = res.filter((x) => x.status === "fulfilled").length;
      const failed = res.find((x) => x.status === "rejected");
      toast(
        ok
          ? `${ok}/${urls.length} loader files cached - the deck boots offline now. Cores themselves are stored by the emulator under Settings ▸ Emulator ▸ Keep cores in browser storage.`
          : `Nothing could be fetched: offline, or the mirror refused (${failed ? failed.reason?.message : "no urls"})`,
        ok ? "good" : "bad",
        6000,
      );
      btn.disabled = false;
      btn.textContent = "Warm the loader cache";
    }
  }

  /**
   * The small files every boot asks the CDN for. Cores are deliberately absent:
   * each one is a single tens-of-megabytes blob that EmulatorJS stores in its own
   * IndexedDB, and the service worker refuses to double-cache big wasm/data files.
   */
  function coreUrls() {
    const base = dataBase().replace(/\/?$/, "/");
    return [`${base}loader.js`, `${base}emulator.min.js`, `${base}emulator.min.css`, `${base}version.json`, `${base}cores/cores.json`];
  }

  /* ----------------------------------------------------------- keyboard */
  function controlsSection() {
    const sysSel = h("select", { "aria-label": "Which console's keys", onchange: (e) => paint(e.target.value) },
      ...SYSTEMS.map((s, i) => h("option", { value: s.id, selected: i === 1 }, `${s.name} - ${PADS[s.pad]?.name || s.pad}`)));
    const holder = h("div", {});
    paint(SYSTEMS[1].id);
    return h("section", {},
      sectionTitle("Keyboard map", h("span.small.muted", {}, "the on-screen pad sends these same keys")),
      h("div.rows", {},
        h("div.row", {},
          h("span.row__label", {}, "Console", h("small.muted", {}, "per-system keys are stored in that system's config layer")),
          sysSel),
        h("div.row", {},
          h("span.row__label", {}, "Reset this console's keys"),
          h("button.btn.btn--sm.btn--ghost", { onclick: () => reset() }, "Reset"))),
      holder);

    function paint(sysId) {
      const sys = SYSTEM_BY_ID[sysId];
      const cfg = store.systemConfig(sysId);
      mount(holder, keyGrid(sys, cfg.controls || {}, (patch) => {
        store.setSystem(sysId, { controls: { ...(store.systemConfig(sysId).controls || {}), ...patch } });
      }));
    }
    async function reset() {
      const sysId = sysSel.value;
      const ok = await confirmSheet("Reset the keyboard map?", `Back to the ${sysName(sysId)} defaults for this console.`, "Reset");
      if (!ok) return;
      store.setSystem(sysId, { controls: {} });
      paint(sysId);
      toast("Keys back to defaults", "good");
    }
  }

  /* --------------------------------------------------------------- data */
  function dataSection() {
    return h("section", {},
      sectionTitle("Your data"),
      h("div.rows", {},
        h("div.row", {},
          h("span.row__label", {}, "Settings", h("small.muted", {}, "JSON - safe to keep in a private repo or Dropbox")),
          h("div", { style: { display: "flex", gap: "6px" } },
            h("button.btn.btn--sm", { onclick: () => exportSheet() }, "Export"),
            h("button.btn.btn--sm.btn--ghost", { onclick: () => importFlow() }, "Import"))),
        h("div.row", {},
          h("span.row__label", {}, "Storage estimate", h("small.muted", {}, "what the browser reports for this origin")),
          h("b.mono.small", { dataset: { storage: "1" } }, storageLine)),
        h("div.row", {},
          h("span.row__label", {}, "Vault", h("small.muted", {}, "cartridges, BIOS, save states")),
          h("button.btn.btn--sm.btn--ghost", { onclick: () => ctx.go("/vault") }, "Open vault")),
        h("div.row", {},
          h("span.row__label", {}, "Reset settings", h("small.muted", {}, "leaves the vault alone")),
          h("button.btn.btn--sm.btn--danger", { onclick: () => resetAll() }, "Reset"))));
  }

  function aboutSection() {
    return h("section", {},
      sectionTitle("About"),
      h("div.rows", {},
        h("div.row", {}, h("span.row__label", {}, "Build"), h("b.mono.small", {}, `catalog ${INDEX_META.built} · ${INDEX_META.count} titles`)),
        h("div.row", {}, h("span.row__label", {}, "Licence"), h("b.mono.small", {}, "MIT - see LICENSE / NOTICE.md")),
        h("div.row", {}, h("span.row__label", {}, "Emulator"), h("b.mono.small", {}, "EmulatorJS, loaded from CDN or ./vendor")),
        h("div.row", {},
          h("span.row__label", {}, "ROMs, privacy, the fine print"),
          h("button.btn.btn--sm.btn--ghost", { onclick: () => legalSheet() }, "Show"))));
  }
}

function legalSheet() {
  sheet("Licence, ROMs and privacy",
    h("div", { style: { display: "grid", gap: "10px" } },
      h("div.notice", {}, h("b", {}, "No ROMs."),
        h("span", {}, "This repository contains no game images, no BIOS images, no links to either, and no scraping of storefronts. " +
          "The 488-title index is titles, years, genres, player counts and control notes - metadata, which is what lets you configure a deck for a cartridge you own.")),
      h("div.notice", {}, h("b", {}, "Everything stays on the device."),
        h("span", {}, "Settings in localStorage, files in IndexedDB, no analytics, no accounts, no beacons. The only network traffic this app can generate is the EmulatorJS payload you opted into - or the ./vendor copy you made yourself.")),
      h("div.notice", {}, h("b", {}, "Play your own games."),
        h("span", {}, "Downloading a ROM of a title you do not own is infringement almost everywhere. Dump your own cartridges, or play the six built-in originals.")),
      h("p.small.muted", {}, "RetroDeck source is MIT licensed; see LICENSE for the code and NOTICE.md for the third-party list and this project's boundaries.")),
    { wide: true });
}

function exportSheet() {
  const text = store.exportText();
  const ta = h("textarea", {
    rows: 12,
    readonly: true,
    style: { width: "100%", fontFamily: "var(--mono)", fontSize: "0.7rem", background: "var(--bg-2)", color: "var(--ink)", border: "var(--line)", borderRadius: "var(--r-sm)", padding: "10px" },
  });
  ta.value = text;
  sheet("Your settings",
    h("div", { style: { display: "grid", gap: "10px" } },
      h("p.sheet__p", {}, `${(text.length / 1024).toFixed(1)} kB of JSON: decks, per-console defaults, per-game overrides, favourites and play history. No ROM bytes in here.`),
      ta,
      h("div", { style: { display: "flex", gap: "8px", flexWrap: "wrap" } },
        h("button.btn.btn--primary", {
          onclick: async () => toast((await copyText(text)) ? "Copied" : "Copy was blocked - select the text and copy manually", "good"),
        }, "Copy"),
        h("button.btn", { onclick: () => download("retrodeck-settings.json", new Blob([text], { type: "application/json" })) }, "Download"),
        h("button.btn.btn--ghost", { onclick: () => ta.select() }, "Select all"))),
    { wide: true });
}

function importFlow() {
  (async () => {
    const files = await pickFiles({ accept: "application/json,.json" });
    if (!files.length) return;
    const text = await files[0].text();
    const ok = await confirmSheet("Replace your settings?", `Import ${files[0].name}. This overwrites decks, controls and per-game configuration - the vault files stay.`, "Import");
    if (!ok) return;
    const res = store.importText(text);
    toast(res?.ok ? "Settings imported" : `Import failed: ${res?.error || "bad JSON"}`, res?.ok ? "good" : "bad", 5000);
    import("../app.js").then((m) => m.render());
  })();
}

async function resetAll() {
  const ok = await confirmSheet("Reset every setting?", "Cartridges, BIOS images and save states in the vault are untouched.", "Reset settings");
  if (!ok) return;
  store.reset("all");
  toast("Settings back to defaults", "good");
  import("../app.js").then((m) => m.render());
}
