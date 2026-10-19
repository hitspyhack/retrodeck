# Homebrew for Nintendo DS

Put **Nintendo DS** (`nds`) ROMs you are allowed to redistribute in this
folder, then run:

```sh
npm run build
```

The build walks `homebrew/`, reads the file names, and adds each image to
`data/games.json` as `source: "bundled"`. It then shows up in the library, on
the home shelf, and in the **Nintendo DS** deck as "ready to play" - no import
dialog, no vault step, because the file is served from this origin.

## What the deck will do with it

| | |
| --- | --- |
| Media | cartridge - accepted extensions: `.nds`, `.dsi`, `.zip`, `.7z` |
| Core | `nds`; also selectable: `melonds`, `desmume` |
| Buttons | Nintendo DS (top + touch) (ABXY, L/R, Start/Select, home; lower screen is a touch layer) - 13 inputs |
| Other layouts | DS stylus-first, DSi (camera + bigger buttons) |
| Aspect | 4:3 - native 256x192 |
| Models | Nintendo DS NTR-001, DS Lite USL-001, DSi TWL-001 |
| Skins | DS Lite Onyx, Aftermarket · Polar (SNES Jr), Aftermarket · Neon Night |
| BIOS | DS firmware + ARM7/ARM9 BIOS - add it in **Cartridges ▸ BIOS images** or it will not boot |

## Naming

Use a readable name and keep the region in parentheses - the importer guesses
the title from the file name when the header has nothing useful:

```
my-game (USA).nds
```

Zip and 7z are fine where the table above lists them; the core unpacks them.

## Please

Only add software you wrote, or that the author released for redistribution.
RetroDeck ships no commercial ROMs and this folder is not an exception to that -
`npm run build` will happily index whatever is in here, so keep it legal.
