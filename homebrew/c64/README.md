# Homebrew for Commodore 64 / VIC-20

Put **Commodore 64 / VIC-20** (`c64`) ROMs you are allowed to redistribute in this
folder, then run:

```sh
npm run build
```

The build walks `homebrew/`, reads the file names, and adds each image to
`data/games.json` as `source: "bundled"`. It then shows up in the library, on
the home shelf, and in the **Commodore 64 / VIC-20** deck as "ready to play" - no import
dialog, no vault step, because the file is served from this origin.

## What the deck will do with it

| | |
| --- | --- |
| Media | disk or tape - accepted extensions: `.d64`, `.t64`, `.g64`, `.prg`, `.p00`, `.tap`, `.crt`, `.d71`, `.d81`, `.zip` |
| Core | `c64`; also selectable: `vice_x64`, `vice_x128`, `vice_xvic` |
| Buttons | DB9 joystick + keyboard (for C64: LOAD"*",8,1 needs letters and Return) - 6 inputs |
| Other layouts | C64 keyboard only, Joystick + key row |
| Aspect | 4:3 - native 320x200 |
| Models | Commodore 64 (250425), VIC-20 |
| Skins | Commodore 64 (breadbin), Aftermarket · Recycled Board, Aftermarket · Carbon Stealth |
| BIOS | Kernal/CHAR/Basic ROMs (VICE provides these) - add it in **Cartridges ▸ BIOS images** or it will not boot |

## Naming

Use a readable name and keep the region in parentheses - the importer guesses
the title from the file name when the header has nothing useful:

```
my-game (USA).d64
```

Zip and 7z are fine where the table above lists them; the core unpacks them.

## Please

Only add software you wrote, or that the author released for redistribution.
RetroDeck ships no commercial ROMs and this folder is not an exception to that -
`npm run build` will happily index whatever is in here, so keep it legal.
