# Homebrew for Sega Dreamcast

Put **Sega Dreamcast** (`dreamcast`) ROMs you are allowed to redistribute in this
folder, then run:

```sh
npm run build
```

The build walks `homebrew/`, reads the file names, and adds each image to
`data/games.json` as `source: "bundled"`. It then shows up in the library, on
the home shelf, and in the **Sega Dreamcast** deck as "ready to play" - no import
dialog, no vault step, because the file is served from this origin.

## What the deck will do with it

| | |
| --- | --- |
| Media | disc image - accepted extensions: `.chd`, `.cue`, `.gdi`, `.bin`, `.iso`, `.cdi`, `.zip` |
| Core | `dreamcast` |
| Buttons | Dreamcast controller (chibi stick, four face buttons, analog L/R triggers) - 12 inputs |
| Other layouts | Visual Memory Unit (second screen), Dreamcast gun + stick, Dreamcast Fishing Rod |
| Aspect | 4:3 - native 640x480 |
| Models | Dreamcast HKT-1000 |
| Skins | Dreamcast (HKT-1000), Aftermarket · Carbon Stealth, Aftermarket · Translucent Purple |
| BIOS | dreamcast.bin + flash + osd (bootrom) - add it in **Cartridges ▸ BIOS images** or it will not boot |

## Naming

Use a readable name and keep the region in parentheses - the importer guesses
the title from the file name when the header has nothing useful:

```
my-game (USA).chd
```

Zip and 7z are fine where the table above lists them; the core unpacks them.

## Please

Only add software you wrote, or that the author released for redistribution.
RetroDeck ships no commercial ROMs and this folder is not an exception to that -
`npm run build` will happily index whatever is in here, so keep it legal.
