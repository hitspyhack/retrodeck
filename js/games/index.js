/**
 * Built-in game registry.
 *
 * These six titles ship inside RetroDeck, so they are playable with no ROM
 * files at all - which is the honest answer to "make a website where hundreds
 * of retro games are playable on a phone": the front end, pads, skins and
 * emulator run everywhere, the commercial cartridges you legally own are
 * supplied by the player, and these originals prove the whole chain works
 * offline with zero network requests.
 *
 * Each entry mirrors the shape of a catalog record from js/data/games.generated.js
 * so the library UI can show built-ins and metadata cards identically.
 */
import { Chomp, Bricks } from "./arcade.js";
import { Stack, Blastr } from "./puzzle.js";
import { Blitz, Lancer } from "./action.js";

const INSPIRED_BY = {
  chomp: "maze-chase cabinets, 1980 - own maze generator, own sprites",
  blastr: "grid bombers, 1985 - own level generator",
  blitz: "momentum platformers, 1991 - own heightmap zones",
  bricks: "wall breakers, 1984/86 - own wall patterns",
  stack: "falling-block puzzlers, 1984/89 - own scoring and piece art",
  lancer: "vertical shooters, 1979-1985 - own waves and boss patterns",
};

/** @type {Array<object>} ordered for the "Start playing" shelf */
export const GAMES = [
  { ...meta(Chomp), engine: Chomp },
  { ...meta(Blastr), engine: Blastr },
  { ...meta(Blitz), engine: Blitz },
  { ...meta(Bricks), engine: Bricks },
  { ...meta(Stack), engine: Stack },
  { ...meta(Lancer), engine: Lancer },
];

/**
 * Flatten the engine definition into a catalog-shaped record so the library can
 * render built-ins and metadata-only entries with the same card component.
 */
function meta(g) {
  return {
    id: `builtin:${g.id}`,
    slug: g.id,
    builtin: g.id,
    system: g.system,
    title: g.title,
    year: g.year,
    genre: g.genre,
    genreSlug: String(g.genre || "").toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    players: 1,
    rating: null,
    source: "bundled",
    note: g.blurb,
    blurb: g.blurb,
    howto: g.howto,
    pad: g.pad,
    w: g.w,
    h: g.h,
    inspiredBy: INSPIRED_BY[g.id] || "the genre, not a specific cartridge",
  };
}

export const GAME_BY_ID = new Map(GAMES.map((g) => [g.id, g]));

/** Look up a playable built-in from either "chomp" or "builtin:chomp". */
export function gameFor(ref) {
  if (!ref) return null;
  const id = String(ref).startsWith("builtin:") ? ref : `builtin:${ref}`;
  const rec = GAME_BY_ID.get(id);
  return rec ? rec.engine : null;
}

/** True when the file name we were handed matches a built-in's slug. */
export function builtinForFile(name) {
  const base = String(name || "").replace(/\.[^.]+$/, "").toLowerCase();
  return GAMES.find((g) => g.slug === base || g.title.toLowerCase().replace(/[^a-z]/g, "") === base.replace(/[^a-z]/g, "")) || null;
}
