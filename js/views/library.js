/**
 * Library: the 488-title index plus the six built-ins, with the per-game
 * configuration sheet hanging off each card.
 *
 * Rendering ~500 cards at once makes mobile Safari hiccup, so the grid pages
 * itself with a sentinel button instead of pulling in a list virtualiser.
 */
import { store, fmtDate, fmtBytes } from "../core/store.js";
import { SYSTEM_BY_ID } from "../data/systems.js";
import { vault } from "../core/idb.js";
import { coverSVG } from "../core/cover.js";
import { gameFor } from "../games/index.js";
import { h, mount, sheet, toast, chip, sectionTitle, confirmSheet, pickFiles } from "../ui.js";
import { ART_TYPES, clearArt, setArtFromFile } from "../core/art.js";
import {
  INDEX, INDEX_COUNTS, BUILTINS, searchGames, GENRES, gameCard, sysName, sysColor,
  romForGame, cartridgeSheet, readyGames, extsFor, playRefFor, bundledRom,
  coverSrc, hasArt, rememberArt, artCache,
} from "./parts.js";
import { configForm } from "./config.js";

const PAGE = 60;
let shown = PAGE;

export async function renderLibrary(root, ctx) {
  const state = {
    system: routeSystem(ctx) || store.get("library.filterSystem", "all"),
    genre: store.get("library.filterGenre", "all"),
    sort: store.get("library.sort", "rating"),
    only: store.get("library.only", "all"), // all | ready | built | starred
    q: store.get("library.query", ""),
  };
  const bar = h("div", {});
  const grid = h("div.cards", {});
  mount(root, bar, grid);
  shown = PAGE;
  draw();

  function draw() {
    const list = filter(state);
    renderBar(list);
    renderGrid(list);
  }

  function renderBar(list) {
    const starred = Object.values(store.state.game || {}).filter((v) => v.favorite).length;
    mount(
      bar,
      h("div.chips", {},
        chip("All systems", state.system === "all", () => pick("system", "all"), { count: INDEX.length + BUILTINS.length }),
        ...Object.keys(INDEX_COUNTS).map((id) =>
          chip(sysName(id), state.system === id, () => pick("system", id), { swatch: sysColor(id), count: INDEX_COUNTS[id] }))),
      h("div.chips", {},
        chip("Everything", state.only === "all", () => pick("only", "all")),
        chip("Ready to play", state.only === "ready", () => pick("only", "ready"), { count: readyGames().length }),
        chip("Built-in", state.only === "built", () => pick("only", "built"), { count: BUILTINS.length }),
        chip("Starred", state.only === "starred", () => pick("only", "starred"), { count: starred }),
        h("select.mini", {
          "aria-label": "Sort the list",
          onchange: (e) => { state.sort = e.target.value; store.set("library.sort", state.sort); draw(); },
        }, ...[["rating", "Sort: rating"], ["year-new", "Newest first"], ["year-old", "Oldest first"], ["az", "A–Z"], ["plays", "Most played"]]
          .map(([v, l]) => h("option", { value: v, selected: state.sort === v }, l))),
        h("select.mini", {
          "aria-label": "Filter by genre",
          onchange: (e) => { state.genre = e.target.value; store.set("library.filterGenre", state.genre); draw(); },
        }, h("option", { value: "all", selected: state.genre === "all" }, "All genres"),
          ...GENRES().map((g) => h("option", { value: g, selected: state.genre === g }, g)))),
      list.length === 0
        ? h("div.notice.notice--warn", {},
            h("b", {}, "Nothing matches that."),
            h("span", {}, `No ${state.system === "all" ? "game" : sysName(state.system)} entry for “${state.q || state.genre || state.only}”.`),
            h("div.notice__row", {}, h("button.btn.btn--sm", { onclick: reset }, "Clear filters")))
        : null,
    );
  }

  function renderGrid(list) {
    const page = list.slice(0, shown);
    mount(grid, ...page.map((g) => gameCard(g, { onClick: (game) => gameSheet(game, draw) })));
    if (list.length > shown) {
      const more = h("button.btn.btn--block.btn--ghost", {
        onclick: () => { shown += PAGE; renderGrid(list); },
      }, `Show ${Math.min(PAGE, list.length - shown)} more · ${list.length - shown} left`);
      grid.append(more);
      const io = new IntersectionObserver((entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          shown += PAGE;
          renderGrid(list);
        }
      }, { rootMargin: "600px" });
      io.observe(more);
    }
  }

  function pick(key, value) {
    shown = PAGE;
    if (key === "system") {
      state.system = value;
      store.set("library.filterSystem", value);
      ctx.go(value === "all" ? "/library" : `/library/${value}`);
      return;
    }
    state.only = value;
    store.set("library.only", value);
    draw();
  }

  function reset() {
    Object.assign(state, { system: "all", genre: "all", only: "all", q: "" });
    store.set("library.query", "");
    store.set("library.filterSystem", "all");
    store.set("library.filterGenre", "all");
    store.set("library.only", "all");
    const q = document.getElementById("q");
    if (q) q.value = "";
    shown = PAGE;
    ctx.go("/library");
    draw();
  }
}

function routeSystem(ctx) {
  const s = ctx?.route?.params?.system;
  return s && SYSTEM_BY_ID[s] ? s : "";
}

function filter(state) {
  let list = searchGames(state.q, { system: state.system, genre: state.genre });
  if (state.only === "built") list = list.filter((g) => g.builtin);
  if (state.only === "ready") {
    const ready = new Set(readyGames().map((g) => g.id));
    list = list.filter((g) => ready.has(g.id));
  }
  if (state.only === "starred") list = list.filter((g) => store.gameConfig(g.id).favorite);
  switch (state.sort) {
    case "az":
      list.sort((a, b) => a.title.localeCompare(b.title));
      break;
    case "year-new":
      list.sort((a, b) => (b.year || 0) - (a.year || 0) || (b.rating ?? 0) - (a.rating ?? 0));
      break;
    case "year-old":
      list.sort((a, b) => (a.year || 0) - (b.year || 0) || (b.rating ?? 0) - (a.rating ?? 0));
      break;
    case "plays":
      list.sort((a, b) => (store.gameConfig(b.id).plays || 0) - (store.gameConfig(a.id).plays || 0));
      break;
    default:
      // built-ins ride at the top of the rating sort: they are the ones you can
      // actually start this second
      list.sort((a, b) => (b.builtin ? 11 : 0) - (a.builtin ? 11 : 0) || (b.rating ?? 0) - (a.rating ?? 0));
  }
  return list;
}

/* ------------------------------------------------------- one game, all of it */
export function gameSheet(game, onDone) {
  const romHash = game.builtin ? null : romForGame(game);
  const ref = playRefFor(game);
  const bundled = bundledRom(game);
  const body = h("div", { style: { display: "grid", gap: "12px" } });
  const s = sheet(game.title, body, {
    wide: true,
    actions: [
      h("button.icon", {
        "aria-label": "Star this game",
        title: "Star",
        class: store.gameConfig(game.id).favorite ? "is-on" : "",
        onclick: (e) => {
          const on = store.toggleFavorite(game.id);
          e.currentTarget.classList.toggle("is-on", on);
          toast(on ? "Starred" : "Unstarred", "good", 1400);
        },
      }, "★"),
    ],
    onClose: () => onDone?.(),
  });
  draw();

  function set(patch) {
    store.setGame(game.id, patch);
    draw();
  }

  function draw() {
    const cfg = store.resolvedFor(game.id, game.system);
    mount(
      body,
      h("div.sheet__2col", {},
        h("div", { style: { display: "grid", gap: "10px" } },
          coverEl(game),
          h("div.rows", {},
            row("Console", sysName(game.system)),
            row("Year", game.year || "—"),
            row("Genre", game.genre || "—"),
            row("Players", game.players > 1 ? `${game.players} - multi-tap, link or alternating` : "1"),
            row("Rating", game.rating ? `${game.rating}/10` : "n/a (built-in)"),
            game.note ? row("Note", game.note) : null,
            row("Source", game.builtin ? "ships inside RetroDeck" : bundled ? "bundled homebrew - served by this site" : "metadata only - your own cartridge")),
          h("div", { style: { display: "flex", gap: "8px", flexWrap: "wrap" } },
            ref
              ? h("button.btn.btn--primary", { onclick: play }, "▶ Play")
              : h("button.btn.btn--primary", {
                  onclick: () => { s.close(); cartridgeSheet(game, { onDone: () => draw() }); },
                }, "+ Add my cartridge"),
            romHash ? h("button.btn.btn--ghost", { onclick: manageRom }, "Cartridge") : null,
            game.builtin ? h("button.btn.btn--ghost", { onclick: () => aboutBuiltin(game) }, "How it works") : null,
            h("button.btn.btn--ghost", { onclick: () => pickArt(draw) }, coverSrc(game) ? "Replace artwork" : "Add artwork"))),
        h("div", {},
          game.builtin
            ? h("div.notice", {}, h("b", {}, game.howto || "Original title"))
            : bundled
              ? h("div.notice.notice--good", {},
                  h("b", {}, "This file ships with the build."),
                  h("span", {}, "Served from ", h("code", {}, bundled), " on this origin, so it needs nothing from you and keeps working offline."))
              : h("div.notice.notice--warn", {},
                  h("b", {}, "Supply your own cartridge."),
                  h("span", {}, `There is no ${sysName(game.system)} file (${extsFor(game.system)}) to download from this project. ` +
                    "Point it at a dump you legally own and the settings below apply to it.")),
          artLine(),
          sectionTitle("Configuration for this game"),
          configForm({
            sysId: game.system,
            modelId: cfg.model || store.systemConfig(game.system).model || null,
            cfg: { ...cfg, controls: cfg.controls || {} },
            set,
            scope: "game",
          }))),
      game.builtin ? null : statesRow(game, romHash),
    );
  }

  /**
   * Artwork is stored per game in this browser (js/core/art.js): resized on the
   * way in, kept as a data URL next to the save states. Reaching for somebody's
   * box-scan host would break the offline promise and use art that belongs to
   * someone else, so an image comes from the device, or from the covers/ folder
   * this server publishes, and the generated cover stays as the fallback.
   */
  async function pickArt(redraw) {
    const files = await pickFiles({ accept: ART_TYPES });
    const file = files && files[0];
    if (!file) return;
    try {
      const rec = await setArtFromFile(game.id, file);
      rememberArt(game.id, rec);
      toast(`Artwork set - ${rec.w ? `${rec.w}x${rec.h}, ` : ""}${fmtBytes(rec.bytes || 0)} kept on this device`, "good", 3600);
      redraw();
    } catch (e) {
      toast(`That image could not be used: ${(e && e.message) || e}`, "bad", 5000);
    }
  }

  function artLine() {
    const stored = hasArt(game.id);
    const fromBuild = game.cover && coverSrc(game) === game.cover;
    if (!stored && !fromBuild) return null;
    const bits = [];
    if (fromBuild) bits.push(h("span", {}, "File on this server: ", h("code", {}, game.cover)));
    else if (!game.builtin) {
      // the exact path the build looks for, so nobody has to guess the slug
      bits.push(h("span", {}, "Or serve it from this origin: ",
        h("code", {}, `covers/${game.system}/${game.id.split("/")[1]}.png`), " then ", h("code", {}, "npm run build"), "."));
    }
    if (stored) {
      const rec = artCache.get(game.id);
      bits.push(h("span", {}, "Your image: ", h("code", {}, `${rec?.w || "?"}x${rec?.h || "?"} · ${fmtBytes(rec?.bytes || 0)}`), " ",
        h("button.btn.btn--sm.btn--ghost", { onclick: () => dropArt(draw) }, "Remove")));
    }
    return h("div.notice", {}, h("b", {}, "Artwork"), bits);
  }

  async function dropArt(redraw) {
    await clearArt(game.id);
    rememberArt(game.id, null);
    toast("Artwork removed - the generated cover is back", "info");
    redraw();
  }

  function play() {
    store.recordPlay(game.id, { system: game.system, title: game.title });
    s.close();
    location.hash = ref ? `#/play/${ref}` : "#/vault";
  }

  async function manageRom() {
    const rec = await vault.romFor(romHash);
    const doDetach = await confirmSheet(
      "Cartridge in the vault",
      `${rec?.fileName || "This file"} · ${fmtBytes(rec?.size || 0)} · added ${fmtDate(rec?.added)}. ` +
        "Detaching keeps the bytes in the vault so another entry can use them; removing deletes them from this browser.",
      "Detach",
    );
    if (doDetach) {
      store.setGame(game.id, { romHash: null });
      s.close();
      onDone?.();
    }
  }

  /** Save states for this game, straight out of IndexedDB. */
  function statesRow(game2, hash) {
    const box = h("div.rows", {}, h("div.row", {}, h("span.row__label", {}, "Loading save states…")));
    refresh();
    return box;

    async function refresh() {
      const states = (await vault.statesFor(game2.id).catch(() => [])) || [];
      if (!states.length) {
        mount(box, h("div.row", {},
          h("span.row__label", {}, "No save states yet",
            h("small.muted", {}, "the toolbar in the player writes them, up to 10 slots"))));
        return;
      }
      mount(box, ...states.map((st) =>
        h("div.row", {},
          h("span.row__label", {}, `Slot ${st.slot}`,
            h("small.muted", {}, `${fmtDate(st.at)} · ${fmtBytes(st.bytes?.length || 0)}${st.title ? ` · ${st.title}` : ""}`)),
          h("div", { style: { display: "flex", gap: "6px" } },
            h("button.btn.btn--sm", {
              onclick: () => {
                s.close();
                location.hash = `#/play/rom:${hash}?game=${encodeURIComponent(game2.id)}&slot=${st.slot}`;
              },
            }, "Load"),
            h("button.btn.btn--sm.btn--ghost", {
              onclick: async () => {
                await vault.deleteState(game2.id, st.slot);
                refresh();
              },
            }, "✕")))));
    }
  }
}

function coverEl(game) {
  const drawn = () => coverSVG(game, { style: store.get("ui.coverStyle", "pixel"), w: 200, h: 250 });
  const src = coverSrc(game);
  if (!src) {
    return h("div", {
      style: { borderRadius: "var(--r)", overflow: "hidden", border: "var(--line)", background: "var(--panel-2)" },
      html: drawn(),
    });
  }
  let host;
  const img = h("img", {
    src,
    alt: `${game.title} cover`,
    decoding: "async",
    onerror: () => {
      if (host) host.innerHTML = drawn();
    },
  });
  host = h("div.sheet__art", { style: { aspectRatio: "4 / 5" } }, img);
  return host;
}

function row(k, v) {
  return h("div.row", {},
    h("span.row__label", {}, k),
    h("b.mono.small", { style: { textAlign: "right", maxWidth: "62%" } }, String(v)));
}

function aboutBuiltin(game) {
  const def = gameFor(game.builtin) || {};
  sheet(`${game.title} · how it is made`,
    h("div", { style: { display: "grid", gap: "10px" } },
      h("p.sheet__p", {}, game.blurb || game.note),
      h("div.rows", {},
        row("Engine", "RetroDeck canvas host - js/games/engine.js"),
        row("Source", `js/games/${moduleOf(game.builtin)}.js`),
        row("Logical size", `${def.w ?? "?"}×${def.h ?? "?"} px at 60 Hz`),
        row("Pad", `${def.pad || game.pad} - the same Deck class the emulator uses`),
        row("Feels like", game.inspiredBy || "the genre, not a cartridge")),
      h("div.notice", {},
        h("b", {}, "Written for this project."),
        h("span", {}, "These six titles exist so the whole pipeline - shell, skin, pad, save states, haptics, pause, game over - can be exercised without a single third-party byte. " +
          "Original art, original sound, original level generation, MIT licensed. No sprite, sample, map, character or melody from any commercial game is included."))),
    { wide: true });
}

const moduleOf = (id) =>
  ({ chomp: "arcade", bricks: "arcade", blastr: "puzzle", stack: "puzzle", blitz: "action", lancer: "action" })[id] || "engine";
