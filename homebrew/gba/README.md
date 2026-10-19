# Homebrew for Game Boy Advance

Put **Game Boy Advance** (`gba`) ROMs you are allowed to redistribute in this
folder, then run:

```sh
npm run build
```

The build walks `homebrew/`, reads the file names, and adds each image to
`data/games.json` as `source: "bundled"`. It then shows up in the library, on
the home shelf, and in the **Game Boy Advance** deck as "ready to play" - no import
dialog, no vault step, because the file is served from this origin.

## What the deck will do with it

| | |
| --- | --- |
| Media | cartridge - accepted extensions: `.gba`, `.agb`, `.gbz`, `.zip`, `.7z` |
| Core | `gba` |
| Buttons | Game Boy Advance (001 - L/R bumpers, A/B at 20°) - 10 inputs |
| Other layouts | GBA SP / Micro shells, GBA Micro pad, GBA + e-Reader / Player, GBA link-cable pair |
| Aspect | 3:2 - native 240x160 |
| Models | Game Boy Player (GC), Game Boy Advance AGB-001, GBA SP (frontlit) AGS-001, Game Boy Micro AGB-101 |
| Skins | Dreamcast (HKT-1000), Aftermarket · Carbon Stealth |
| BIOS | GBA BIOS (16KB) - enables real boot, saves, SIO - add it in **Cartridges ▸ BIOS images** or it will not boot |

## Naming

Use a readable name and keep the region in parentheses - the importer guesses
the title from the file name when the header has nothing useful:

```
my-game (USA).gba
```

Zip and 7z are fine where the table above lists them; the core unpacks them.

## Please

Only add software you wrote, or that the author released for redistribution.
RetroDeck ships no commercial ROMs and this folder is not an exception to that -
`npm run build` will happily index whatever is in here, so keep it legal.
