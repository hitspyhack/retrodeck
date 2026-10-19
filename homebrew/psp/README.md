# Homebrew for PlayStation Portable

Put **PlayStation Portable** (`psp`) ROMs you are allowed to redistribute in this
folder, then run:

```sh
npm run build
```

The build walks `homebrew/`, reads the file names, and adds each image to
`data/games.json` as `source: "bundled"`. It then shows up in the library, on
the home shelf, and in the **PlayStation Portable** deck as "ready to play" - no import
dialog, no vault step, because the file is served from this origin.

## What the deck will do with it

| | |
| --- | --- |
| Media | disc image - accepted extensions: `.iso`, `.cso`, `.pbp`, `.elf`, `.chd` |
| Core | `psp`; also selectable: `ppsspp` |
| Buttons | PSP faceplate (nub left, 4 face buttons right, start/select below) - 13 inputs |
| Other layouts | PSP Go (slide-out pad) |
| Aspect | 16:9 - native 480x272 |
| Models | PSP-1000 (Torch), PSP Go (N1000) |
| Skins | PSP-1000 Ceramic White, PSP-3000 Midnight Blue, Aftermarket · Neon Night |
| BIOS | PSP flash0 (optional, improves font/video) - add it in **Cartridges ▸ BIOS images** or it will not boot |

## Naming

Use a readable name and keep the region in parentheses - the importer guesses
the title from the file name when the header has nothing useful:

```
my-game (USA).iso
```

Zip and 7z are fine where the table above lists them; the core unpacks them.

## Please

Only add software you wrote, or that the author released for redistribution.
RetroDeck ships no commercial ROMs and this folder is not an exception to that -
`npm run build` will happily index whatever is in here, so keep it legal.
