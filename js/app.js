/**
 * RetroDeck boot + router.
 *
 * Hash routing on purpose: the built app is a folder of static files that must
 * work from a phone's home screen, from a subdirectory of any web host, and
 * from the sandboxed preview - all without a server rewrite rule.
 */
import { store, watch } from "./core/store.js";
import { SYSTEM_BY_ID, SYSTEMS } from "./data/systems.js";
import { MODEL_BY_ID, MODELS_BY_SYSTEM, defaultModelFor } from "./data/models.js";
import { skinVars } from "./data/skins.js";
import { GAMES as BUILTINS } from "./games/index.js";
import { probeEmulator, localVendorPresent } from "./core/emulator.js";
import { loadArt } from "./views/parts.js";
import { h, mount, toast, keepScreenOn, clear } from "./ui.js";
import { renderHome } from "./views/home.js";
import { renderLibrary } from "./views/library.js";
import { renderDecks, renderDeck } from "./views/decks.js";
import { renderVault } from "./views/vault.js";
import { renderSettings } from "./views/settings.js";
import { PlayerView } from "./views/player.js";

const view = document.getElementById("view");
const tabsEl = document.getElementById("tabs");
const playerRoot = document.getElementById("player-root");

/* ------------------------------------------------------------------ routing */
const ROUTES = [
  [/^\/?$/, (p) => ["home", p]],
  [/^\/library(?:\/(.+))?$/, (m) => ["library", { system: m[1] || "all" }]],
  [/^\/decks$/, () => ["decks", {}]],
  [/^\/deck\/([\w-]+)$/, (m) => ["deck", { system: m[1] }]],
  [/^\/vault$/, () => ["vault", {}]],
  [/^\/settings$/, () => ["settings", {}]],
];

export let route = { name: "home", params: {}, query: {} };
const listeners = new Set();

/** Parse `#/name/stuff?a=1` into a route object. */
export function parseHash(hash = location.hash) {
  const raw = decodeURIComponent(String(hash || "").replace(/^#/, "")) || "/";
  const [pathPart, queryPart] = raw.split("?");
  const query = Object.fromEntries(new URLSearchParams(queryPart || ""));
  for (const [re, map] of ROUTES) {
    const m = pathPart.match(re);
    if (m) {
      const [name, params] = map(m);
      return { name, params: { ...(params || {}) }, query, path: pathPart };
    }
  }
  return { name: "home", params: {}, query, path: pathPart };
}

export function go(path, { replace = false } = {}) {
  const target = `#${path.startsWith("/") ? path : `/${path}`}`;
  if (location.hash === target) {
    render();
    return;
  }
  if (replace) history.replaceState(null, "", target);
  else location.hash = target;
}

export const onRoute = (fn) => (listeners.add(fn), () => listeners.delete(fn));

/* ------------------------------------------------------------------ theming */
function applyTheme() {
  const el = document.documentElement;
  el.dataset.theme = store.get("ui.theme", "midnight");
  el.dataset.density = store.get("ui.density", "cozy");
  const rm = store.get("ui.reduceMotion", false) || (matchMedia("(prefers-reduced-motion: reduce)").matches && store.get("ui.reduceMotion", null) !== false);
  el.dataset.motion = rm ? "off" : "on";
}

/**
 * Equip a skin: the shell art and the virtual pad both read these variables,
 * so a "hardware change" is 20 CSS custom properties and zero re-render work.
 */
let skinApplied = "";
export function applySkin(skinId, accentOverride) {
  const el = document.documentElement;
  const key = `${skinId}|${accentOverride || ""}`;
  if (key === skinApplied) return;
  skinApplied = key;
  const vars = skinId ? skinVars(skinId) : {};
  if (accentOverride) vars["--accent"] = accentOverride;
  // clear the previously applied group first, so leaving a deck resets the UI
  for (const k of ["--shell", "--shell2", "--shellHi", "--bezel", "--glass", "--btn", "--btnHi", "--btnText",
    "--btnA", "--btnB", "--btnX", "--btnY", "--btnC", "--btnZ", "--btnD", "--dpad", "--dpadHi", "--accent",
    "--label", "--led", "--grille", "--ui"]) {
    el.style.removeProperty(k);
  }
  for (const [k, v] of Object.entries(vars)) el.style.setProperty(k, v);
  const meta = document.querySelector('meta[name="theme-color"]:not([media])');
  if (meta) meta.content = "#0a0d14";
}

/** The deck the player currently has equipped for a system. */
export function equipped(sysId) {
  const cfg = store.systemConfig(sysId);
  // the last-used model only counts when it belongs to this system
  const last = store.get("play.lastModel", "");
  const lastOk = MODELS_BY_SYSTEM[sysId]?.includes(last) ? last : null;
  const modelId = cfg.model || lastOk || defaultModelFor(sysId)?.id;
  const model = MODEL_BY_ID[modelId] || defaultModelFor(sysId) || null;
  const skinId = cfg.skin || model?.skins?.[0] || null;
  const padId = cfg.pad || model?.pad || SYSTEM_BY_ID[sysId]?.pad || "snes";
  return { model, modelId: model?.id || null, skinId, padId, system: SYSTEM_BY_ID[sysId] };
}

export function setEquipped(sysId, patch) {
  store.setSystem(sysId, patch);
  if (patch.model) store.set("play.lastModel", patch.model);
  render();
}

/* --------------------------------------------------------------------- tabs */
const TABS = [
  ["home", "Deck", "#/", '<path d="M4 9 12 4l8 5v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9Z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M9 20v-6h6v6" fill="none" stroke="currentColor" stroke-width="1.6"/>'],
  ["library", "Games", "#/library", '<rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8 5v14M3 10h5M3 14h5" stroke="currentColor" stroke-width="1.6" fill="none"/>'],
  ["decks", "Hardware", "#/decks", '<rect x="2.5" y="7" width="19" height="10" rx="3" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M6.5 10.5v3M5 12h3M16.5 11h.01M19 13h.01" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>'],
  ["vault", "Cartridges", "#/vault", '<path d="M4 8h16v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8Z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M4 8 6 4h12l2 4M9 12h6" fill="none" stroke="currentColor" stroke-width="1.6"/>'],
  ["settings", "Settings", "#/settings", '<circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>'],
];

function renderTabs() {
  mount(
    tabsEl,
    ...TABS.map(([name, label, href, icon]) =>
      h(`button.tab${route.name === name || (name === "home" && route.name === "home") ? ".is-on" : ""}`, {
        "aria-current": route.name === name ? "page" : null,
        onclick: () => go(href.slice(1)),
      }, h("svg", { viewBox: "0 0 24 24", "aria-hidden": "true", html: icon }), h("span", {}, label))),
  );
}

/* ------------------------------------------------------------------- render */
let player = null;

async function render() {
  route = parseHash();
  document.body.dataset.view = route.name;
  const searching = route.name === "library";
  if (document.getElementById("search")) document.getElementById("search").hidden = !searching;
  if (searching) {
    const q = document.getElementById("q");
    if (q.value !== (store.get("library.query", "") || "")) q.value = store.get("library.query", "");
  }

  // the player is an overlay, not a page: it owns the screen and the pad
  const isPlay = route.path.startsWith("/play");
  if (!isPlay) {
    tabsEl.hidden = false;
    if (player) {
      await player.destroy();
      player = null;
    }
  }

  applyTheme();
  renderTabs();

  if (isPlay) {
    tabsEl.hidden = true;
    const ref = route.path.replace(/^\/play\//, "");
    mount(view, "");
    player = new PlayerView({ root: playerRoot, view, ref, query: route.query });
    await player.mount();
    return;
  }

  clear(view);
  // tint the UI with the equipped hardware when you are looking at that hardware
  const sys = route.params.system;
  if (route.name === "deck" && SYSTEM_BY_ID[sys]) {
    const eq = equipped(sys);
    applySkin(eq.skinId, eq.model?.skinAccent || SYSTEM_BY_ID[sys].color);
  } else {
    applySkin(null, null);
  }

  const ctx = { route, go, store, systems: SYSTEMS, builtins: BUILTINS, equipped, setEquipped, applySkin };
  switch (route.name) {
    case "library":
      await renderLibrary(view, ctx);
      break;
    case "decks":
      await renderDecks(view, ctx);
      break;
    case "deck":
      await renderDeck(view, ctx, route.params.system);
      break;
    case "vault":
      await renderVault(view, ctx);
      break;
    case "settings":
      await renderSettings(view, ctx);
      break;
    default:
      await renderHome(view, ctx);
  }
  document.title =
    route.name === "home"
      ? "RetroDeck · a pocket full of consoles"
      : `RetroDeck · ${route.name[0].toUpperCase()}${route.name.slice(1)}`;
  for (const fn of listeners) fn(route);
}

export { render, view, tabsEl };

/* ------------------------------------------------------------- net readiness */
const dot = document.getElementById("netdot");
async function checkRuntime() {
  dot.className = "dot";
  dot.title = "Checking the emulator runtime…";
  const local = await localVendorPresent();
  if (local) {
    dot.className = "dot dot--good";
    dot.title = "EmulatorJS is mirrored in /vendor - this build plays anything offline";
    return;
  }
  const probe = await probeEmulator({ timeout: 4500 });
  if (probe.ok) {
    dot.className = "dot dot--warn";
    dot.title = `EmulatorJS reachable at ${probe.base}. Run \`npm run vendor\` to make this install fully offline.`;
  } else {
    dot.className = "dot dot--bad";
    dot.title = `No emulator payload (${probe.base} unreachable). Cartridge import and the six built-in titles still work; run \`npm run vendor\`.`;
  }
}

/* -------------------------------------------------------------------- boot */
async function boot() {
  applyTheme();
  watch("ui.", () => applyTheme());

  // search box lives in the header, so wire it once, here
  const q = document.getElementById("q");
  let deb = 0;
  q.addEventListener("input", () => {
    document.querySelector('[data-act="clear-search"]').hidden = !q.value;
    clearTimeout(deb);
    deb = setTimeout(() => {
      store.set("library.query", q.value.trim());
      if (route.name !== "library") go("/library");
      else render();
    }, 220);
  });
  document.querySelector('[data-act="clear-search"]')?.addEventListener("click", () => {
    q.value = "";
    q.focus();
    document.querySelector('[data-act="clear-search"]').hidden = true;
    store.set("library.query", "");
    render();
  });
  document.getElementById("search")?.addEventListener("submit", (e) => {
    e.preventDefault();
    store.set("library.query", q.value.trim());
    if (route.name !== "library") go("/library");
    else render();
  });

  document.getElementById("btn-fullscreen")?.addEventListener("click", async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen({ navigationUI: "hide" });
    } catch {
      toast("Fullscreen was refused - it needs a tap on the address-bar menu on some browsers", "warn");
    }
  });

  addEventListener("hashchange", () => render());
  addEventListener("unhandledrejection", (e) => {
    // never swallow an error silently, but do not scream for aborted work
    if (e.reason?.name === "AbortError") return;
    console.error("[retrodeck]", e.reason);
  });

  await render();
  // Stored cover art arrives from IndexedDB a moment after the first paint. It
  // re-renders once, and only when there is actually something to show, so a
  // vault without artwork costs nothing. (parts.js keeps its own lazy path back
  // to this module - a static import both ways would be a cycle.)
  loadArt()
    .then((n) => {
      if (n) render();
    })
    .catch(() => {});
  checkRuntime();
  setInterval(checkRuntime, 5 * 60 * 1000);

  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    try {
      const reg = await navigator.serviceWorker.register("./sw.js", { scope: "./" });
      reg.addEventListener("updatefound", () => {
        const sw = reg.installing;
        sw?.addEventListener("statechange", () => {
          if (sw.state === "installed" && navigator.serviceWorker.controller) {
            toast("RetroDeck updated - reload for the new build", "info", 6000);
          }
        });
      });
    } catch (err) {
      console.warn("[retrodeck] service worker not registered:", err?.message || err);
    }
  }

  // leave the play overlay cleanly with the hardware back button
  addEventListener("popstate", () => {
    if (!location.hash.startsWith("#/play") && player) {
      player.destroy();
      player = null;
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && player) player.autoPause();
    else if (player && store.get("play.autoStart", true)) player.resumeIfPaused();
    keepScreenOn(!document.hidden && Boolean(player) && store.get("play.keepScreenOn", true));
  });

  if (store.error) toast(`Settings could not be saved: ${store.error}`, "bad", 6000);
}

boot().catch((err) => {
  console.error(err);
  mount(
    view,
    h("div.notice.notice--bad", {},
      h("b", {}, "RetroDeck failed to start"),
      h("span", {}, String(err?.message || err)),
      h("button.btn.btn--sm", { onclick: () => location.reload() }, "Reload")),
  );
});
