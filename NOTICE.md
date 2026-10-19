# RetroDeck — legal notice (read this first)

## What this project is

RetroDeck is an **open-source front-end** for browser-based retro emulation. It
provides:

- the emulator runtime integration ([EmulatorJS](https://emulatorjs.org) /
  RetroArch WASM cores, MIT-licensed, loaded from their CDN or self-hosted by
  you),
- accurate **console model definitions**: shells, bezels, aspect ratios, screen
  palettes, CRT shaders,
- **per-console controllers** (NES D-pad, SNES 4+4, GB A/B diagonal, N64 analog +
  C-stick, PS1 dual sticks, 6-button MD pads, arcade sticks), plus skins and
  key/touch remapping,
- a **ROM manager**: you import your own files, they stay in *your* browser
  (IndexedDB) and are never uploaded anywhere,
- save states, SRAM, screenshots, rewind, cheats, per-game configuration,
- and **six original playable games** written for this project (in `js/games/`),
  which are the only playable content included in the repository.

## What this project deliberately does not contain

**It contains no ROMs, no BIOS images and no disc images. It never will.**

The game library index (`data/games.json`) is *metadata only* — title, year,
genre, system. Those names are used descriptively, the same way a Wikipedia
list or a shelf of plastic cases would. Playing *Sonic the Hedgehog*,
*Super Mario Bros.*, *Pokémon Emerald*, *Pac-Man* or *Bomberman* on RetroDeck
means pointing the front-end at **a copy of a cartridge you physically own**
(or a freely licensed homebrew / public-domain ROM).

Why:

- Copying and distributing commercial ROMs is copyright infringement almost
  everywhere, whether or not money changes hands. Hosting a `roms/` folder for a
  public website is the one part of emulation that reliably gets people sued or
  taken down by DMCA.
- Console BIOS images (PS1 `scph1001.bin`, DS, Saturn, Neo Geo) are
  copyrighted firmware. The only lawful source is dumping your own hardware.
- Emulators and cores themselves are legal — that's why they exist in every
  Linux distro.

Practical rule RetroDeck follows: **hardware emulation + your own software
backups = fine; us shipping somebody's game catalog = not fine.** So the deck
arrives empty and every "Play" button on a catalog card says *"supply your own
cartridge"*.

## Homebrew & public domain

The `homebrew/` folder is where freely licensed ROMs *are* allowed to live and
be shipped: anything explicitly released into the public domain or under a
permissive license by its author (e.g. many itch.io / `pouet.net` demo entries,
`2048-GBC`, `Micro Mess`, `SEIVER`-style GD dev carts, etc.). Drop the file in
`homebrew/<system>/` and `npm run build` will index it as
`source: "bundled"`, which flips its card from *supply your own* to
*play now*.

Also note: `js/games/` — *Maze Chomp*, *Blastr Zone*, *Blitz Hog*,
*Brick Storm*, *Stack Drop*, *Star Lancer* — are **original games in the
tradition of** those classics, written from scratch for this project (MIT).
They are homages, not copies: no Nintendo/Sega/Namsoft/Blast Processing
characters, sprites, music or level data are used, and none of them reuse
protected assets. They run instantly, offline, on a phone.

## Trademarks

NES, Famicom, Super Nintendo, Game Boy, Game Boy Advance, Nintendo 64,
PlayStation, Mega Drive, Genesis, Game Gear, Master System, Saturn, Dreamcast,
Neo Geo, TurboGrafx, PC Engine, WonderSwan, Atari 2600, Pac-Man, Sonic,
Mario and Pokémon are trademarks of their respective owners. RetroDeck is not
affiliated with, endorsed by, or sponsored by any of them, and uses the names
only to describe which hardware it emulates.

## Your responsibility

By running RetroDeck you agree that you have the legal right to make and use the
backups you load, and that you are responsible for everything you put in it.
