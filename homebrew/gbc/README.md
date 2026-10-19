# Homebrew for Game Boy Color

Put **Game Boy Color** (`gbc`) ROMs you are allowed to redistribute in this
folder, then run:

```sh
npm run build
```

The build walks `homebrew/`, reads the file names, and adds each image to
`data/games.json` as `source: "bundled"`. It then shows up in the library, on
the home shelf, and in the **Game Boy Color** deck as "ready to play" - no import
dialog, no vault step, because the file is served from this origin.

## What the deck will do with it

| | |
| --- | --- |
| Media | cartridge - accepted extensions: `.gbc`, `.gb`, `.dmg`, `.zip`, `.7z` |
| Core | `gbc`; also selectable: `gambatte`, `sameboy` |
| Buttons | Game Boy Color (DMG shape + power button + A/B colour tabs) - 8 inputs |
| Other layouts | Game Boy Pocket |
| Aspect | 10:9 - native 160x144 |
| Models | Game Boy Color CGB-001 |
| Skins | GBC Atomic Purple, Aftermarket · Sunset Pop, Aftermarket · Mint Cream, Aftermarket · Translucent Purple |
| BIOS | CGB boot ROM (2304 bytes) - add it in **Cartridges ▸ BIOS images** or it will not boot |
| Sensor | this deck has a solar cell - a few games read it |

## Naming

Use a readable name and keep the region in parentheses - the importer guesses
the title from the file name when the header has nothing useful:

```
my-game (USA).gbc
```

Zip and 7z are fine where the table above lists them; the core unpacks them.

## Please

Only add software you wrote, or that the author released for redistribution.
RetroDeck ships no commercial ROMs and this folder is not an exception to that -
`npm run build` will happily index whatever is in here, so keep it legal.
