/**
 * RetroDeck - procedural box art.
 *
 * We ship no game artwork (that is somebody else's copyright), so every cover
 * in the library is generated: deterministic per title, drawn as inline SVG so
 * it works with zero network requests and stays crisp on a phone.
 *
 * Three styles, selectable in Settings:
 *   pixel  - 16x24 block mosaic with a title band (default, looks like a shelf)
 *   flat   - modern flat poster: big initials + geometry
 *   label  - cartridge-label look: system stripe, serial, barcode-ish
 */

import { fnv1a } from "./detect.js";

const PALETTES = [
  ["#0b1020", "#18306b", "#2f8fb0", "#ffe066", "#ff5f6d"],
  ["#141312", "#3b2f2f", "#d6a15a", "#f4e9d8", "#a8322d"],
  ["#0f1416", "#1d3a3a", "#7ad0a8", "#e8f7ff", "#ff9e6d"],
  ["#160f1e", "#40206b", "#a26bff", "#ffd6ff", "#6bffb8"],
  ["#101010", "#2b3440", "#8bac0f", "#e8f2c8", "#c81d25"],
  ["#0d0d14", "#232a4d", "#4f9dff", "#cfe2ff", "#ff4fa0"],
  ["#12100c", "#3d3218", "#d8c14a", "#f5efdc", "#6f8f3f"],
  ["#0b0f0d", "#1f3a2e", "#2fa04f", "#d8f0dc", "#e0a020"],
  ["#120b10", "#40122a", "#e0203a", "#ffd9d0", "#f0a202"],
  ["#0a0e14", "#1b2a4a", "#3b7fd4", "#e6f0ff", "#8fa0c0"],
];

const MOTIF = {
  nes: ["stripes", "grid", "blocks"],
  snes: ["arc", "grid", "diamond"],
  n64: ["poly", "blob", "arc"],
  gb: ["dot-matrix", "grid", "blocks"],
  gbc: ["dot-matrix", "blocks", "arc"],
  gba: ["stripes", "poly", "dot-matrix"],
  nds: ["grid", "poly", "arc"],
  vb: ["grid", "lines", "poly"],
  segaMS: ["grid", "stripes", "blocks"],
  segaGG: ["dot-matrix", "blocks", "grid"],
  segaMD: ["arc", "stripes", "poly"],
  segaCD: ["arc", "lines", "poly"],
  sega32x: ["poly", "lines", "grid"],
  segaSaturn: ["poly", "arc", "lines"],
  dreamcast: ["swirl", "arc", "poly"],
  psx: ["poly", "blob", "grid"],
  psp: ["lines", "stripes", "grid"],
  pce: ["blocks", "grid", "diamond"],
  arcade: ["scanlines", "grid", "blocks"],
  atari2600: ["blocks", "lines", "stripes"],
  atari7800: ["blocks", "grid", "lines"],
  ngp: ["diamond", "blocks", "grid"],
  ws: ["blocks", "dot-matrix", "lines"],
  c64: ["grid", "blocks", "lines"],
  dos: ["grid", "lines", "blocks"],
  homebrew: ["blocks", "poly", "grid"],
};

const SYSTEM_COLOR = {
  nes: "#c81d25", snes: "#5b5bd6", n64: "#1a7f37", gb: "#8bac0f", gbc: "#e8582a",
  gba: "#6a4fb4", nds: "#2f9ed6", vb: "#b8342a", segaMS: "#1b4ea8", segaGG: "#d1113a",
  segaMD: "#0f1116", segaCD: "#3d2b7a", sega32x: "#5f6f7a", segaSaturn: "#9aa0b0",
  dreamcast: "#33c96e", psx: "#4f9dc0", psp: "#4f74c9", pce: "#d94f9c",
  arcade: "#f0a202", atari2600: "#c9a15a", atari7800: "#4c9a4a", ngp: "#ff5b48",
  ws: "#e91e63", c64: "#4a3a7a", dos: "#00a6a0", homebrew: "#7ed321", unknown: "#5a6270",
};

export function systemColor(sys) {
  return SYSTEM_COLOR[sys] || SYSTEM_COLOR.unknown;
}

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function initials(title) {
  const words = title.replace(/[^A-Za-z0-9 :!'&]+/g, " ").split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words.slice(0, 2).map((w) => w[0]).join("").toUpperCase() + (words[2]?.[0]?.toUpperCase() || "");
}

/** Deterministic 16x24 pixel mosaic. */
function pixelArt(r, pal, cols = 16, rows = 24) {
  const cells = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < Math.ceil(cols / 2); x++) {
      const v = r();
      if (v < 0.44) continue;
      const color = pal[1 + Math.floor(r() * (pal.length - 2)) % (pal.length - 1)];
      const w = 100 / cols;
      const h = 100 / rows;
      cells.push(`<rect x="${(x * w).toFixed(2)}" y="${(y * h).toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" fill="${color}"/>`);
      const mirror = cols - 1 - x;
      if (mirror !== x)
        cells.push(`<rect x="${(mirror * w).toFixed(2)}" y="${(y * h).toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" fill="${color}"/>`);
    }
  }
  return cells.join("");
}

function motifLayer(kind, r, pal, uid) {
  switch (kind) {
    case "grid":
      return `<g stroke="${pal[1]}" stroke-width="0.35" opacity="0.5">` +
        Array.from({ length: 11 }, (_, i) => `<line x1="0" y1="${i * 10}" x2="100" y2="${i * 10}"/>`).join("") +
        Array.from({ length: 11 }, (_, i) => `<line x1="${i * 10}" y1="0" x2="${i * 10}" y2="100"/>`).join("") +
        `</g>`;
    case "stripes":
      return `<g opacity="0.55">` +
        Array.from({ length: 6 }, (_, i) => `<rect x="0" y="${8 + i * 16}" width="100" height="${2 + r() * 6}" fill="${pal[1]}"/>`).join("") +
        `</g>`;
    case "dot-matrix":
      return `<g fill="${pal[1]}" opacity="0.55">` +
        Array.from({ length: 20 }, (_, y) =>
          Array.from({ length: 20 }, (_, x) => `<circle cx="${2.5 + x * 5}" cy="${2.5 + y * 5}" r="0.85"/>`).join("")
        ).join("") +
        `</g>`;
    case "scanlines":
      return `<g fill="#000" opacity="0.30">` +
        Array.from({ length: 50 }, (_, i) => `<rect x="0" y="${i * 2}" width="100" height="1"/>`).join("") +
        `</g>`;
    case "arc":
      return `<g fill="none" stroke="${pal[2]}" stroke-width="1.1" opacity="0.75">` +
        Array.from({ length: 5 }, (_, i) => `<circle cx="50" cy="118" r="${34 + i * 15}"/>`).join("") +
        `</g>`;
    case "poly":
      return `<g opacity="0.8">` +
        Array.from({ length: 7 }, () => {
          const x = r() * 100, y = r() * 100, s = 8 + r() * 22;
          const pts = Array.from({ length: 3 + Math.floor(r() * 3) }, (_, k, n) => {
            const a = (k / 3) * Math.PI * 2 + r();
            return `${(x + Math.cos(a) * s).toFixed(1)},${(y + Math.sin(a) * s).toFixed(1)}`;
          }).join(" ");
          return `<polygon points="${pts}" fill="${pal[1 + Math.floor(r() * 3)]}" opacity="${0.25 + r() * 0.4}"/>`;
        }).join("") +
        `</g>`;
    case "blocks":
      return `<g>` +
        Array.from({ length: 9 }, () => {
          const w = 8 + r() * 30, h = 4 + r() * 14;
          return `<rect x="${r() * (100 - w)}" y="${r() * (100 - h)}" width="${w}" height="${h}" fill="${pal[2]}" opacity="${0.15 + r() * 0.5}" rx="${r() * 3}"/>`;
        }).join("") +
        `</g>`;
    case "diamond":
      return `<g fill="${pal[2]}" opacity="0.6">` +
        Array.from({ length: 12 }, () => {
          const x = r() * 100, y = r() * 100, s = 3 + r() * 9;
          return `<path d="M${x} ${y - s}L${x + s} ${y}L${x} ${y + s}L${x - s} ${y}Z"/>`;
        }).join("") +
        `</g>`;
    case "swirl":
      return `<g fill="none" stroke="${pal[2]}" stroke-width="2" opacity="0.55"><path d="M50 50 m-30 0 a30 30 0 1 1 60 0 a22 22 0 1 1 -44 0 a14 14 0 1 1 28 0"/></g>`;
    case "blob":
      return `<g opacity="0.5"><ellipse cx="${30 + r() * 40}" cy="${40 + r() * 30}" rx="${22 + r() * 24}" ry="${16 + r() * 20}" fill="${pal[3]}"/></g>`;
    case "lines":
      return `<g stroke="${pal[2]}" stroke-width="0.7" opacity="0.6" transform="rotate(${-30 + r() * 60} 50 50)">` +
        Array.from({ length: 14 }, (_, i) => `<line x1="-20" y1="${i * 9}" x2="120" y2="${i * 9}"/>`).join("") +
        `</g>`;
    default:
      return "";
  }
}

/**
 * @returns {string} inline SVG markup (no external refs) sized 3:4 by default.
 */
export function coverSVG(game, { style = "pixel", w = 120, h = 160 } = {}) {
  const seed = fnv1a(new TextEncoder().encode(game.id || game.title), 8);
  const r = rng(parseInt(seed, 16));
  const pal = PALETTES[Math.floor(r() * PALETTES.length)];
  const motifs = MOTIF[game.system] || MOTIF.arcade;
  const motif = motifs[Math.floor(r() * motifs.length)];
  const title = (game.title || "Untitled").toUpperCase();
  const abbr = initials(game.title || "");
  const band = 34 + Math.floor(r() * 8);
  const id = `c${seed}`;
  const accent = systemColor(game.system);

  if (style === "label") {
    return `<svg viewBox="0 0 120 160" width="${w}" height="${h}" role="img" aria-label="${esc(game.title)} cover" xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${pal[0]}"/><stop offset="1" stop-color="${pal[1]}"/></linearGradient></defs>
      <rect width="120" height="160" rx="6" fill="url(#${id})"/>
      <rect x="0" y="0" width="120" height="18" fill="${accent}"/>
      <text x="6" y="13" font-size="9" fill="#000" opacity="0.85" font-family="monospace">${esc((game.system || "").toUpperCase())}</text>
      <text x="114" y="13" text-anchor="end" font-size="7" fill="#000" opacity="0.7" font-family="monospace">${game.year || ""}</text>
      <g transform="translate(8 30)"><rect width="104" height="60" rx="3" fill="${pal[2]}" opacity="0.20"/>${motifLayer(motif, r, pal, id)}</g>
      <text x="8" y="106" font-size="11" font-family="ui-sans-serif,system-ui" fill="${pal[3]}" font-weight="700">${esc(title.slice(0, 20))}</text>
      <text x="8" y="118" font-size="8" font-family="ui-sans-serif,system-ui" fill="${pal[4]}" opacity="0.85">${esc(title.slice(20, 44))}</text>
      <g font-family="monospace" font-size="6" fill="${pal[3]}" opacity="0.75">
        <text x="8" y="136">${esc(game.serial || `${abbr}-${String(game.year || 0).slice(2)}`)}</text>
        <text x="8" y="150">${"▮▏▎▍▌▐▕".repeat(6)}</text>
      </g>
      <rect x="0" y="152" width="120" height="8" fill="${accent}" opacity="0.9"/>
    </svg>`;
  }

  if (style === "flat") {
    return `<svg viewBox="0 0 120 160" width="${w}" height="${h}" role="img" aria-label="${esc(game.title)} cover" xmlns="http://www.w3.org/2000/svg">
      <rect width="120" height="160" rx="10" fill="${pal[0]}"/>
      ${motifLayer(motif, r, pal, id)}
      <circle cx="${30 + r() * 60}" cy="${40 + r() * 30}" r="${18 + r() * 16}" fill="${accent}" opacity="0.85"/>
      <text x="60" y="82" text-anchor="middle" font-family="ui-sans-serif,system-ui" font-weight="800" font-size="40" fill="${pal[3]}">${esc(abbr)}</text>
      <rect x="10" y="${122}" width="${20 + r() * 60}" height="4" rx="2" fill="${pal[2]}"/>
      <text x="10" y="144" font-size="8" font-family="ui-sans-serif,system-ui" fill="${pal[3]}" opacity="0.9">${esc((game.title || "").slice(0, 24))}</text>
    </svg>`;
  }

  /* pixel (default) */
  return `<svg viewBox="0 0 120 160" width="${w}" height="${h}" role="img" aria-label="${esc(game.title)} cover" xmlns="http://www.w3.org/2000/svg">
    <rect width="120" height="160" fill="${pal[0]}"/>
    <g transform="translate(0 0) scale(1.2 1.0)">${motifLayer(motif, r, pal, id)}</g>
    <g shape-rendering="crispEdges">${pixelArt(r, pal)}</g>
    <rect x="0" y="${160 - band}" width="120" height="${band}" fill="${pal[0]}" opacity="0.88"/>
    <rect x="0" y="${160 - band}" width="120" height="2" fill="${accent}"/>
    <text x="7" y="${160 - band + 14}" font-size="10" font-weight="700" font-family="ui-sans-serif,system-ui" fill="${pal[3]}">${esc(title.slice(0, 17))}</text>
    <text x="7" y="${160 - band + 25}" font-size="7" font-family="ui-sans-serif,system-ui" fill="${pal[4]}" opacity="0.9">${esc(title.slice(17, 38))}</text>
    <text x="113" y="${160 - band + 25}" text-anchor="end" font-size="8" font-family="monospace" fill="${accent}">${game.rating ? game.rating.toFixed(1) : ""}</text>
  </svg>`;
}

export function coverDataUri(game, opts) {
  const svg = coverSVG(game, opts);
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
