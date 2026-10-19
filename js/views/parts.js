/**
 * Shared pieces of the library UI.
 *
 * Keeping card art, the "supply your own cartridge" flow and the ROM attach
 * dialog in one place is what lets the five views stay small enough to read.
 */
import { GAMES as INDEX, COUNTS as INDEX_COUNTS, META as INDEX_META } from "../data/games.generated.js";
import { GAMES as BUILTINS, gameFor } from "../games/index.js";
import { SYSTEM_BY_ID, SYSTEMS } from "../data/systems.js";
import { store } from "../core/store.js";
import { vault } from "../core/idb.js";
import { sniffRom, cleanTitle, guessRegion } from "../core/detect.js";
import { coverSVG, systemColor } from "../core/cover.js";
import { artFor, artIds } from "../core/art.js";
import { h, mount, sheet, toast, pickFiles, esc, confirmSheet } from "../ui.js";

export { INDEX, INDEX_COUNTS, INDEX_META, BUILTINS };

export const sysName = (id) => SYSTEM_BY_ID[id]?.name || id;
export const sysColor = (id) => systemColor(SYSTEM_BY_ID[id] || { color: "#8892a8" });

/* ------------------------------------------------------------------ catalog */
const byId = new Map(INDEX.map((g) => [g.id, g]));
const byDb = new Map(INDEX.map((g) => [g.db, g]));

/** Every playable + indexable record: built-ins first, then the metadata index. */
export function allGames() {
  return [...BUILTINS, ...INDEX];
}

export function gameById(id) {
  return byId.get(id) || BUILTINS.find((g) => g.id === id) || null;
}
export function gameByDb(db) {
  return byDb.get(db) || null;
}

/** Which index records already have a cartridge in the vault. */
export function romForGame(game) {
  if (!game) return null;
  const cfg = store.gameConfig(game.id);
  return cfg.romHash || null;
}

/**
 * The build gives catalogue rows sourced from homebrew/ a `rom` path served by
 * this very origin, so those play with nothing to import and no vault entry.
 * Everything else in the catalogue is metadata and needs your own file.
 */
export function bundledRom(game) {
  if (!game || game.source !== "bundled" || !game.rom) return null;
  return String(game.rom);
}

/**
 * The hash-route reference that plays this game, or null when there is no
 * playable file yet. One place decides, so a card, a sheet and the router can
 * never disagree about what "Play" means.
 */
export function playRefFor(game) {
  if (!game) return null;
  if (game.builtin) return String(game.builtin);
  const hash = romForGame(game);
  if (hash) return `rom:${hash}?game=${encodeURIComponent(game.id)}`;
  const bundled = bundledRom(game);
  if (bundled) return `bundled:${game.id}`;
  return null;
}

export const isReady = (game) => Boolean(game?.builtin || romForGame(game) || bundledRom(game));

/** Records that already have a cartridge (or are built-in) - "ready to play". */
export function readyGames() {
  const ready = BUILTINS.slice();
  for (const g of INDEX) if (romForGame(g) || bundledRom(g)) ready.push(g);
  return ready;
}

/** How many titles this deck can actually start right now. */
export function ownedCount(sysId) {
  const inVault = Object.values(store.state.game || {}).filter((v) => v.romHash && (!sysId || v.system === sysId)).length;
  const bundled = INDEX.filter((g) => bundledRom(g) && (!sysId || g.system === sysId)).length;
  const built = BUILTINS.filter((b) => !sysId || b.system === sysId).length;
  return inVault + bundled + built;
}

export function searchGames(q, { system = "all", genre = "all", only = null } = {}) {
  const needle = (q || "").trim().toLowerCase();
  const words = needle.split(/\s+/).filter(Boolean);
  const pool = only === "built" ? BUILTINS : only === "own" ? INDEX : [...BUILTINS, ...INDEX];
  return pool
    .filter((g) => (system === "all" ? true : g.system === system))
    .filter((g) => (genre === "all" ? true : g.genreSlug === genre || g.genre === genre))
    .filter((g) => !words.length || words.every((w) => g.title.toLowerCase().includes(w) || String(g.year || "").includes(w) || (g.genre || "").toLowerCase().includes(w)))
    .sort((a, b) => (b.rating ?? 10) - (a.rating ?? 10));
}

export const GENRES = () => [...new Set(INDEX.map((g) => g.genre))].sort();

/* ------------------------------------------------------------------ card art */
/**
 * Real artwork, two sources: a `cover` path the build indexed from covers/<system>/
 * (see docs/ADDING-GAMES.md), or an image the player stored in the vault for this
 * game. Cards render synchronously, so the vault side is a cache that app.js
 * fills once per session and then re-renders.
 */
const ART = new Map();
let artLoaded = false;

export async function loadArt() {
  if (artLoaded) return ART.size;
  artLoaded = true;
  try {
    for (const id of await artIds()) ART.set(id, await artFor(id));
  } catch {
    /* no IndexedDB in this context: generated covers only */
  }
  return ART.size;
}

export const artCache = ART;
export const hasArt = (gameId) => Boolean(gameId && ART.get(gameId));

/** @param {{src:string,name?:string}|null} rec */
export function rememberArt(gameId, rec) {
  if (rec) ART.set(gameId, rec);
  else ART.delete(gameId);
}

/** The image a card should show, or null for "draw the generated cover". */
export function coverSrc(game) {
  if (!game) return null;
  if (game.cover) return game.cover;
  return ART.get(game.id)?.src || null;
}

export function cover(game, { w = 120, h: hh = 160 } = {}) {
  const style = store.get("ui.coverStyle", "pixel");
  const drawn = () => coverSVG(game, { style, w, h: hh });
  if (!coverSrc(game)) return h("span.card__art", { "aria-hidden": "true", html: drawn() });

  // A `cover` path the build wrote can go stale - the file gets moved or
  // deleted and the next build has not run. Rather than leave a grey hole in the
  // shelf, a failed load replaces the image with the generated cover. The
  // handler closes over `host` instead of the event, because the event object is
  // the least reliable part of this across browsers (and test harnesses).
  let host;
  const img = h("img", {
    src: coverSrc(game),
    alt: "",
    loading: "lazy",
    decoding: "async",
    onerror: () => {
      if (!host) return;
      host.classList.remove("card__art--photo");
      host.innerHTML = drawn();
    },
  });
  host = h("span.card__art.card__art--photo", { "aria-hidden": "true" }, img);
  return host;
}

/**
 * @param {object} game index record or built-in record
 * @param {object} o    { onClick, showBadge }
 */
export function gameCard(game, o = {}) {
  const hash = game.builtin ? null : romForGame(game);
  const fav = store.gameConfig(game.id).favorite;
  const badge = game.builtin
    ? h("i.badge.badge--bundled", {}, "Play now")
    : hash
      ? h("i.badge.badge--own", {}, "In vault")
      : bundledRom(game)
        ? h("i.badge.badge--bundled", {}, "Bundled")
        : null;
  return h(
    "button.card",
    {
      type: "button",
      "aria-label": `${game.title}${game.year ? `, ${game.year}` : ""}`,
      onclick: () => (o.onClick ? o.onClick(game) : openGame(game)),
    },
    cover(game),
    badge,
    fav ? h("i.badge.badge--fav", {}, "★") : null,
    !badge && game.rating ? h("i.badge.badge--rated", {}, game.rating.toFixed(1)) : null,
    h("span.card__body", {},
      h("b.card__title", {}, game.title),
      h("span.card__meta", {},
        h("i", {}, sysShort(game.system)),
        h("i", {}, game.year || ""),
        game.players > 1 ? h("i", {}, `${game.players}P`) : null)),
  );
}

export const sysShort = (id) => {
  const s = SYSTEM_BY_ID[id];
  return s?.short || s?.name?.split(" ").map((w) => w[0]).join("").slice(0, 4).toUpperCase() || id;
};

/** Play it, or explain what is missing. */
export function openGame(game) {
  const ref = playRefFor(game);
  if (ref) {
    location.hash = `#/play/${ref}`;
    return;
  }
  cartridgeSheet(game);
}

/**
 * Fetch a bundled homebrew file from this origin. Cached by the service worker,
 * so once you have played it the game keeps working offline.
 */
export async function loadBundledRom(game) {
  const url = bundledRom(game);
  if (!url) throw new Error("not a bundled title");
  const r = await fetch(url, { cache: "default" });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText} for ${url}`);
  const bytes = new Uint8Array(await r.arrayBuffer());
  if (!bytes.length) throw new Error(`${url} is empty`);
  return { bytes, name: url.split("/").pop(), size: bytes.length };
}

/* ------------------------------------------------------ cartridge plumbing */
export function cartridgeSheet(game, { onDone } = {}) {
  const hash = game ? romForGame(game) : null;
  const body = h("div", { style: { display: "grid", gap: "12px" } });
  const s = sheet(game ? game.title : "Add a cartridge", body, {
    wide: true,
    onClose: () => {},
  });
  draw();

  function draw() {
    mount(
      body,
      game && bundledRom(game)
        ? h("div.notice", {},
            h("b", {}, "This one ships with the site."),
            h("span", {}, "The build found ", h("code", {}, bundledRom(game)), ` in homebrew/${game.system}/, so RetroDeck serves it from this origin - no import needed.`),
            h("div.notice__row", {},
              h("button.btn.btn--sm.btn--primary", {
                onclick: () => {
                  s.close();
                  location.hash = `#/play/bundled:${game.id}`;
                },
              }, "Play it now")))
        : null,
      game && !bundledRom(game)
        ? h("div.notice", {},
            h("b", {}, "This index entry is metadata only."),
            h("span", {}, `RetroDeck ships no ${sysName(game.system)} ROMs, and there are no download links anywhere in this project. If you own the ${romWord(game.system)} for ` ,
              h("i", {}, game.title), ", add your own copy and it plays on the deck you chose."))
        : null,
      hash
        ? h("div.rows", {},
            h("div.row", {},
              h("span.row__label", {}, "Attached cartridge", h("small.muted", {}, "stored in this browser only")),
              h("span.mono.small", {}, `${hash.slice(0, 10)}…`)),
            h("div.row", {},
              h("span.row__label", {}, "Actions"),
              h("div", { style: { display: "flex", gap: "6px" } },
                h("button.btn.btn--sm.btn--primary", { onclick: () => { s.close(); location.hash = `#/play/rom:${hash}?game=${encodeURIComponent(game.id)}`; } }, "Play"),
                h("button.btn.btn--sm.btn--ghost", { onclick: detach }, "Detach"))))
        : null,
      h("div.drop", { ondragover: (e) => { e.preventDefault(); e.currentTarget.classList.add("is-over"); },
        ondragleave: (e) => e.currentTarget.classList.remove("is-over"),
        ondrop: (e) => {
          e.preventDefault();
          e.currentTarget.classList.remove("is-over");
          takeFiles([...(e.dataTransfer?.files || [])]);
        } },
        h("b", {}, game ? "Choose your ROM" : "Drop or choose cartridge images"),
        h("span.small", {}, game ? `Expected: ${extsFor(game.system)}` : "We read the header, work out the console, and index it for you."),
        h("button.btn.btn--sm", { onclick: async () => takeFiles(await pickFiles({ accept: acceptFor(game?.system), multiple: !game })) }, "Browse files")),
      game
        ? h("p.sheet__p.small.muted", {},
            "Nothing leaves the device: the bytes go to IndexedDB under ", h("code", {}, "retrodeck"),
            ", and save states and battery saves live beside them.")
        : null,
    );
  }

  async function takeFiles(files) {
    if (!files.length) return;
    let added = 0;
    for (const f of files) {
      try {
        const bytes = new Uint8Array(await f.arrayBuffer());
        const sniff = sniffRom(bytes, f.name);
        if (game && sniff.system && sniff.system !== game.system && sniff.confidence > 0.4) {
          const ok = await confirmSheet(
            "That file looks like a different console",
            `${f.name} reads as ${sysName(sniff.system)}. ${game.title} is a ${sysName(game.system)} ${romWord(game.system)}. Add it to the vault anyway?`,
            "Add anyway",
          );
          if (!ok) continue;
        }
        const rec = await vault.addRom(f, game ? { system: game.system, name: cleanTitle(f.name.replace(/\.[^.]+$/, "")) } : {});
        if (rec.system === "unknown" && sniff.system) rec.system = sniff.system;
        if (game) {
          store.setGame(game.id, {
            romHash: rec.hash,
            system: rec.system || game.system,
            region: guessRegion(bytes, rec.system || game.system) || undefined,
            fileName: rec.fileName,
            size: rec.size,
          });
        }
        added++;
        if (rec.duplicate) toast(`${f.name} was already in the vault`, "info");
      } catch (err) {
        toast(`Could not read ${f.name}: ${err?.message || err}`, "bad", 5200);
      }
    }
    if (added) {
      toast(added === 1 ? "Cartridge added to the deck" : `${added} cartridges added`, "good");
      if (onDone) onDone();
      else {
        s.close();
        if (!game) goSoon("/vault");
        else renderSoon();
      }
    }
  }

  async function detach() {
    if (!game) return;
    const ok = await confirmSheet("Detach this cartridge?", `${game.title} will keep its save states, but you will have to pick the ROM again before playing.`, "Detach");
    if (!ok) return;
    const cfg = { ...store.gameConfig(game.id) };
    delete cfg.romHash;
    store.setGame(game.id, { romHash: null, fileName: null, size: null });
    s.close();
    renderSoon();
  }
}

/* Rerender through the router. app.js owns rendering, and importing it from a
   view would be circular at module-evaluation time, so it happens lazily. */
const renderSoon = () => import("../app.js").then((m) => m.render()).catch(() => {});
const goSoon = (path) => import("../app.js").then((m) => m.go(path)).catch(() => {});

export function extsFor(sysId) {
  const exts = SYSTEM_BY_ID[sysId]?.exts || [];
  return exts.length ? `.${exts.slice(0, 6).join(", .")}` : "any ROM image";
}
export const acceptFor = (sysId) =>
  sysId ? (SYSTEM_BY_ID[sysId]?.exts || []).map((e) => `.${e}`).join(",") : ".nes,.sfc,.smc,.gb,.gbc,.gba,.nds,.n64,.z64,.v64,.md,.gen,.smd,.sms,.gg,.pce,.a26,.a78,.ws,.wsc,.ngp,.ngpc,.cng,.vb,.vboy,.cue,.bin,.chd,.iso,.zip,.7z,.rom,.d64,.tap,.nib";

/**
 * The word a real person uses for that console's media. Decided from the
 * extensions the deck accepts - `features` is a flag object, not a list, so it
 * says nothing about discs.
 */
export const romWord = (sysId) => {
  const s = SYSTEM_BY_ID[sysId];
  if (!s) return "ROM";
  if (sysId === "dos") return "game folder or DOSBox config";
  if (/arcade|mame|fbneo/i.test(`${sysId} ${s.name || ""}`)) return "arcade ROM";
  // judged on the primary media, because half these decks also read CDs
  const primary = String((s.exts || [])[0] || "").toLowerCase();
  const DISC = new Set(["cue", "chd", "iso", "gdi", "mds", "ccd", "nrg", "cdi", "cso", "pbp", "bin"]);
  const DISK = new Set(["d64", "t64", "g64", "d71", "d81", "dsk", "tap", "crt", "prg", "p00", "wav", "fds", "fd", "ndd"]);
  if (DISC.has(primary)) return "disc image";
  if (DISK.has(primary)) return "disk or tape";
  return "cartridge";
};

/** Small HTML string for the "supported inputs" line on deck cards. */
export function buttonsLine(sysId) {
  const s = SYSTEM_BY_ID[sysId];
  if (!s) return "";
  return (s.buttons || [])
    .map((b) => `<span class="kbd">${esc(b.label || b.id)}</span>`)
    .join(" ");
}

export function statPill(label, value) {
  return h("span.stat", {}, label, " ", h("b", {}, value));
}

export const SYSTEM_LIST = SYSTEMS;
