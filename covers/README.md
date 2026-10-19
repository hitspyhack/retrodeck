# covers - real box art, from you

Everything in this tree is optional. RetroDeck draws a generated cover for each
title (deterministic per title, `js/core/cover.js`) because the repository ships
no game artwork and links to none: box art is somebody else's copyright, and
hot-linking somebody's image host would also break the offline promise.

So real images come from one of two places:

## 1. Per device, no rebuild

Open a game card, press **Add artwork**, pick an image. It is resized to at most
560 px on the long edge, encoded (JPEG, or PNG when the source has alpha) and
stored in IndexedDB next to your save states. It renders offline, forever, and
never leaves the device. **Replace artwork** swaps it, **Remove** puts the
generated cover back.

## 2. Per build, for art you may ship

Drop a file here named after the game, then rebuild:

```
covers/<system>/<title-slug>.png
npm run build
```

`npm run build` walks `covers/<system>/`, slugifies each file name and attaches
the path to the catalogue row with that id, as `cover`. Every card, sheet and
shelf then shows the real image - and a file whose name matches no title is
reported as a note, not silently ignored.

The game's sheet prints the exact path it is looking for (*Artwork → Or serve it
from this origin*), so you never have to derive a slug by hand. Examples:

| title | file |
| --- | --- |
| Super Mario Bros. (NES) | `covers/nes/super-mario-bros.png` |
| Tetris (Game Boy) | `covers/gb/tetris.jpg` |
| Sonic the Hedgehog (Mega Drive) | `covers/segaMD/sonic-the-hedgehog.webp` |

Accepted: `.png .jpg .jpeg .webp .avif .gif .svg`. Any aspect ratio works - cards
crop to 3:4, the detail sheet to 4:5 - but a scan of a real box or a 3:4 poster
looks right without cropping. A file that goes missing later is not an error: the
card notices the failed load and draws the generated cover instead.

## In git

`covers/**/*.{png,jpg,jpeg,webp,avif,gif,svg}` is git-ignored, by design and for
the same reason ROMs are: it is other people's artwork. If the image is yours -
homebrew you made, art you drew - `git add -f` it and it will ship with the site.

## Public-domain art

For homebrew titles whose own licence covers the artwork too, this folder is the
right answer; the same licence note as the file itself belongs in the commit that
adds it.
