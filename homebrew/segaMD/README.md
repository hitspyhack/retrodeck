# Homebrew for Sega Mega Drive / Genesis

Put **Sega Mega Drive / Genesis** (`segaMD`) ROMs you are allowed to redistribute in this
folder, then run:

```sh
npm run build
```

The build walks `homebrew/`, reads the file names, and adds each image to
`data/games.json` as `source: "bundled"`. It then shows up in the library, on
the home shelf, and in the **Sega Mega Drive / Genesis** deck as "ready to play" - no import
dialog, no vault step, because the file is served from this origin.

## What the deck will do with it

| | |
| --- | --- |
| Media | cartridge - accepted extensions: `.md`, `.gen`, `.smd`, `.bin`, `.zip`, `.7z` |
| Core | `segaMD`; also selectable: `genesis_plus_gx`, `picodrive`, `blastem` |
| Buttons | Mega Drive 3-button (VA1/2) (the round D-pad + three red buttons at 20°) - 12 inputs |
| Other layouts | Mega Drive 2 / Genesis 2 (3-button), Mega Drive 6-button (FA-301), 6-button (staggered / XInput order), Sega Menacer (light gun), Sega Mouse + D-pad, Sega Power Base Follower (auto-fire) |
| Aspect | 4:3 - native 320x224 |
| Models | Mega Drive HGC-3000 (JP), Genesis Model 1 (MK-1600), Mega Drive 2 (VA4-1993), Genesis 2 (MK-1631), Sega Nomad (portable MD2) |
| Skins | Mega Drive HGC-3000 (Japan), Aftermarket · Sega R (blue stripe), Aftermarket · Carbon Stealth |

## Naming

Use a readable name and keep the region in parentheses - the importer guesses
the title from the file name when the header has nothing useful:

```
my-game (USA).md
```

Zip and 7z are fine where the table above lists them; the core unpacks them.

## Please

Only add software you wrote, or that the author released for redistribution.
RetroDeck ships no commercial ROMs and this folder is not an exception to that -
`npm run build` will happily index whatever is in here, so keep it legal.
