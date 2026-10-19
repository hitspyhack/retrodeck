# Adding games, systems and hardware

Three different things you can add, in increasing order of commitment. The
first one is the one that matters for most people.

## 1. Freely licensed ROMs → `homebrew/<system>/`

```sh
cp ~/stuff/Polar-Getaway.nes homebrew/nes/
npm run build
npm start
```

`npm run build` (`tools/build-catalog.mjs`) walks `homebrew/` and turns every
file with a *real* extension for that system into a catalogue row:

| field | where it comes from |
| --- | --- |
| `id` | `system/` + slug of the file name — so `Polar Getaway (v1.2).nes` in `homebrew/nes/` is `nes/polar-getaway-v1-2` |
| `title` | the file name without the extension, `-_` turned into spaces; parentheticals (region, revision) stay in the title, which is where a player wants them |
| `system` | the folder it sits in |
| `genre` | `"Homebrew"` unless the slug already matches a catalogue row, in which case that row's metadata wins and only gains `source: "bundled"` + `rom` |
| `note` | `bundled file (32 KB) - free to ship` |
| `rom` | `homebrew/<system>/<file>` — the path the player fetches |

Then the app treats it as playable everywhere: the card gets a **Bundled**
badge, the deck's `Ready to play here` strip counts it, `Play` boots the core
with that file, and the service worker caches it after the first run, so it
keeps working offline.

Rules the indexer enforces, with a warning on stderr and a non-zero exit:

- the folder must be a system id from `js/data/systems.js` — `homebrew/pce/` is
  right, `homebrew/turbografx/` is not;
- the extension must be one that system accepts (`exts` in the same file),
  because `.txt` in there is documentation;
- `README.md` and dotfiles are always skipped;
- a file whose slug matches a catalogue row *upgrades that row* to `bundled`
  instead of adding a duplicate.

Nothing else about the pipeline uploads or shares the file: it is a static
asset on your origin, and `git` ignores it (`.gitignore` keeps `homebrew/**/*`
out of commits while keeping the per-system READMEs).

Note that `homebrew/**/*` is git-ignored (all of it, except the READMEs): the
files are yours, and a repository that indexes them must not be a place they
leak into. If you are publishing a site with bundled games, commit them
explicitly (`git add -f homebrew/nes/your-game.nes`) after you have checked the
licence, or just ship the `homebrew/` tree next to the built site and let
`npm run build` do the rest.

Each folder has a README generated from the app's own data — extensions, core,
button count, layouts, aspect, models, skins, BIOS — so you can check what the
deck will do with a file before you put it there. `node tools/make-homebrew.mjs
--force` regenerates them after you change systems data.

### If the file is fine but the game will not boot

The order of blame, cheapest first:

1. **core** — Deck ▸ that console ▸ *Emulator core*: `gambatte` vs `mame` vs
   the accuracy build;
2. **BIOS** — Cartridges ▸ BIOS images (PSX, NDS, Dreamcast and friends need
   one; the deck says which);
3. **header** — the importer's sniff summary tells you what the file claims to
   be; if it disagrees with the folder, the file is a hack or a bad dump;
4. **model** — a Super Game Boy or a GBC-era cartridge on a DMG model runs in
   that model's palette and screen box, which is the point, but not for games
   that require the newer hardware.

## 2. Metadata for a game you already own → `data/source/games.tsv`

The catalogue is one pipe-separated file. `npm run build` reads it and writes
`data/games.json` + `js/data/games.generated.js`; the generated files are
committed so a clone runs with no build step.

```
system|Title|year|genre|players|rating|note
nes|Super Mario Bros.|1985|Platformer|2|9.0|2P alternating; warp zones
```

- exactly 6 or 7 fields; `note` may be empty, the rest may not;
- `system` must exist in `js/data/systems.js`, `year` must be a number in
  1972-2026, `rating` a number in 0-10, `players` a number (a trailing `+` is
  fine: `2+` reads as 2). Anything else is a *problem* and the build exits 1 -
  a half-written row is worse than no row;
- ids are derived as `system/slug(title)`, and a duplicate slug is dropped with
  a problem, so a title change is an id change: save states and per-game
  settings follow the *id*. Rename with that in mind;
- `note` is user-visible prose. Use it for what a player needs to know before
  booting: "battery save", "needs multi-tap", "6-button pads", "PAL only",
  "unsaved progress". Tags (`multiplayer`, `co-op`, `link-cable`, `needs-bios`,
  `6-button`, `expansion-pak`, `battery-save`, `mature`, …) are derived from the
  note and from `genre` by `deriveTags()`, which keeps the shelf filters honest
  without a second list to maintain.

**Never** put a URL to a game file in any column. The build does not check that
you obeyed, `npm test` does (check 8: no document in the repo may link to a
file this project does not have).

## 3. Hardware: a system, a model, a pad or a skin

The four data files in `js/data/` are the whole model of the machine, and every
one of them is validated by `npm test` against the others.

**A new system** (`js/data/systems.js`) needs: `id`, `name`, `short`, `color`,
`ejsCore` + `cores[]` (each `{id,label}` matching a core the runtime actually
publishes), `exts[]`, `res`/`ar`, `controlScheme` (only the names EmulatorJS
accepts; anything else is dropped, see `EJS_SCHEMES` in `js/core/emulator.js`),
`pad` + `pads[]` (ids from `js/data/layouts.js`), `buttons[]` where each entry is
`{id, ejs, key, label, group, hint}` — `ejs` is the index in the core's control
table (0-29) or `null` for meta buttons and analog axes, `key` is a real
`KeyboardEvent.code` — `bios` if it wants one, `shaders[]`, `palettes[]`,
`features` (booleans for the flags the app branches on, prose for the rest) and
a one-line `note`. Add a row per game to the catalogue, and a folder
`homebrew/<id>/` (run `node tools/make-homebrew.mjs`).

**A new model** (`js/data/models.js`) is a revision: `tpl` must be one of
`TEMPLATE_IDS` in `js/core/shell.js`, `pad` one of `PAD_IDS`, `skins[]` one of
`SKIN_IDS`, plus `screen {w, px, ar}`, `deco {brand, product, stripe, …}` that
the template reads, `sets` for what this revision changes by default, and
`extras[]` for the things a player asks about (link port, expansion slot,
backlight). If no template fits, add one: a template is a function of the model
that returns `{vb, aspect, screen, items(m)}` of SVG fragments — `handheld-slide`
(the PSP-N1000, added last) is 40 lines and is the one to copy.

**A new pad layout** (`js/data/layouts.js`) is a list of widgets in a
`100 × 46` unit field (`100 × 96` for `orient: "portrait"`, which is what a
computer deck with a keybed uses). Widget types: `btn`, `dpad`, `stick`,
`shoulder`, `pill`, `switch`, `keys`, `region` — where
`region` and `keys` are authored from their *centre* and everything else from
top-left. `padButtonIds()` is what the keyboard map and the core's control table
are built from, so if a button id is not in the system's `buttons[]`, it will not
be sendable to the core.

**A new skin** (`js/data/skins.js`) is up to 22 CSS variables (`CSS_VAR_KEYS`)
that the shell art and the pad both read, plus optional `grille`/`label`
texture. `skinVars()` supplies the fallbacks so a skin can be four colours deep
and still render; `AFTERMARKET` is the list of skins that are not period-correct
and are labelled as such.

## Adding a built-in game

`js/games/` is the only playable content this repo ships, so it is deliberately
small and completely self-contained — no network, no assets, no core. Copy an
existing title:

```js
export default {
  id: "mygame", slug: "my-game", title: "My Game", system: "gb",
  pad: "gb", w: 160, h: 144, res: [160, 144], genreSlug: "action", players: 1,
  blurb: "one line in the shelf", howto: "how to play, in two lines",
  inspiredBy: "the genre, in prose - never a specific game's name",
  create(ctx, io, host) {
    // ctx  - the CanvasRenderingContext2D, already pixel-snapped and scaled
    //        to w x h (use rect()/text() from engine.js, not raw fills)
    // io   - time, frames, fps, cfg, w, h, sfx, input, hud(patch),
    //        score(n), setScore(n), getScore(), over(msg), restart(),
    //        event(name, payload), save(key, value), load(key, default)
    // host - the GameHost, if you need its loop or its canvas
    return {
      update(dt) {},               // fixed step, dt in seconds
      draw(g) {},                  // g === ctx
      reset() {},                  // called by io.restart()
      onButton(id, down) {},       // edge events; io.input polls the level too
    };
  },
};
```

Export it from one of the modules in `js/games/` (`arcade.js`, `puzzle.js`,
`action.js`) and register it in `js/games/index.js` - the sim, the shelf and the
player all read that registry, so there is nothing else to wire. Then:

```sh
npm run sim            # tools/sim.mjs runs every game for N frames with fake input
npm test               # the sim, the DOM boot, and the data cross-reference
```

`tools/sim.mjs` is how a game gets tested here, with no browser: every exported
title in `js/games/` is run for 300 frames on the `cycle` input profile and 900
on `sprint`, driving the real `update` / `draw` / `onButton` / `reset` path
against a canvas stub, and pressing buttons through the same `Input` object the
virtual deck uses. The run fails if a title throws, if it does not expose
`update` and `draw`, or if its score ever goes non-finite; and it prints the best
score, level, lives, event count, whether the game reached a game-over and what
it wrote to storage, so a change in behaviour is visible in the test output
rather than silently accepted. If your game reads a field of `io` that does not
exist yet, add it to `GameHost.start()` **and** to the fake `io` in the sim -
otherwise the sim passes and the browser throws.
