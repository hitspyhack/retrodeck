# Homebrew for PlayStation

Put **PlayStation** (`psx`) ROMs you are allowed to redistribute in this
folder, then run:

```sh
npm run build
```

The build walks `homebrew/`, reads the file names, and adds each image to
`data/games.json` as `source: "bundled"`. It then shows up in the library, on
the home shelf, and in the **PlayStation** deck as "ready to play" - no import
dialog, no vault step, because the file is served from this origin.

## What the deck will do with it

| | |
| --- | --- |
| Media | disc image - accepted extensions: `.cue`, `.chd`, `.bin`, `.pbp`, `.exe`, `.m3u`, `.cbn`, `.zip` |
| Core | `psx` |
| Buttons | PlayStation controller (SCPH-1080 - digital only, shapes on the face buttons) - 19 inputs |
| Other layouts | DualShock (analog + force feedback), PS1 + Neo Geo 4-shot, GunCon + D-pad, Sega Mouse + D-pad, Multitap 4-player |
| Aspect | 4:3 - native 320x240 |
| Models | PlayStation SCPH-1002 (JP), PlayStation (7500 - video out), PSone (SCP-100), Net Yaroze (PSYQ dev deck) |
| Skins | PlayStation SCPH-1002, Aftermarket · Carbon Stealth, Aftermarket · Translucent Smoke |
| BIOS | PlayStation BIOS (scph5500/1/2.bin) - add it in **Cartridges ▸ BIOS images** or it will not boot |

## Naming

Use a readable name and keep the region in parentheses - the importer guesses
the title from the file name when the header has nothing useful:

```
my-game (World).cue
```

Zip and 7z are fine where the table above lists them; the core unpacks them.

## Please

Only add software you wrote, or that the author released for redistribution.
RetroDeck ships no commercial ROMs and this folder is not an exception to that -
`npm run build` will happily index whatever is in here, so keep it legal.
