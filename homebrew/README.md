# homebrew/

Drop-in ROM folders, one per system RetroDeck knows (26 of them).

```sh
homebrew/
  nes/      <- .nes, .unf, .fds, zip
  snes/     <- .sfc, .smc, ...
  gb/       <- ...
  ...
```

`npm run build` indexes every image it finds here into `data/games.json` as
`source: "bundled"`. That is how a homebrew catalog ships *with* the site: the
files live on your server, the licence stays yours, and the app needs no import
step to play them.

Nothing in this repository is a ROM. Each sub-folder has a README listing the
extensions, the core, the controller layout and the models that console gets.

Legal line, unchanged from the front page: add only what you wrote or what the
author released for redistribution.
