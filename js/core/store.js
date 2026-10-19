/**
 * RetroDeck - settings + profiles store.
 *
 * Everything the user configures lives here and is persisted to
 * localStorage under one versioned key. Nothing leaves the browser.
 *
 * Config is layered so a game can override its system, and a system its model:
 *   defaults -> ui -> system[sysId] -> game[gameId]
 * `resolvedFor()` returns the merged result; `setTarget()` writes to whichever
 * layer the user is editing ("global", a system, or a single game).
 */

const KEY = "retrodeck.v1";
const SCHEMA = 1;

export const DEFAULTS = {
  schema: SCHEMA,
  ui: {
    view: "home",
    theme: "midnight", // midnight | light | high-contrast
    accent: "auto", // auto = take the console model's colour
    density: "cozy", // cozy | compact
    reduceMotion: false,
    coverStyle: "pixel", // pixel | flat | label
    showNagAboutRoms: true,
    locale: "auto",
  },
  play: {
    lastGame: null,
    lastSystem: "snes",
    lastModel: null,
    autoStart: true,
    orientationLock: "auto", // auto | landscape | portrait
    fullscreenOnPlay: true,
    keepScreenOn: true,
    showPad: true,
    padScale: 1,
    padOpacity: 0.9,
    padFloat: true, // overlay the pad on the game instead of reserving space
    padZone: "edges", // edges | left-right | bottom
    haptics: true,
    rumble: true,
    showMenuButton: true,
    doubleTapForMenu: true,
  },
  emulator: {
    source: "cdn", // cdn | local (vendor/)
    version: "stable", // stable | latest | 4.2.x
    cdnBase: "https://cdn.emulatorjs.org",
    threads: false,
    cores: {}, // { sysId: coreId } overrides
    cache: true,
    cacheMaxSizeMB: 2048,
    saveStateLocation: "browser",
    shaders: "none",
    fastForward: false,
    rewind: false,
    volume: 0.7,
    inputBridge: "keyboard", // keyboard | direct | both
    exitConfirm: false,
  },
  /* per-system overrides */
  system: {},
  /* per-game overrides */
  game: {},
  /* { [sysId]: { name, size, added } } - bytes live in IndexedDB */
  bios: {},
  library: {
    sort: "rating",
    filterSystem: "all",
    filterGenre: "all",
    hideOwned: false,
    query: "",
  },
};

const deep = (o) => (o === undefined || o === null ? o : JSON.parse(JSON.stringify(o)));
function isObj(v) {
  return v && typeof v === "object" && !Array.isArray(v);
}
export function merge(a, b) {
  const out = { ...a };
  for (const k of Object.keys(b || {})) {
    out[k] = isObj(b[k]) && isObj(a?.[k]) ? merge(a[k], b[k]) : deep(b[k]);
  }
  return out;
}

class Store {
  #listeners = new Set();
  #saveTimer = null;
  state = deep(DEFAULTS);
  ready = false;
  error = null;

  constructor() {
    this.#load();
    if (typeof window !== "undefined") {
      window.addEventListener("beforeunload", () => this.flush());
      window.retrodeck = window.retrodeck || {};
      window.retrodeck.store = this;
    }
  }

  #load() {
    if (typeof localStorage === "undefined") return;
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed?.schema !== SCHEMA) {
        this.pendingMigration = parsed;
        return;
      }
      this.state = merge(DEFAULTS, parsed);
      this.ready = true;
    } catch (err) {
      this.error = err;
      console.warn("[retrodeck] settings unreadable, using defaults:", err?.name);
    }
  }

  save() {
    if (typeof localStorage === "undefined") return;
    clearTimeout(this.#saveTimer);
    this.#saveTimer = setTimeout(() => this.flush(), 180);
  }

  flush() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.state));
      this.ready = true;
    } catch (err) {
      this.error = err;
      console.warn("[retrodeck] could not persist settings (storage full?):", err?.name);
      this.emit("storage-error", err);
    }
  }

  /** get("play.padScale") */
  get(path, fallback) {
    const v = path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), this.state);
    return v === undefined ? fallback : v;
  }

  set(path, value, opts = {}) {
    const keys = path.split(".");
    let o = this.state;
    for (let i = 0; i < keys.length - 1; i++) {
      if (!isObj(o[keys[i]])) o[keys[i]] = {};
      o = o[keys[i]];
    }
    o[keys[keys.length - 1]] = value;
    if (!opts.silent) this.emit(path, value);
    this.save();
    return value;
  }

  toggle(path) {
    return this.set(path, !this.get(path));
  }

  /* ------------------------------------------------------- config layers */
  systemConfig(sysId) {
    return this.state.system?.[sysId] || {};
  }

  setSystem(sysId, patch) {
    this.state.system[sysId] = merge(this.systemConfig(sysId), patch);
    this.emit(`system.${sysId}`, this.state.system[sysId]);
    this.save();
  }

  gameConfig(gameId) {
    return this.state.game?.[gameId] || {};
  }

  setGame(gameId, patch) {
    this.state.game[gameId] = merge(this.gameConfig(gameId), patch);
    this.emit(`game.${gameId}`, this.state.game[gameId]);
    this.save();
  }

  /**
   * Merge order: defaults -> system layer -> game layer.
   * `model` is only used to seed defaults (it lives in the system layer).
   */
  resolvedFor(gameId, sysId) {
    const base = {
      shader: this.get("emulator.shaders", "none"),
      palette: null,
      core: this.get(["emulator", "cores", sysId].join("."), null),
      pad: null,
      model: null,
      volume: this.get("emulator.volume", 0.7),
      rewind: this.get("emulator.rewind", false),
      fastForward: this.get("emulator.fastForward", false),
      saveStateLocation: this.get("emulator.saveStateLocation", "browser"),
      controls: {},
    };
    const merged = merge(merge(base, this.systemConfig(sysId)), this.gameConfig(gameId));
    return merged;
  }

  /* ------------------------------------------------------------- library */
  recordPlay(gameId, meta = {}) {
    const g = this.gameConfig(gameId);
    this.setGame(gameId, {
      plays: (g.plays || 0) + 1,
      lastPlayed: Date.now(),
      minutes: (g.minutes || 0) + (meta.minutes || 0),
      favorite: g.favorite || false,
    });
    if (this.get("play.lastGame") !== gameId) this.set("play.lastGame", gameId);
  }

  toggleFavorite(gameId) {
    const g = this.gameConfig(gameId);
    this.setGame(gameId, { favorite: !g.favorite });
    return !g.favorite;
  }

  /** Games the player starred, newest tap first. */
  favorites() {
    return Object.entries(this.state.game || {})
      .filter(([, v]) => v.favorite)
      .sort((a, b) => (b[1].lastPlayed || 0) - (a[1].lastPlayed || 0))
      .map(([id, v]) => ({ id, ...v }));
  }

  recentlyPlayed(limit = 12) {
    return Object.entries(this.state.game || {})
      .filter(([, v]) => v.lastPlayed)
      .sort((a, b) => b[1].lastPlayed - a[1].lastPlayed)
      .slice(0, limit)
      .map(([id, v]) => ({ id, ...v }));
  }

  /* -------------------------------------------------------------- events */
  on(fn) {
    this.#listeners.add(fn);
    return () => this.#listeners.delete(fn);
  }
  off(fn) {
    this.#listeners.delete(fn);
  }
  emit(path, value) {
    for (const fn of this.#listeners) {
      try {
        fn(path, value, this.state);
      } catch (err) {
        console.warn("[retrodeck] listener threw", err);
      }
    }
  }

  reset(what = "all") {
    if (what === "all") this.state = deep(DEFAULTS);
    else this.state[what] = deep(DEFAULTS[what] ?? {});
    this.save();
    this.emit("reset", what);
  }

  exportText() {
    return JSON.stringify(this.state, null, 2);
  }

  importText(text) {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object") throw new Error("not a RetroDeck profile");
    this.state = merge(DEFAULTS, parsed);
    this.save();
    this.emit("reset", "all");
    return true;
  }
}

export const store = new Store();

/** Convenience for views: subscribe and re-render on any change under prefix. */
export function watch(prefix, fn) {
  return store.on((path, value, state) => {
    if (prefix === "*" || path === prefix || path.startsWith(prefix + ".")) fn(value, path, state);
  });
}

/* --------------------------------------------------------------- helpers */
export function clamp(n, a, b) {
  return Math.min(b, Math.max(a, n));
}

export function fmtBytes(n) {
  if (!Number.isFinite(n)) return "?";
  const u = ["B", "KB", "MB", "GB"];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) (n /= 1024), i++;
  return `${n.toFixed(n >= 100 || i === 0 ? 0 : 1)} ${u[i]}`;
}

export function fmtDate(ts) {
  if (!ts) return "never";
  const d = new Date(ts);
  const today = new Date().toDateString() === d.toDateString();
  if (today) return `today ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  return d.toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" });
}

export function uid(len = 8) {
  const A = "abcdefghjkmnpqrstuvwxyz23456789";
  let s = "";
  const buf = new Uint8Array(len);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(buf);
  else for (let i = 0; i < len; i++) buf[i] = (Math.random() * 256) | 0;
  for (let i = 0; i < len; i++) s += A[buf[i] % A.length];
  return s;
}
