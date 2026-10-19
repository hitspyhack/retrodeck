/**
 * RetroDeck - EmulatorJS bridge.
 *
 * Why an iframe: a phone browser has to be able to *fully* throw a WASM core
 * away when you leave a game (cores hold 40-200MB of linear memory; leaking them
 * is how these sites crash iOS Safari). Destroying a frame is the only
 * guaranteed teardown, and it also lets the deck keep its shell, pad and HUD
 * alive while the core dies.
 *
 * Only *documented* EmulatorJS options are used:
 *   EJS_player, EJS_core, EJS_gameUrl, EJS_biosUrl, EJS_gameName, EJS_gameID,
 *   EJS_pathtodata, EJS_startOnLoaded, EJS_threads, EJS_color,
 *   EJS_backgroundColor, EJS_defaultControls, EJS_controlScheme,
 *   EJS_defaultOptions, EJS_volume, EJS_CacheLimit, EJS_videoRotation,
 *   EJS_fullscreenOnLoaded, EJS_threads, EJS_cheats, EJS_onGameStart, EJS_ready,
 *   EJS_onSaveState, EJS_onLoadState, EJS_onSaveSave, EJS_onLoadSave.
 *
 * That list is not from the documentation page - it is every `EJS_*` key that
 * `data/loader.js` of the pinned runtime actually forwards, and tools/test.mjs
 * fails if this file sets a key that loader ignores. (Five keys used to live here
 * that nothing read: EJS_cacheConfig, EJS_askBeforeExit, EJS_disableAutoUnload,
 * EJS_onSaveUpdate, EJS_onExit. The last two meant the "save written" toast and
 * the exit event were wired to callbacks EmulatorJS never calls.)
 * Saves and states are mirrored back into IndexedDB (js/core/idb.js) so a
 * browser refresh does not cost you a 20-hour RPG.
 */

import { store } from "./store.js";
import { vault } from "./idb.js";
import { ejsControls } from "./pad.js";
import { SYSTEMS, SYSTEM_BY_ID } from "../data/systems.js";
import { cheatsFor, ejsCheats } from "./cheats.js";
import { MODEL_BY_ID } from "../data/models.js";

/**
 * Channels the app can boot a payload from. These are real directories on the
 * CDN, snapshotted in `data/source/emulatorjs.json` (re-run
 * `node tools/refresh-runtime.mjs` to refresh it) - `tools/test.mjs` fails if a
 * name here is not one of the channels the CDN actually publishes. There is no
 * `latest` or `nightly` directory, so offering them would be a broken dropdown.
 */
export const CDN_VERSIONS = ["stable", "4.2.3", "4.2.2", "4.2.1", "4.2.0", "4.1.1"];

export function dataBase() {
  const src = store.get("emulator.source", "cdn");
  if (src === "local") return `${rel("vendor/data/")}`;
  const base = store.get("emulator.cdnBase", "https://cdn.emulatorjs.org").replace(/\/+$/, "");
  return `${base}/${store.get("emulator.version", "stable")}/data/`;
}
function rel(p) {
  return p.startsWith("/") ? p : `./${p}`;
}

/** Is the emulator payload reachable? (CDN blocked / offline → we must not pretend.) */
export async function probeEmulator({ timeout = 6000 } = {}) {
  const url = `${dataBase()}version.json`;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(url, { signal: ctl.signal, cache: "no-store" });
    clearTimeout(t);
    return { ok: r.ok, url, status: r.status };
  } catch (err) {
    clearTimeout(t);
    return { ok: false, url, error: err?.name === "AbortError" ? "timeout" : String(err?.message || err) };
  }
}

export async function localVendorPresent() {
  try {
    const r = await fetch(`${rel("vendor/data/loader.js")}`, { method: "HEAD", cache: "no-store" });
    return r.ok;
  } catch {
    return false;
  }
}

/** The control-scheme names EmulatorJS accepts for EJS_controlScheme. */
export const EJS_SCHEMES = new Set([
  "nes", "gb", "gba", "snes", "n64", "nds", "vb",
  "segaMD", "segaCD", "sega32x", "segaMS", "segaGG", "segaSaturn",
  "3do", "atari2600", "atari7800", "lynx", "jaguar", "arcade", "mame",
]);

/* --------------------------------------------------------------------- player */
export class EmuPlayer {
  /**
   * @param {object} o
   * @param {HTMLElement} o.host     element that receives the frame
   * @param {object} o.game          catalog entry (or a vault ROM record)
   * @param {object} o.rom           { bytes:Uint8Array, name:string }
   * @param {string} o.systemId
   * @param {string|null} o.modelId
   * @param {object} o.config        merged config from store.resolvedFor()
   */
  constructor(o) {
    this.o = o;
    this.system = SYSTEM_BY_ID[o.systemId];
    this.model = o.modelId ? MODEL_BY_ID[o.modelId] : null;
    this.cfg = o.config || {};
    this.frame = null;
    this.blobUrls = [];
    this.handlers = new Set();
    this.dead = false;
    this.started = false;
    this.lastError = null;
    /** which core this boot asked the loader for - error copy names it */
    this.coreName = null;
  }

  on(fn) {
    this.handlers.add(fn);
    return () => this.handlers.delete(fn);
  }
  #emit(type, payload = {}) {
    for (const fn of this.handlers) {
      try {
        fn({ type, ...payload });
      } catch (err) {
        console.warn("[retrodeck] handler failed", err);
      }
    }
  }

  async #romUrl() {
    const { rom } = this.o;
    if (!rom?.bytes) return null;
    const blob = new Blob([rom.bytes], {
      type: this.o.game?.ext === "zip" ? "application/zip" : "application/octet-stream",
    });
    const url = URL.createObjectURL(blob);
    this.blobUrls.push(url);
    return url;
  }

  async #biosUrl() {
    const biosNeed = this.system?.bios;
    if (!biosNeed) return null;
    const rec = await vault.biosFor(this.o.systemId);
    if (!rec?.bytes) {
      if (biosNeed.required)
        this.#emit("warn", {
          code: "missing-bios",
          msg: `${this.system.name} needs a BIOS image: ${biosNeed.label}. Add it in Vault ▸ BIOS, or the core will show its own prompt.`,
        });
      return null;
    }
    const url = URL.createObjectURL(new Blob([rec.bytes], { type: "application/octet-stream" }));
    this.blobUrls.push(url);
    return url;
  }

  /** Build the frame's document. Everything is inline: no fetch, no CSP surprises. */
  async #doc({ gameUrl, biosUrl, controls, opts }) {
    const base = dataBase();
    const color = this.model?.skinAccent || this.system?.color || "#1AAFFF";
    // EmulatorJS only understands a handful of named schemes; anything else is
    // left unset so the core keeps its own defaults instead of a wrong layout.
    const scheme = EJS_SCHEMES.has(this.system?.controlScheme) ? this.system.controlScheme : "";
    const vol = Number(store.get("emulator.volume", 0.7));
    // EJS_CacheLimit is compared against a content-length in BYTES (the runtime's
    // own default is 1073741824), so the MB slider converts here; 0 disables the
    // runtime's IndexedDB store, which is what "keep cores in browser storage" off
    // is supposed to mean.
    const cacheLimit = store.get("emulator.cache", true)
      ? Math.max(0, Number(store.get("emulator.cacheMaxSizeMB", 2048)) || 0) * 1048576
      : 0;
    const rot = Number(this.cfg.rotate ?? 0);
    const gameId = Number(this.o.game?.db || this.o.game?.gameId || 1) || 1;
    // Read at boot, not at edit time: your list is in the vault, so the core always
    // starts with the current one and no restart dance is needed after typing.
    const cheats = this.system?.features?.cheats === false ? [] : ejsCheats(await cheatsFor(this.gameKey));
    const patchUrl = (p) => JSON.stringify(p);

    return `<!doctype html>
<html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no,viewport-fit=cover">
<style>
  html,body{margin:0;padding:0;height:100%;background:#000;overflow:hidden;
    font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;color:#e8ecf3}
  #game{position:fixed;inset:0}
  #boot{position:fixed;inset:0;display:grid;place-items:center;gap:8px;padding:24px;text-align:center;
    background:#05070c;font-size:14px;line-height:1.5;z-index:5}
  #boot .b{width:120px;height:4px;border-radius:3px;background:#1b2436;overflow:hidden}
  #boot .b i{display:block;height:100%;width:35%;background:${color};animation:s 1.1s infinite ease-in-out}
  @keyframes s{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}
</style></head>
<body>
<div id="game"></div>
<div id="boot"><div>Loading ${esc(this.system?.name || "core")} core…</div>
  <div class="b"><i></i></div>
  <div style="opacity:.6;font-size:12px">${esc(base)}</div></div>
<script>
(function(){
  var send = function(type, payload){ try{ parent.postMessage(Object.assign({t:type}, payload||{}), location.origin); }catch(e){} };
  window.__send = send;
  try {
    window.EJS_player = '#game';
    ${opts.core ? `window.EJS_core = ${patchUrl(opts.core)};` : "/* EJS_core left unset: the loader detects it from the file */"}
    window.EJS_gameUrl = ${patchUrl(gameUrl)};
    window.EJS_biosUrl = ${patchUrl(biosUrl || '')};
    window.EJS_gameName = ${patchUrl(opts.name)};
    window.EJS_gameID = ${gameId};
    window.EJS_pathtodata = ${patchUrl(base)};
    window.EJS_color = ${patchUrl(color)};
    window.EJS_backgroundColor = ${patchUrl('#05070c')};
    window.EJS_startOnLoaded = ${!!opts.autoStart};
    window.EJS_threads = ${!!store.get("emulator.threads", false)};
    window.EJS_volume = ${vol};
    window.EJS_CacheLimit = ${cacheLimit};
    ${cheats.length ? `window.EJS_cheats = ${JSON.stringify(cheats)};` : "/* no cheats for this game: EJS_cheats stays unset */"}
    window.EJS_controlScheme = ${patchUrl(scheme)};
    window.EJS_defaultControls = ${JSON.stringify(controls)};
    window.EJS_defaultOptions = ${JSON.stringify(opts.options)};
    ${rot ? `window.EJS_videoRotation = ${rot};` : ""}
    ${opts.fullscreen ? "window.EJS_fullscreenOnLoaded = true;" : ""}
    window.EJS_ready = function(){ send('ready'); var b=document.getElementById('boot'); if(b) b.remove(); };
    window.EJS_onGameStart = function(){ send('start'); var b=document.getElementById('boot'); if(b) b.remove(); };
    window.EJS_onSaveState = function(e){
      try { send('state', { slot: window.__slot || 0, shot: (e && e[0]) || null, bytes: (e && e[1]) || (e && e.state) || null }); }
      catch(err){ send('error', { msg: 'state export failed: ' + err.message }); }
    };
    window.EJS_onLoadState = function(e){ send('state-loaded', { slot: window.__slot || 0 }); };
    window.EJS_onSaveSave = function(e){
      try { send('sram', { shot: e && e.screenshot, bytes: e && e.save }); } catch(err){}
    };
    window.EJS_onLoadSave = function(e){
      try { send('sram-loaded', { bytes: e && e.save }); } catch(err){}
    };
    // There is no exit callback in this runtime. Page hide is the closest real
    // signal, and the runtime does expose a flush, so ask it to write the battery
    // save and then tell the parent - "closed the tab mid-dungeon" should not cost
    // the last few minutes.
    window.__flush = function(){
      try {
        var g = window.EJS_emulator && window.EJS_emulator.gameManager;
        if (g && g.saveSaveFiles) g.saveSaveFiles();
      } catch(err){}
    };
    window.addEventListener('pagehide', function(){ window.__flush(); send('exit'); });
    document.addEventListener('visibilitychange', function(){ if (document.visibilityState === 'hidden') window.__flush(); });
    window.addEventListener('error', function(ev){ send('error', { msg: (ev && ev.message) || 'core error' }); });
    window.addEventListener('message', function(ev){
      var d = ev.data || {};
      if (d.t === 'btn') {
        try {
          var emu = window.EJS_emulator;
          if (emu && emu.callEvent) emu.callEvent('button', [d.idx, !!d.down]);
        } catch(err){}
      } else if (d.t === 'slot') { window.__slot = d.slot; }
      else if (d.t === 'call' && window.EJS_emulator && window.EJS_emulator.callEvent) {
        try { window.EJS_emulator.callEvent(d.name, d.arg); } catch(err){ send('error', {msg: String(err.message||err)}); }
      } else if (d.t === 'opt' && window.EJS_emulator && window.EJS_emulator.menu) {
        try { window.EJS_emulator.menu.setSetting?.(d.key, d.value); send('opt-set', d); } catch(err){ send('error', {msg:String(err.message||err)}); }
      }
    });
  } catch(err){ send('error', { msg: 'setup failed: ' + (err && err.message) }); }
})();
<\/script>
<script src="${base}loader.js" onerror="window.__send('loader-error',{url:${patchUrl(base + "loader.js")},core:${patchUrl(opts.core || "")}})"><\/script>
</body></html>`;
  }

  async start() {
    const gameUrl = await this.#romUrl();
    if (!gameUrl) {
      this.#emit("error", { code: "no-rom", msg: "No cartridge image loaded. Pick a ROM in Vault first." });
      return false;
    }
    const biosUrl = await this.#biosUrl();
    const core = pickCore(this.o.systemId, { ...this.cfg, ext: this.o.game?.ext, fileName: this.o.rom?.name });
    this.coreName = core;
    if (!core && this.system?.noCore) {
      // Do not spend a request on a core the runtime does not ship.
      this.#emit("error", { code: "no-core", msg: this.system.noCore });
      return false;
    }
    const options = {
      "save-state-location": store.get("emulator.saveStateLocation", "browser"),
      "rewind_granularity": 2,
      "rewind_enable": this.cfg.rewind ? "enabled" : "disabled",
      "fast_rewind_enable": "enabled",
      "video_aspect_ratio": this.cfg.aspect || "1:1",
      "video_scale_integer": this.cfg.upscale === "integer" ? "enabled" : "disabled",
      "audio_volume": "0.0",
      ...(this.system?.id === "segaMD" ? { genesis_plus_gx_region: this.cfg.region || "auto" } : {}),
      ...(this.system?.id === "psx" ? { pcsx_rearmed_frameskip: this.cfg.frameskip ? "1" : "0" } : {}),
      ...(this.system?.id === "n64" ? { parallel_core_video_correction: "enabled" } : {}),
      ...(this.cfg.palette ? { gbs_palette: this.cfg.palette } : {}),
    };
    const controls = ejsControls(this.system, this.cfg.controls);
    const doc = await this.#doc({
      gameUrl,
      biosUrl,
      controls,
      opts: {
        core,
        name: safeName(this.o.game?.title || this.o.game?.name || this.o.rom?.name || "game"),
        autoStart: store.get("play.autoStart", true),
        options,
        fullscreen: false,
      },
    });

    await this.stop();
    const frame = document.createElement("iframe");
    frame.className = "ejs-frame";
    frame.setAttribute("title", `${this.o.game?.title || "Emulator"} screen`);
    frame.setAttribute(
      "allow",
      "fullscreen; autoplay; gamepad; keyboard-map; hid; serial; usb; pointer-lock; screen-wake-lock"
    );
    frame.setAttribute(
      "sandbox",
      "allow-scripts allow-same-origin allow-pointer-lock allow-popups allow-downloads allow-forms allow-modals"
    );
    frame.srcdoc = doc;
    this.frame = frame;
    this.o.host.innerHTML = "";
    this.o.host.appendChild(frame);

    const onMsg = (ev) => {
      if (!ev.data || typeof ev.data !== "object") return;
      if (this.frame && ev.source !== this.frame.contentWindow) return;
      this.#route(ev.data);
    };
    this._onMsg = onMsg;
    window.addEventListener("message", onMsg);

    // watchdog: if no core chatter at all, it's almost certainly offline
    this.timer = setTimeout(() => {
      if (!this.started)
        this.#emit("error", {
          code: "core-timeout",
          core: this.coreName,
          msg:
            `The emulator payload never answered (${dataBase()}). On a phone this usually means the CDN is blocked ` +
            "or you are offline. Settings ▸ Emulator ▸ Payload source → ./vendor (self-hosted) after running `npm run vendor`, or play a built-in title.",
        });
    }, 25000);
    return true;
  }

  async #route(d) {
    switch (d.t) {
      case "ready":
      case "start":
        this.started = true;
        clearTimeout(this.timer);
        this.#emit(d.t === "start" ? "started" : "ready", {});
        break;
      case "state": {
        const slot = d.slot ?? this.slot ?? 0;
        if (d.bytes) {
          const bytes = d.bytes instanceof Blob ? new Uint8Array(await d.bytes.arrayBuffer()) : d.bytes;
          await vault.saveState(this.gameKey, slot, bytes, d.shot, {
            system: this.o.systemId,
            model: this.o.modelId,
            title: this.o.game?.title,
          });
          this.#emit("state-saved", { slot });
        } else this.#emit("warn", { msg: "EmulatorJS returned no state data - use its own menu (Save State) once, then this button works." });
        break;
      }
      case "state-loaded":
        this.#emit("state-loaded", { slot: d.slot });
        break;
      case "sram": {
        if (!d.bytes) break;
        const bytes = d.bytes instanceof Blob ? new Uint8Array(await d.bytes.arrayBuffer()) : d.bytes;
        await vault.saveSram(this.gameKey, bytes, this.o.game?.title || this.o.game?.name, d.shot);
        this.#emit("sram", { size: bytes.length });
        break;
      }
      case "sram-loaded": {
        // The runtime restored a battery save at boot; if the vault has nothing for
        // this game yet, keep the copy so it survives a reload of the page.
        if (d.bytes) {
          const bytes = d.bytes instanceof Blob ? new Uint8Array(await d.bytes.arrayBuffer()) : d.bytes;
          if (bytes && bytes.length && !(await vault.sramFor(this.gameKey))) {
            await vault.saveSram(this.gameKey, bytes, this.o.game?.title || this.o.game?.name, null);
          }
        }
        this.#emit("sram-loaded", { size: d.bytes ? d.bytes.size || d.bytes.length : 0 });
        break;
      }
      case "exit":
        this.#emit("exit", {});
        break;
      case "loader-error":
        clearTimeout(this.timer);
        this.lastError = d.url;
        this.#emit("error", {
          code: "no-payload",
          url: d.url,
          core: d.core || this.coreName,
          msg:
            `Could not load the emulator core files${d.core ? ` (it wanted the "${d.core}" core)` : ""}. This build needs either ` +
            "the EmulatorJS CDN (Settings ▸ Emulator ▸ Payload source → cdn.emulatorjs.org) or a local mirror in vendor/ " +
            "(npm run vendor). A mirror that lacks this one core is the other reason: pick another core for the deck. " +
            "The six built-in titles still work offline.",
        });
        break;
      case "error":
        this.#emit("warn", { msg: d.msg });
        break;
      default:
        break;
    }
  }

  get gameKey() {
    return this.o.game?.id || this.o.game?.hash || "misc";
  }

  inputTargetDoc() {
    try {
      return this.frame?.contentDocument || null;
    } catch {
      return null;
    }
  }

  /** Send one button to the core through the documented-controls path or RPC. */
  rpcButton(idx, down) {
    try {
      this.frame?.contentWindow?.postMessage({ t: "btn", idx, down }, location.origin);
    } catch {
      /* frame gone */
    }
  }

  saveState(slot = 0) {
    this.slot = slot;
    try {
      this.frame?.contentWindow?.postMessage({ t: "slot", slot }, location.origin);
      this.frame?.contentWindow?.postMessage({ t: "call", name: "saveState" }, location.origin);
    } catch {
      /* frame gone */
    }
    this.#emit("state-requested", { slot });
  }

  loadState(slot = 0) {
    this.slot = slot;
    try {
      this.frame?.contentWindow?.postMessage({ t: "slot", slot }, location.origin);
      this.frame?.contentWindow?.postMessage({ t: "call", name: "loadState" }, location.origin);
    } catch {
      /* frame gone */
    }
  }

  screenshot() {
    try {
      const d = this.frame?.contentDocument;
      const c = d?.querySelector("canvas");
      if (!c) return null;
      return c.toDataURL("image/png");
    } catch (err) {
      return null;
    }
  }

  setVolume(v) {
    try {
      this.frame?.contentWindow?.postMessage({ t: "call", name: "volume", arg: Math.round(v * 100) }, location.origin);
    } catch {
      /* gone */
    }
  }

  fastForward(on) {
    // RetroArch's ANALOG_BOOST hotkey (index 27) is the documented mapping slot
    this.rpcButton(27, on);
  }

  openMenu() {
    try {
      this.frame?.contentWindow?.postMessage({ t: "call", name: "menu" }, location.origin);
    } catch {
      /* gone */
    }
  }

  reset() {
    try {
      this.frame?.contentWindow?.postMessage({ t: "call", name: "reset" }, location.origin);
    } catch {
      /* gone */
    }
  }

  async stop() {
    clearTimeout(this.timer);
    if (this._onMsg) window.removeEventListener("message", this._onMsg);
    this._onMsg = null;
    if (this.frame) {
      try {
        this.frame.contentWindow?.postMessage({ t: "call", name: "exit" }, location.origin);
      } catch {
        /* already gone */
      }
      const f = this.frame;
      this.frame = null;
      // give the core a beat to unhook, then drop the document entirely
      await new Promise((r) => setTimeout(r, 60));
      f.remove();
    }
    for (const u of this.blobUrls) URL.revokeObjectURL(u);
    this.blobUrls = [];
    this.o.host && (this.o.host.innerHTML = "");
    this.started = false;
  }
}

function safeName(s) {
  return String(s).replace(/[^\w \-.()'&]/g, "").slice(0, 64) || "retrodeck-game";
}
function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

/** Suggested core for a system, honouring the user's per-system override. */
export function pickCore(systemId, config = {}) {
  if (config.core && config.core !== "auto") return config.core;
  const ov = store.get(["emulator", "cores", systemId].join("."));
  if (ov && ov !== "auto") return ov;
  const sys = SYSTEM_BY_ID[systemId];
  // An absent field means a deck that never went through the table (older saved
  // config), so fall back to the system id; an explicit null means the opposite -
  // upstream publishes no core for this console, and there is nothing to fetch.
  const declared = sys && "ejsCore" in sys ? sys.ejsCore : systemId;
  // "auto" is the homebrew shelf: one shelf, many consoles. Ask the extension
  // which console owns it; if nobody claims it, return null and let the loader
  // guess, rather than fetching a core literally named "auto".
  return declared === "auto" ? coreForExt(config.ext || config.fileName) : declared;
}

/**
 * Extension -> core, derived from the same table that lists what each deck
 * accepts, so it cannot drift away from the UI. Archives are unknowable here:
 * a .zip could hold any system, and guessing wrong is worse than letting the
 * loader (or the player, from the deck's config) decide.
 */
export function coreForExt(extOrName) {
  const raw = String(extOrName || "").toLowerCase();
  const ext = (raw.match(/\.([a-z0-9]+)$/) || [])[1] || raw;
  if (!ext || ext === "zip" || ext === "7z") return null;
  for (const s of SYSTEMS) {
    if (s.id === "homebrew" || s.ejsCore === "auto") continue;
    // A deck with no core (ejsCore: null) must not win the race for a shared
    // extension: .bin/.cue/.iso belong to several shelves, and returning null
    // because Dreamcast was listed first would leave the loader guessing.
    if (!s.ejsCore) continue;
    if ((s.exts || []).includes(ext)) return s.ejsCore;
  }
  return null;
}

/**
 * A tiny "did the user pick a ROM that doesn't match the system" check so the
 * player can nag before the core fails cryptically.
 */
export function extSane(fileName, systemId) {
  const sys = SYSTEM_BY_ID[systemId];
  if (!sys) return { ok: true };
  const ext = (fileName.match(/\.([a-z0-9]+)$/i)?.[1] || "").toLowerCase();
  if (!ext || ext === "zip" || ext === "7z") return { ok: true, note: "archive - the core will look inside" };
  const ok = sys.exts.includes(ext);
  return {
    ok,
    note: ok ? "" : `.${ext} is not on the ${sys.name} list (${sys.exts.slice(0, 6).join(", ")}) - pick the right system or the core will refuse it.`,
  };
}
