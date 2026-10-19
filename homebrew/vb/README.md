# Homebrew for Virtual Boy

Put **Virtual Boy** (`vb`) ROMs you are allowed to redistribute in this
folder, then run:

```sh
npm run build
```

The build walks `homebrew/`, reads the file names, and adds each image to
`data/games.json` as `source: "bundled"`. It then shows up in the library, on
the home shelf, and in the **Virtual Boy** deck as "ready to play" - no import
dialog, no vault step, because the file is served from this origin.

## What the deck will do with it

| | |
| --- | --- |
| Media | cartridge - accepted extensions: `.vb`, `.vboy`, `.bin`, `.zip` |
| Core | `vb`; also selectable: `virtualboy` |
| Buttons | Virtual Boy (dual pad) (two D-pads, two sets of L/R - stereo is part of the hardware) - 10 inputs |
| Other layouts | Virtual Boy (single-thumb) |
| Aspect | 5:3 - native 384x224 |
| Models | Virtual Boy VBO-01 |
| Skins | Virtual Boy Carbon Red, Aftermarket · Carbon Stealth |

## Naming

Use a readable name and keep the region in parentheses - the importer guesses
the title from the file name when the header has nothing useful:

```
my-game (USA).vb
```

Zip and 7z are fine where the table above lists them; the core unpacks them.

## Please

Only add software you wrote, or that the author released for redistribution.
RetroDeck ships no commercial ROMs and this folder is not an exception to that -
`npm run build` will happily index whatever is in here, so keep it legal.
