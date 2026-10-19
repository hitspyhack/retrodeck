# Homebrew for PC Engine / TurboGrafx-16

Put **PC Engine / TurboGrafx-16** (`pce`) ROMs you are allowed to redistribute in this
folder, then run:

```sh
npm run build
```

The build walks `homebrew/`, reads the file names, and adds each image to
`data/games.json` as `source: "bundled"`. It then shows up in the library, on
the home shelf, and in the **PC Engine / TurboGrafx-16** deck as "ready to play" - no import
dialog, no vault step, because the file is served from this origin.

## What the deck will do with it

| | |
| --- | --- |
| Media | cartridge - accepted extensions: `.pce`, `.cue`, `.chd`, `.sgx`, `.ccd`, `.zip` |
| Core | `pce_fast` |
| Buttons | PC Engine Core Pad (I/II diagonal, Run + Select, 2-button only) - 9 inputs |
| Other layouts | PC Engine 6-button (Arcade Pad Pro), Sega Mouse + D-pad, Ahead-6 (mouse, 6 buttons) |
| Aspect | 4:3 - native 256x224 |
| Models | PC Engine Core Grafx, TurboGrafx-16, PC Engine Duo-R (VC) |
| Skins | PC Engine Core Grafx, Aftermarket · Mint Cream, Aftermarket · Translucent Purple |
| BIOS | System Card 3 (for CD games) - add it in **Cartridges ▸ BIOS images** or it will not boot |

## Naming

Use a readable name and keep the region in parentheses - the importer guesses
the title from the file name when the header has nothing useful:

```
my-game (USA).pce
```

Zip and 7z are fine where the table above lists them; the core unpacks them.

## Please

Only add software you wrote, or that the author released for redistribution.
RetroDeck ships no commercial ROMs and this folder is not an exception to that -
`npm run build` will happily index whatever is in here, so keep it legal.
