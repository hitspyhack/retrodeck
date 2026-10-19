# Homebrew for Arcade (MAME / FBNeo / Neo Geo)

Put **Arcade (MAME / FBNeo / Neo Geo)** (`arcade`) ROMs you are allowed to redistribute in this
folder, then run:

```sh
npm run build
```

The build walks `homebrew/`, reads the file names, and adds each image to
`data/games.json` as `source: "bundled"`. It then shows up in the library, on
the home shelf, and in the **Arcade (MAME / FBNeo / Neo Geo)** deck as "ready to play" - no import
dialog, no vault step, because the file is served from this origin.

## What the deck will do with it

| | |
| --- | --- |
| Media | arcade ROM - accepted extensions: `.zip`, `.7z`, `.fbneo`, `.chd`, `.rom` |
| Core | `fbneo`; also selectable: `mame2003_plus`, `mame2003`, `neogeo`, `genesis_plus_gx` |
| Buttons | Arcade 6-button (Vewlylick) (two rows of three - Street Fighter / KOF / GGXX) - 14 inputs |
| Other layouts | Arcade 4-button, Arcade 8-button, Neo Geo AES pad, Twin-stick (arcade), Trackball + buttons, Arcade light gun |
| Aspect | 4:3 - native 304x224 |
| Models | Neo Geo AES (gold cart), Neo Geo MVS cabinet, Upright JAMMA cabinet |
| Skins | Neo Geo AES, Aftermarket · Carbon Stealth |
| BIOS | Some boards need NVSRAM / decrypted sets - add it in **Cartridges ▸ BIOS images** or it will not boot |

## Naming

Use a readable name and keep the region in parentheses - the importer guesses
the title from the file name when the header has nothing useful:

```
my-game (USA).zip
```

Zip and 7z are fine where the table above lists them; the core unpacks them.

## Please

Only add software you wrote, or that the author released for redistribution.
RetroDeck ships no commercial ROMs and this folder is not an exception to that -
`npm run build` will happily index whatever is in here, so keep it legal.
