# Homebrew for MS-DOS / ScummVM

Put **MS-DOS / ScummVM** (`dos`) ROMs you are allowed to redistribute in this
folder, then run:

```sh
npm run build
```

The build walks `homebrew/`, reads the file names, and adds each image to
`data/games.json` as `source: "bundled"`. It then shows up in the library, on
the home shelf, and in the **MS-DOS / ScummVM** deck as "ready to play" - no import
dialog, no vault step, because the file is served from this origin.

## What the deck will do with it

| | |
| --- | --- |
| Media | game folder or DOSBox config - accepted extensions: `.dosbox`, `.conf`, `.zip`, `.exe`, `.scummvm`, `.svm` |
| Core | `dos`; also selectable: `vapor/8x8`, `scummvm` |
| Buttons | DOS keyboard + mouse (arrow keys, Enter, Esc, Space, right-click for menus) - 7 inputs |
| Other layouts | DOS keyboard only, ScummVM pointer only |
| Aspect | 4:3 - native 320x200 |
| Models | 486DX2 tower + CRT, Point & Click rig (ScummVM) |
| Skins | IBM AT / 486DX2 tower, Aftermarket · Carbon Stealth |

## Naming

Use a readable name and keep the region in parentheses - the importer guesses
the title from the file name when the header has nothing useful:

```
my-adventure.dosbox.conf
```

Zip and 7z are fine where the table above lists them; the core unpacks them.

## Please

Only add software you wrote, or that the author released for redistribution.
RetroDeck ships no commercial ROMs and this folder is not an exception to that -
`npm run build` will happily index whatever is in here, so keep it legal.
