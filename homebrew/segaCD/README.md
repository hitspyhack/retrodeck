# Homebrew for Sega CD / Mega CD

Put **Sega CD / Mega CD** (`segaCD`) ROMs you are allowed to redistribute in this
folder, then run:

```sh
npm run build
```

The build walks `homebrew/`, reads the file names, and adds each image to
`data/games.json` as `source: "bundled"`. It then shows up in the library, on
the home shelf, and in the **Sega CD / Mega CD** deck as "ready to play" - no import
dialog, no vault step, because the file is served from this origin.

## What the deck will do with it

| | |
| --- | --- |
| Media | disc image - accepted extensions: `.chd`, `.cue`, `.bin`, `.iso`, `.md`, `.smd`, `.zip` |
| Core | `segaCD` |
| Buttons | Mega Drive 2 / Genesis 2 (3-button) (cheaper membrane pad, same layout) - 8 inputs |
| Other layouts | Mega Drive 6-button (FA-301), Mega-CD CD Remote (6 buttons) |
| Aspect | 4:3 - native 320x224 |
| Models | Mega CD 1 / Sega CD 1, Mega CD 2 (VA2) |
| Skins | Mega Drive HGC-3000 (Japan), Genesis Model 1 (Mk I) |
| BIOS | Sega CD BIOS (us_europe/jp, ~1MB) - add it in **Cartridges ▸ BIOS images** or it will not boot |

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
