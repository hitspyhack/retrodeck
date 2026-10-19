/**
 * Home: the deck you are holding, what you can play right now, and the way to
 * every other screen. Deliberately short - on a phone the first screen has to
 * answer "what can I play" in under a second.
 */
import { store, fmtBytes } from "../core/store.js";
import { SYSTEMS, SYSTEM_BY_ID } from "../data/systems.js";
import { MODELS } from "../data/models.js";
import { SKINS } from "../data/skins.js";
import { PADS } from "../data/layouts.js";
import { vault } from "../core/idb.js";
import { probeEmulator, localVendorPresent } from "../core/emulator.js";
import { h, mount, sectionTitle, sheet } from "../ui.js";
import { BUILTINS, INDEX, INDEX_COUNTS, INDEX_META, gameCard, gameById, sysName, statPill, cartridgeSheet, readyGames } from "./parts.js";

export async function renderHome(root, ctx) {
  const recent = store.recentlyPlayed(8);
  const favs = store.favorites();
  const usage = await vault.usage().catch(() => null);
  const stored = usage ? `${fmtBytes(usage.usage)} of ${fmtBytes(usage.quota)}` : "unknown";
  const romCount = (await vault.list("roms").catch(() => [])).length;

  mount(
    root,
    hero(romCount, stored),
    h("div.notice", { id: "runtime-strip" }, h("span.small.muted", {}, "Checking the emulator runtime…")),
    legalNotice(),
    recent.length ? shelf("Continue where you left off", recent.map((r) => gameById(r.id)).filter(Boolean), [
      h("button.btn.btn--sm.btn--ghost", { onclick: () => { store.set("library.query", ""); ctx.go("/library"); } }, "All games"),
    ]) : null,
    shelf("Play right now - no files needed", BUILTINS, [
      h("span.small.muted", {}, "written for RetroDeck"),
    ], true),
    h("section", {},
      sectionTitle("Pick a console", h("button.btn.btn--sm.btn--ghost", { onclick: () => ctx.go("/decks") }, "All 26 ▸")),
      h("div.cards", {}, ...SYSTEMS.slice(0, 8).map((sys) =>
        gameCard(fakeSystemCard(sys), { onClick: (g) => ctx.go(`/deck/${g.system}`) })))),

    favs.length ? shelf("Starred", favs.map((f) => gameById(f.id)).filter(Boolean), []) : null,
    systemsSection(ctx),
    footer(romCount, stored),
  );

  const strip = root.querySelector("#runtime-strip");
  if (strip) fillRuntimeStrip(strip);
}

function hero(romCount, stored) {
  return h("section.hero", {},
    h("h1", {}, "A pocket full of consoles"),
    h("p", {},
      `${INDEX_META.count} classic titles indexed, ${SYSTEMS.length} systems, ${MODELS.length} hardware models, ${Object.keys(PADS).length} controller layouts and ${Object.keys(SKINS).length} skins - ` +
      "each model picks the buttons, the aspect ratio, the palette and the shell you see. Add the cartridges you own, or start one of the six built-in games below without touching a file."),
    h("div.hero__stats", {},
      statPill("titles", INDEX_META.count),
      statPill("systems", SYSTEMS.length),
      statPill("models", MODELS.length),
      statPill("skins", Object.keys(SKINS).length),
      statPill("in your vault", romCount),
      statPill("stored", stored)),
    h("div", { style: { display: "flex", gap: "8px", flexWrap: "wrap" } },
      h("button.btn.btn--primary", { onclick: () => (location.hash = "#/play/builtin:chomp") }, "▶ Maze Chomp"),
      h("button.btn", { onclick: () => cartridgeSheet(null) }, "+ Add cartridges"),
      h("button.btn.btn--ghost", { onclick: () => (location.hash = "#/decks") }, "Choose hardware"))
  );
}

function legalNotice() {
  if (!store.get("ui.showNagAboutRoms", true)) return null;
  return h("div.notice", {},
    h("b", {}, "Bring your own games."),
    h("span", {},
      "RetroDeck ships no commercial ROMs, BIOS files or download links - the index exists so you can find, filter and configure the games you already own. " +
      "Six original titles are written into the app and playable offline. "),
    h("div.notice__row", {},
      h("button.btn.btn--sm.btn--ghost", { onclick: () => aboutSheet() }, "What is in the box?"),
      h("button.btn.btn--sm.btn--ghost", {
        onclick: () => {
          store.set("ui.showNagAboutRoms", false);
          render2();
        },
      }, "Dismiss")));
}

const render2 = () => import("../app.js").then((m) => m.render());

function shelf(title, games, right = [], wide = false) {
  if (!games.length) return null;
  return h("section", {},
    sectionTitle(title, ...(right || [])),
    h("div.cards", {}, ...games.map((g) => gameCard(g, wide ? { onClick: (x) => (location.hash = `#/play/${x.builtin}`) } : {}))));
}

/** The systems shelf reuses the card grid with a console tile as its art. */
function fakeSystemCard(sys) {
  return { ...sys, __sys: true, id: `system/${sys.id}`, title: sys.name, year: sys.year, genre: "Console", rating: null, system: sys.id };
}

function systemsSection(ctx) {
  return h("section", {},
    sectionTitle("Every system",
      h("button.btn.btn--sm.btn--ghost", { onclick: () => ctx.go("/decks") }, "Hardware ▸")),
    h("div.sysGrid", {},
      ...SYSTEMS.map((s) =>
        h("button.sysTile", {
          style: { "--swatch": s.color },
          onclick: () => ctx.go(`/deck/${s.id}`),
        },
          h("b", {}, s.name),
          h("span", {}, `${s.vendor} · ${s.year}`),
          h("em", {}, `${INDEX_COUNTS[s.id] || 0} titles indexed · ${s.controlScheme}`)))));
}

function footer(romCount, stored) {
  return h("section", {},
    sectionTitle("Saved on this device"),
    h("div.rows", {},
      h("div.row", {}, h("span.row__label", {}, "Cartridges in the vault", h("small.muted", {}, "IndexedDB, never uploaded")), h("b.mono", {}, String(romCount))),
      h("div.row", {}, h("span.row__label", {}, "Save states + battery saves"), h("b.mono", {}, String((store.state.game && Object.keys(store.state.game).length) || 0) + " games tracked")),
      h("div.row", {},
        h("span.row__label", {}, "Deck you had last"),
        h("b.mono", {}, store.get("play.lastSystem", "snes") + " · " + (store.get("play.lastModel", "") || "auto"))),
      h("div.row", {},
        h("span.row__label", {}, "Storage estimate"),
        h("b.mono", {}, stored)),
      h("div.row", {},
        h("span.row__label", {}, "Free up space"),
        h("button.btn.btn--sm.btn--ghost", { onclick: () => (location.hash = "#/vault") }, "Open vault"))));
}

function fillRuntimeStrip(el) {
  (async () => {
    const local = await localVendorPresent();
    if (local) {
      el.innerHTML = `<span class="dot dot--good"></span> EmulatorJS is mirrored in <code>./vendor</code> - cores and this page work with the radio off.`;
      return;
    }
    const p = await probeEmulator({ timeout: 4000 });
    el.innerHTML = p.ok
      ? `<span class="dot dot--warn"></span> Cartridge playback streams the emulator from <code>cdn.emulatorjs.org</code>. Run <code>npm run vendor</code> once to make this install fully offline.`
      : `<span class="dot dot--bad"></span> The emulator payload is unreachable right now. The six built-in titles and every imported file still work; run <code>npm run vendor</code> and reload to play cartridges offline.`;
  })();
}

function aboutSheet() {
  const built = BUILTINS.map((g) =>
    h("div.li", {},
      h("div.li__main", {}, h("b", {}, g.title), h("span", {}, `${sysName(g.system)} · ${g.genre} · ${g.note || ""}`)),
      h("button.btn.btn--sm", { onclick: () => { location.hash = `#/play/${g.builtin}`; } }, "Play")));
  sheet("What ships inside RetroDeck",
    h("div", { style: { display: "grid", gap: "12px" } },
      h("p.sheet__p", {},
        "An ES-module front end for RetroArch-in-the-browser (EmulatorJS), plus the metadata of ",
        INDEX.length, " classic games so you can find and configure your own copies. Six playable originals are written from scratch: a maze chase, a wall breaker, a bomber, a puzzler, a momentum platformer and a shooter."),
      h("div.list", {}, ...built),
      h("div.notice.notice--warn", {},
        h("b", {}, "No ROMs, by design."),
        h("span", {}, "Commercial titles are listed with year, genre, player count and control notes only, and the card says \"supply your own cartridge\". " +
          "BIOS images for the systems that legally require them are files you add yourself.")),
      h("p.small.muted", {}, "MIT licensed · see LICENSE and NOTICE.md in the repository. EmulatorJS is a separate project under its own license; the CDN or ./vendor holds its payload.")),
    { wide: true });
}
