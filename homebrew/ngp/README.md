# Homebrew for Neo Geo Pocket / Pocket Color

Put **Neo Geo Pocket / Pocket Color** (`ngp`) ROMs you are allowed to redistribute in this
folder, then run:

```sh
npm run build
```

The build walks `homebrew/`, reads the file names, and adds each image to
`data/games.json` as `source: "bundled"`. It then shows up in the library, on
the home shelf, and in the **Neo Geo Pocket / Pocket Color** deck as "ready to play" - no import
dialog, no vault step, because the file is served from this origin.

## What the deck will do with it

| | |
| --- | --- |
| Media | cartridge - accepted extensions: `.ngp`, `.ngc`, `.zip`, `.vsr` |
| Core | `ngp` |
| Buttons | Neo Geo Pocket Color (the good stick - 8-way, plus A/B and Option) - 7 inputs |
| Other layouts | NGPC + Quick Shot buttons |
| Aspect | 1:1 - native 160x152 |
| Models | Neo Geo Pocket Color |
| Skins | Neo Geo Pocket Color (Red), Aftermarket · Wave White, Aftermarket · Translucent Purple |

## Naming

Use a readable name and keep the region in parentheses - the importer guesses
the title from the file name when the header has nothing useful:

```
my-game (USA).ngp
```

Zip and 7z are fine where the table above lists them; the core unpacks them.

## Please

Only add software you wrote, or that the author released for redistribution.
RetroDeck ships no commercial ROMs and this folder is not an exception to that -
`npm run build` will happily index whatever is in here, so keep it legal.
