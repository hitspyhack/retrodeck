# Homebrew for Sega Saturn

Put **Sega Saturn** (`segaSaturn`) ROMs you are allowed to redistribute in this
folder, then run:

```sh
npm run build
```

The build walks `homebrew/`, reads the file names, and adds each image to
`data/games.json` as `source: "bundled"`. It then shows up in the library, on
the home shelf, and in the **Sega Saturn** deck as "ready to play" - no import
dialog, no vault step, because the file is served from this origin.

## What the deck will do with it

| | |
| --- | --- |
| Media | disc image - accepted extensions: `.cue`, `.chd`, `.bin`, `.iso`, `.ccd`, `.zip` |
| Core | `segaSaturn` |
| Buttons | Saturn Control Pad (db, 6 buttons) (digital-only 6-button + L/M/R) - 13 inputs |
| Other layouts | 3D Control Pad (analog), Arcade Racer (wheel + pedals), Sega Mouse + D-pad |
| Aspect | 4:3 - native 320x224 |
| Models | Sega Saturn HST-3020, Victor VSX-1 / Multi-CART 6MB |
| Skins | Saturn HST-3020, Aftermarket · Wave White, Aftermarket · Carbon Stealth |
| BIOS | Saturn BIOS (JP/US/EU) + optionally SCSP/CD - add it in **Cartridges ▸ BIOS images** or it will not boot |

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
