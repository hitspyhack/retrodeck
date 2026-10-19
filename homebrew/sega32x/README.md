# Homebrew for Sega 32X

Put **Sega 32X** (`sega32x`) ROMs you are allowed to redistribute in this
folder, then run:

```sh
npm run build
```

The build walks `homebrew/`, reads the file names, and adds each image to
`data/games.json` as `source: "bundled"`. It then shows up in the library, on
the home shelf, and in the **Sega 32X** deck as "ready to play" - no import
dialog, no vault step, because the file is served from this origin.

## What the deck will do with it

| | |
| --- | --- |
| Media | cartridge - accepted extensions: `.32x`, `.bin`, `.smd`, `.zip` |
| Core | `sega32x` |
| Buttons | Mega Drive 3-button (VA1/2) (the round D-pad + three red buttons at 20°) - 7 inputs |
| Other layouts | Mega Drive 6-button (FA-301) |
| Aspect | 4:3 - native 320x224 |
| Models | 32X (TMS-1000) |
| Skins | N64 Smoke Grey, Aftermarket · Carbon Stealth |
| BIOS | Mega Drive + 32X BIOS (for CD hybrid) - add it in **Cartridges ▸ BIOS images** or it will not boot |

## Naming

Use a readable name and keep the region in parentheses - the importer guesses
the title from the file name when the header has nothing useful:

```
my-game (USA).32x
```

Zip and 7z are fine where the table above lists them; the core unpacks them.

## Please

Only add software you wrote, or that the author released for redistribution.
RetroDeck ships no commercial ROMs and this folder is not an exception to that -
`npm run build` will happily index whatever is in here, so keep it legal.
