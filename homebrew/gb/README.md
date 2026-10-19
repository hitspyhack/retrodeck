# Homebrew for Game Boy

Put **Game Boy** (`gb`) ROMs you are allowed to redistribute in this
folder, then run:

```sh
npm run build
```

The build walks `homebrew/`, reads the file names, and adds each image to
`data/games.json` as `source: "bundled"`. It then shows up in the library, on
the home shelf, and in the **Game Boy** deck as "ready to play" - no import
dialog, no vault step, because the file is served from this origin.

## What the deck will do with it

| | |
| --- | --- |
| Media | cartridge - accepted extensions: `.gb`, `.dmg`, `.sgb`, `.sgb2`, `.zip`, `.7z` |
| Core | `gb` |
| Buttons | Game Boy (DMG-01) (diagonal A/B, 45°-tilted start/select) - 8 inputs |
| Other layouts | Game Boy Pocket, DMG with dot-matrix, GB (play-it-like-a-DMG) |
| Aspect | 10:9 - native 160x144 |
| Models | Game Boy DMG-01, Game Boy Pocket MGB-01, Game Boy Light MGB-05, Super Game Boy (SNES cart) |
| Skins | Game Boy Gray (DMG-01), Aftermarket · Recycled Board, Aftermarket · Neon Night, Aftermarket · Mint Cream |
| BIOS | DMG boot ROM (256 bytes) - add it in **Cartridges ▸ BIOS images** or it will not boot |
| Light | the DMG Light model has a front light; RetroDeck only draws it as a glow |

## Naming

Use a readable name and keep the region in parentheses - the importer guesses
the title from the file name when the header has nothing useful:

```
Polar Getaway (World).gb
```

Zip and 7z are fine where the table above lists them; the core unpacks them.

## Please

Only add software you wrote, or that the author released for redistribution.
RetroDeck ships no commercial ROMs and this folder is not an exception to that -
`npm run build` will happily index whatever is in here, so keep it legal.
