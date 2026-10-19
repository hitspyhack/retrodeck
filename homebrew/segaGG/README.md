# Homebrew for Sega Game Gear

Put **Sega Game Gear** (`segaGG`) ROMs you are allowed to redistribute in this
folder, then run:

```sh
npm run build
```

The build walks `homebrew/`, reads the file names, and adds each image to
`data/games.json` as `source: "bundled"`. It then shows up in the library, on
the home shelf, and in the **Sega Game Gear** deck as "ready to play" - no import
dialog, no vault step, because the file is served from this origin.

## What the deck will do with it

| | |
| --- | --- |
| Media | cartridge - accepted extensions: `.gg`, `.zip`, `.7z` |
| Core | `segaGG`; also selectable: `genesis_plus_gx`, `picodrive` |
| Buttons | Game Gear (handheld SMS: start button under screen, colour filter) - 7 inputs |
| Other layouts | Game Gear + TV tuner |
| Aspect | 5:4 - native 160x144 |
| Models | Game Gear MK-2100 |
| Skins | Game Gear (MK-2100), Game Gear Ocean Blue, Aftermarket · Translucent Purple, Aftermarket · Neon Night |

## Naming

Use a readable name and keep the region in parentheses - the importer guesses
the title from the file name when the header has nothing useful:

```
my-game (USA).gg
```

Zip and 7z are fine where the table above lists them; the core unpacks them.

## Please

Only add software you wrote, or that the author released for redistribution.
RetroDeck ships no commercial ROMs and this folder is not an exception to that -
`npm run build` will happily index whatever is in here, so keep it legal.
