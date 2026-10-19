# Homebrew for Super Nintendo / Super Famicom

Put **Super Nintendo / Super Famicom** (`snes`) ROMs you are allowed to redistribute in this
folder, then run:

```sh
npm run build
```

The build walks `homebrew/`, reads the file names, and adds each image to
`data/games.json` as `source: "bundled"`. It then shows up in the library, on
the home shelf, and in the **Super Nintendo / Super Famicom** deck as "ready to play" - no import
dialog, no vault step, because the file is served from this origin.

## What the deck will do with it

| | |
| --- | --- |
| Media | cartridge - accepted extensions: `.sfc`, `.smc`, `.fig`, `.swc`, `.bin`, `.zip`, `.7z` |
| Core | `snes` |
| Buttons | SNES Controller (SNS-005 - the four-face-button template) - 12 inputs |
| Other layouts | Super Famicom pad, SNES Mouse + D-pad, NES/SNES scope + D-pad |
| Aspect | 4:3 - native 256x224 |
| Models | SNS-001 Super Nintendo, SNS-101 Super Nintendo Jr, Super Famicom SHVC-001, SNES Classic Mini |
| Skins | SNS-001 Lavender/Grey, Aftermarket · Polar (SNES Jr), Aftermarket · Translucent Smoke |

## Naming

Use a readable name and keep the region in parentheses - the importer guesses
the title from the file name when the header has nothing useful:

```
my-game (USA).sfc
```

Zip and 7z are fine where the table above lists them; the core unpacks them.

## Please

Only add software you wrote, or that the author released for redistribution.
RetroDeck ships no commercial ROMs and this folder is not an exception to that -
`npm run build` will happily index whatever is in here, so keep it legal.
