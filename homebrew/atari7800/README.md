# Homebrew for Atari 7800 / Lynx

Put **Atari 7800 / Lynx** (`atari7800`) ROMs you are allowed to redistribute in this
folder, then run:

```sh
npm run build
```

The build walks `homebrew/`, reads the file names, and adds each image to
`data/games.json` as `source: "bundled"`. It then shows up in the library, on
the home shelf, and in the **Atari 7800 / Lynx** deck as "ready to play" - no import
dialog, no vault step, because the file is served from this origin.

## What the deck will do with it

| | |
| --- | --- |
| Media | cartridge - accepted extensions: `.a78`, `.lnx`, `.zip`, `.bin` |
| Core | `atari7800`; also selectable: `atari2600`, `lynx` |
| Buttons | Atari CX40 joystick + console switches (1 stick, 1 fire, left/right difficulty, reset & select) - 7 inputs |
| Other layouts | 7800 ProJoystick, Atari Lynx |
| Aspect | 4:3 - native 160x192 |
| Models | Atari Lynx I |
| Skins | Atari Lynx I, Aftermarket · Translucent Smoke |

## Naming

Use a readable name and keep the region in parentheses - the importer guesses
the title from the file name when the header has nothing useful:

```
my-game (USA).a78
```

Zip and 7z are fine where the table above lists them; the core unpacks them.

## Please

Only add software you wrote, or that the author released for redistribution.
RetroDeck ships no commercial ROMs and this folder is not an exception to that -
`npm run build` will happily index whatever is in here, so keep it legal.
