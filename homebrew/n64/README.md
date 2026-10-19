# Homebrew for Nintendo 64

Put **Nintendo 64** (`n64`) ROMs you are allowed to redistribute in this
folder, then run:

```sh
npm run build
```

The build walks `homebrew/`, reads the file names, and adds each image to
`data/games.json` as `source: "bundled"`. It then shows up in the library, on
the home shelf, and in the **Nintendo 64** deck as "ready to play" - no import
dialog, no vault step, because the file is served from this origin.

## What the deck will do with it

| | |
| --- | --- |
| Media | cartridge - accepted extensions: `.n64`, `.z64`, `.v64`, `.ndd`, `.zip`, `.7z` |
| Core | `n64`; also selectable: `mupen64plus-next`, `parallel_n64` |
| Buttons | N64 Controller (3 grips) (NUS-005 - stick, C-buttons, Z, R) - 15 inputs |
| Other layouts | N64 + Rumble/Memory Pak, N64 + mouse pad region |
| Aspect | 4:3 - native 320x240 |
| Models | NUS-001 Nintendo 64, iQue Player (plug-and-play) |
| Skins | N64 Smoke Grey, Atomic Purple, Aftermarket · Translucent Purple |
| BIOS | Nintendo 64 IPL2 ROM - add it in **Cartridges ▸ BIOS images** or it will not boot |

## Naming

Use a readable name and keep the region in parentheses - the importer guesses
the title from the file name when the header has nothing useful:

```
my-game (USA).n64
```

Zip and 7z are fine where the table above lists them; the core unpacks them.

## Please

Only add software you wrote, or that the author released for redistribution.
RetroDeck ships no commercial ROMs and this folder is not an exception to that -
`npm run build` will happily index whatever is in here, so keep it legal.
