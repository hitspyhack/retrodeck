# Playing games

Everything here is about *your* files. RetroDeck has no game data of its own
except the six originals in `js/games/`, and it will never ask for an account, a
key or a consent banner. If a game you want is commercial, the rule is the
ordinary one: use a copy of something you already own, keep it on your machine,
and don't distribute it. The app never uploads it anywhere — but a browser tab
cannot tell whether you own it, so that part is on you.

## Two ways to get a game in

**1. Import it into the vault** (any device, nothing to rebuild):

```
Cartridges ▸ Add files…      pick .nes / .sfc / .gb / .gba / .nds / .z64 /
                             .md / .cue+.bin / .chd / .iso / .d64 / .zip …
```

Each file is sniffed, not trusted: the header tells the app which console it
really is, what the cartridge calls itself, whether it is a disc image, and
roughly what region it wants. Wrong-system imports are flagged rather than
refused, because multi-cart and re-dumped headers lie sometimes. Files live in
IndexedDB under the origin you are on. `https://example.com` and
`http://localhost:4173` are two different vaults, and an incognito window has a
temporary one — that surprises people, so it is worth knowing.

**2. Ship it with the site** (only for files you are allowed to distribute):
put the image in `homebrew/<system>/`, run `npm run build`, and it becomes a
catalogue entry with a `Play it now` button. No import, no vault, cached by the
service worker, works offline. See [ADDING-GAMES.md](ADDING-GAMES.md).

## Attaching a file to a catalogue entry

Importing on its own makes a game appear under **Cartridges**. To make *Tetris*
on the Game Boy shelf be the one that boots, open the game's card and use
**Add my cartridge** → pick the file. RetroDeck then stores
`{ romHash, system, region, fileName, size }` against that catalogue id, so:

- the card shows *In vault* and the library filter `Ready` finds it;
- the deck, skin, core and key map that game inherits come from the entry, not
  from a guess;
- the region you imported is used to pick the core's video timing, which matters
  for PAL/NTSC frame rates and for a handful of games that refuse to run on the
  wrong one.

Detach returns the card to "metadata only" and leaves the file in the vault, in
case you want to attach it to something else.

## Formats, per family

| Console | Files the deck accepts | Notes |
| --- | --- | --- |
| NES | `.nes .fds .unf .zip` | .unf is the Universal NES format, useful for mappers the core alone does not know |
| SNES | `.sfc .smc .fig .zip` | headered vs headerless is detected; BS-X dumps need the satellite BIOS |
| N64 | `.z64 .v64 .n64 .ndd` | CIC-type detection is the core's job; some titles need the expansion pak in the model config |
| GB / GBC | `.gb .gbc .sgb .zip` | a `.gb` on a GBC deck runs in dual-window colour; the DMG palette setting only affects the DMG models |
| GBA | `.gba .zip` | the 16 KB BIOS is optional but adds real boot, and some games check it |
| NDS | `.nds .zip` | firmware + ARM7/ARM9 images are required, no exceptions |
| Virtual Boy | `.vb .vboy` | the two-eye layout stays a single canvas; the shell art lies for you |
| Master System / Game Gear | `.sms .gg` | Game Gear's 160×144 in a 160×102 window is why the bezel is thick |
| Mega Drive / Mark III | `.md .gen .smd .bin` | 3-button by default, 6-button per game, MO5/Team Tap settings under Deck options |
| Sega CD / 32X / Saturn | `.cue .chd .bin .iso` | `.cue` + `.bin` is the pair the core actually reads; CHD is one file and much smaller |
| PSX | `.cue .chd .bin .exe .pbp` | region-matched BIOS, or it hangs on the logo |
| Dreamcast | `.chd .cue .gdi .cdi` | boot flash and IP.BIN handling live in the core; VMU shows as a second screen |
| PC Engine / Turbo | `.pce .sgx .cue .chd` | Super Grafx needs the right core choice |
| Atari 2600 / 7800 / Lynx | `.a26 .a78 .lnx` | paddles drive the stick; colour and both difficulty switches are real buttons, because games read them |
| Neo Geo Pocket / WonderSwan | `.ngp .ngpc .ws .wsc` | both rotate with the phone if you let them |
| Arcade | `.zip .7z .chd .fbneo` | set names matter: FBNeo wants the zip named after the set it is in |
| C64 / VIC-20 | `.d64 .t64 .tap .crt .prg .zip` | tape images start with the `run` button on the computer deck's pad |
| MS-DOS / ScummVM | `.zip .conf .dosbox .scummvm` | the whole game folder goes in one archive; mounts are configured per game |

## Controls

Three input paths reach the same state, in this order of priority:

1. **Touch / mouse on the virtual pad.** The layout for the model you picked,
   with analog nubs that track your thumb, a dpad that reads diagonals the way
   the hardware did, and long-press repeats where a real console had them.
2. **Keyboard.** Defaults come from the console's `buttons[]` table in
   `js/data/systems.js` (arrows + `Z X` etc.). Rebind them in
   **Settings ▸ Keyboard map** — per console, stored per console, and handed to
   the core as `EJS_defaultControls` so the core agrees with the pad instead of
   keeping a second, secret mapping.
3. **A physical gamepad.** Standard layout, polled by the pad layer while a game
   runs; **Settings ▸ Playing ▸ Gamepads** lists what the browser has seen and
   has a Rescan button for the moment you connect one mid-session. Where a
   console had both a stick and a dpad, either one drives the same buttons - the
   deck decides which widget is which, per model.

Meta buttons are on the pad too where the hardware had them: `menu` (opens the
core's own overlay), `quit`, `reset`, `save`/`load`, `fast forward`, `rewind`,
`turbo` (hold-to-repeat, dialled in Deck options), `mute`, `shader` and `volume`
on systems that had them built in. Anything the core cannot be told about stays
in RetroDeck's own layer — that is why `reset` restarts through the API instead
of pretending to be a key.

**Double-tap the screen** opens the emulator menu; **Esc** quits the game;
**Space** is fast-forward while held; **F2/F4** save and load the active slot.

## Saving, and where things are

| What | Trigger | Where it lands |
| --- | --- | --- |
| Save state | 💾 / F2, ten slots | `states` store, with a screenshot |
| Load state | ⤓ / F4, or `#/play/…?slot=3` to boot straight into one | — |
| Battery save (SRAM) | the core's own save, plus on quit | `sram` store, restored on next boot |
| Screenshot | 📷 | your downloads, and a thumbnail in the states sheet |
| Settings | every change | `localStorage`, key `retrodeck.v1` |
| Everything, as text | Settings ▸ Your data ▸ Export | one JSON file you can keep anywhere |

States and saves are per *game id*, so a rom you re-import and re-attach keeps
its saves. **Cartridges ▸ Save states** lists them with sizes and dates, with a
`Resume` button that boots the game and loads that slot.

If the browser decides it wants to evict storage, you lose the vault — so
RetroDeck asks for persistence once, on the Cartridges screen, and shows the
quota there. Denied is fine: it keeps working, it just may be flushed.

## Picture

**Shader** — none, `crt`, `lcd`, `dot-matrix`, scanlines, `grille` (aperture mask), `xbrz`, `smooth`, or the red/cyan
`stereo-red` one for the Virtual Boy. Applied as CSS plus (where the core supports it) the
core's own shader chain.
**Palette** — for GB/GBC and the mono handhelds: which four shades, and whether
to run a DMG game in DMG colours on a Pocket shell.
**Aspect** — hardware default per model, with `1:1` for pixel-perfect squares
and `auto` if you would rather fill the width.
**Scaling** — nearest by default (that is the whole point), bilinear if you want
the blurry 1990s capture-card look.
**Rotation** — 0/90/180/270 for the handful of games that ship sideways.
**Second screen** — DS and Dreamcast models draw one; touch on it is mapped to
the pen, and the VMU screen shows through as a small panel.

## If it is slow

- Turn rewind off (0 frames) and shader to `none`: both are per-frame costs.
- Fast-forward at 1.5× instead of 3×; some cores do not survive 4×.
- Pick a lighter core in the deck's config (e.g. `vba_next` over `mgba` for GBA
  when you do not need link).
- Close the shell art (the ⛶ theatre button) — SVG over a big canvas is not free
  on older phones.
- Use `npm run vendor:serve`, so the cores come from the same origin and are not
  re-decompressed through a proxy.

The FPS line in the corner (top-right of the stage) is RetroDeck's own frame
counter, not the emulated one — if it reads 60 and the game looks slow, the core
is the limit, not the page.

## Offline

Install the page to a home screen. The service worker caches the app shell and
every file it has fetched from the runtime, so after you have played once, the
game plays with the radio off. To make the *first* run work offline too, mirror
the payload:

```sh
npm run vendor
npm run vendor:serve
```

then **Settings ▸ Emulator ▸ Source ▸ This server**. If a core is missing from
your mirror, the player tells you which one it wanted rather than spinning; the
six built-in games never touch the network at all.

## Troubleshooting

| Symptom | Almost always |
| --- | --- |
| "The core could not load" | no runtime reachable: offline with nothing vendored, or a CDN blocked by the network. Settings ▸ Emulator shows which source it tried |
| Spinner forever, then "The emulator never answered" | the core loaded but the WASM refused to start — usually a threads-requiring core without cross-origin isolation: restart with `npm run vendor:serve` |
| Black screen, sound only | wrong core for that file, or a disc image without its `.cue`. Re-import and read the sniff summary |
| Boots to a logo then hangs | BIOS missing or region-mismatched (PSX, NDS, Dreamcast, GBA optional-but-helpful) |
| Runs at half speed | shader + rewind, or a 4× fast-forward left on |
| Pads do nothing in a menu-heavy game | that game wants the core's own menu: double-tap the screen and map it there; RetroDeck hands its map over on purpose |
| Saves vanished | different origin or profile (incognito, `localhost` vs `127.0.0.1`, another device). The vault is per origin, by design |
| ROM refused as "wrong system" | the header says otherwise; use Add anyway, then set the system on the game's config row |
