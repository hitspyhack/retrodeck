# Homebrew for Sega Master System

Put **Sega Master System** (`segaMS`) ROMs you are allowed to redistribute in this
folder, then run:

```sh
npm run build
```

The build walks `homebrew/`, reads the file names, and adds each image to
`data/games.json` as `source: "bundled"`. It then shows up in the library, on
the home shelf, and in the **Sega Master System** deck as "ready to play" - no import
dialog, no vault step, because the file is served from this origin.

## What the deck will do with it

| | |
| --- | --- |
| Media | cartridge - accepted extensions: `.sms`, `.zip`, `.7z` |
| Core | `segaMS`; also selectable: `genesis_plus_gx`, `picodrive`, `mastersystem` |
| Buttons | Master System pad (two buttons + console PAUSE switch) - 7 inputs |
| Other layouts | SMS Light Phaser + paddle |
| Aspect | 4:3 - native 256x192 |
| Models | Master System II (FG-3715) |
| Skins | Master System II, Aftermarket · Recycled Board |

## Naming

Use a readable name and keep the region in parentheses - the importer guesses
the title from the file name when the header has nothing useful:

```
my-game (USA).sms
```

Zip and 7z are fine where the table above lists them; the core unpacks them.

## Please

Only add software you wrote, or that the author released for redistribution.
RetroDeck ships no commercial ROMs and this folder is not an exception to that -
`npm run build` will happily index whatever is in here, so keep it legal.
