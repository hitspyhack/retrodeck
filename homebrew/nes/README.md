# Homebrew for Nintendo Entertainment System

Put **Nintendo Entertainment System** (`nes`) ROMs you are allowed to redistribute in this
folder, then run:

```sh
npm run build
```

The build walks `homebrew/`, reads the file names, and adds each image to
`data/games.json` as `source: "bundled"`. It then shows up in the library, on
the home shelf, and in the **Nintendo Entertainment System** deck as "ready to play" - no import
dialog, no vault step, because the file is served from this origin.

## What the deck will do with it

| | |
| --- | --- |
| Media | cartridge - accepted extensions: `.nes`, `.fds`, `.unf`, `.nsf`, `.zip`, `.7z` |
| Core | `nes` |
| Buttons | NES Control Deck (HVC-016 / Famicom pads) - 9 inputs |
| Other layouts | Famicom (HVC-001) hardwired pads, NES Zapper + D-pad |
| Aspect | 4:3 - native 256x240 |
| Models | NES-001 (front loader), NES-101 (top loader), Family Computer HVC-001, AV Famicom HVC-101, VS. Unisystem (arcade), Playchoice-10 (Famicom) |
| Skins | NES-001 Black & Grey, Aftermarket · Carbon Stealth, Aftermarket · Neon Night |

## Naming

Use a readable name and keep the region in parentheses - the importer guesses
the title from the file name when the header has nothing useful:

```
Micro Mages (USA).nes
```

Zip and 7z are fine where the table above lists them; the core unpacks them.

## Please

Only add software you wrote, or that the author released for redistribution.
RetroDeck ships no commercial ROMs and this folder is not an exception to that -
`npm run build` will happily index whatever is in here, so keep it legal.
