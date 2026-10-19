# Homebrew for Homebrew & Public Domain

Put **Homebrew & Public Domain** (`homebrew`) ROMs you are allowed to redistribute in this
folder, then run:

```sh
npm run build
```

The build walks `homebrew/`, reads the file names, and adds each image to
`data/games.json` as `source: "bundled"`. It then shows up in the library, on
the home shelf, and in the **Homebrew & Public Domain** deck as "ready to play" - no import
dialog, no vault step, because the file is served from this origin.

## What the deck will do with it

| | |
| --- | --- |
| Media | cartridge - accepted extensions: `.nes`, `.sfc`, `.gb`, `.gbc`, `.gba`, `.md`, `.sms`, `.gg`, `.pce`, `.a26`, `.lnx`, `.ngp`, `.ws`, `.zip` |
| Core | `auto` - chosen from the file's extension; also selectable: `nes`, `snes`, `gb`, `gbc`, `gba`, `n64`, `segaMD`, `segaMS`, `segaGG`, `segaSaturn`, `pce_fast`, `atari2600`, `atari7800`, `ngp`, `wonderswan`, `fbneo` |
| Buttons | SNES Controller (SNS-005 - the four-face-button template) - 8 inputs |
| Other layouts | NES Control Deck, Game Boy (DMG-01), Game Boy Advance, Mega Drive 3-button (VA1/2), PC Engine Core Pad |
| Aspect | 4:3 - native 256x224 |
| Models | generic |
| Skins | default |

## Naming

Use a readable name and keep the region in parentheses - the importer guesses
the title from the file name when the header has nothing useful:

```
my-game (USA).nes
```

Zip and 7z are fine where the table above lists them; the core unpacks them.

## Please

Only add software you wrote, or that the author released for redistribution.
RetroDeck ships no commercial ROMs and this folder is not an exception to that -
`npm run build` will happily index whatever is in here, so keep it legal.
