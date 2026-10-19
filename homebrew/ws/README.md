# Homebrew for WonderSwan / Color

Put **WonderSwan / Color** (`ws`) ROMs you are allowed to redistribute in this
folder, then run:

```sh
npm run build
```

The build walks `homebrew/`, reads the file names, and adds each image to
`data/games.json` as `source: "bundled"`. It then shows up in the library, on
the home shelf, and in the **WonderSwan / Color** deck as "ready to play" - no import
dialog, no vault step, because the file is served from this origin.

## What the deck will do with it

| | |
| --- | --- |
| Media | cartridge - accepted extensions: `.ws`, `.wsc`, `.pc2`, `.zip` |
| Core | `wonderswan`; also selectable: `mednafen_wswan` |
| Buttons | WonderSwan (landscape) (4 greys, X/Y left, A/B/C right - it rotates with you) - 11 inputs |
| Other layouts | WonderSwan (portrait) |
| Aspect | 224:152 - native 224x152 |
| Models | WonderSwan, WonderSwan Color, SwanCrystal (backlit WSC) |
| Skins | WonderSwan (Black), Aftermarket · Carbon Stealth |

## Naming

Use a readable name and keep the region in parentheses - the importer guesses
the title from the file name when the header has nothing useful:

```
my-game (USA).ws
```

Zip and 7z are fine where the table above lists them; the core unpacks them.

## Please

Only add software you wrote, or that the author released for redistribution.
RetroDeck ships no commercial ROMs and this folder is not an exception to that -
`npm run build` will happily index whatever is in here, so keep it legal.
