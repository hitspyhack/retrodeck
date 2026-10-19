/**
 * Icon builder - dependency-free.
 *
 *   node tools/make-icons.mjs
 *
 * The app is deliberately asset-free (see the README), so the launcher icons
 * are rasterised here and committed rather than downloaded from somewhere. A
 * minimal PNG encoder (zlib + the chunk format) is enough; no canvas, no
 * ImageMagick, no npm install.
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "icons");

/* ------------------------------------------------------------- tiny raster */
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

class Img {
  constructor(size) {
    this.size = size;
    this.data = new Float64Array(size * size * 4);
  }
  set(x, y, [r, g, b, a = 1]) {
    if (x < 0 || y < 0 || x >= this.size || y >= this.size) return;
    const i = (y * this.size + x) * 4;
    // source-over
    const sa = a * this.data[i + 3] === 0 ? a : a * (1 - this.data[i + 3]) + this.data[i + 3] * a;
    const inv = 1 - a;
    this.data[i] = r * a + this.data[i] * inv;
    this.data[i + 1] = g * a + this.data[i + 1] * inv;
    this.data[i + 2] = b * a + this.data[i + 2] * inv;
    this.data[i + 3] = Math.max(this.data[i + 3], a);
    void sa;
  }
  /**
   * Paint a coverage function with 4x4 supersampling. The callback receives
   * pixel coordinates (not 0..1) because every shape function in draw() maps
   * them itself via map(px / size) - passing normalised numbers here instead
   * would divide twice and smear the artwork over the whole tile.
   */
  paint(fn, color) {
    const S = this.size;
    const ss = 4;
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        let hit = 0;
        for (let j = 0; j < ss; j++)
          for (let i = 0; i < ss; i++)
            if (fn(x + (i + 0.5) / ss, y + (j + 0.5) / ss)) hit++;
        if (hit) this.set(x, y, [color[0], color[1], color[2], (color[3] ?? 1) * (hit / (ss * ss))]);
      }
  }
}

/* --------------------------------------------------------------- shapes */
const hex = (s) => {
  const v = s.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255);
};
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const roundRect = (x, y, r) => {
  const dx = Math.abs(x - 0.5), dy = Math.abs(y - 0.5);
  const q = Math.max(dx - (0.5 - r), dy - (0.5 - r));
  return q <= 0 || Math.hypot(Math.max(q, 0), Math.max(q, 0)) <= r;
};
const inBox = (x, y, x0, y0, x1, y1) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
const inCircle = (x, y, cx, cy, r) => Math.hypot(x - cx, y - cy) <= r;

/* palette: deep navy shell, orange accent, phosphor screen */
const C = {
  bgTop: hex("#151b2b"),
  bgBot: hex("#070910"),
  accent: hex("#ff9a4c"),
  screen: hex("#8ad7ff"),
  dark: hex("#05070c"),
  light: hex("#e8ecf3"),
  red: hex("#ff5f6d"),
  green: hex("#68e0c0"),
};

/**
 * @param {number} size square pixels
 * @param {object} o    { maskable: boolean } - maskable pulls the artwork into
 *                      the 80% safe zone and fills the whole tile.
 */
function draw(size, o = {}) {
  const img = new Img(size);
  const pad = o.maskable ? 0.0 : 0.04;
  const rad = o.maskable ? 0.0 : 0.22;
  const k = 1 - pad * 2;
  const map = (v) => (v - pad) / k;

  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const u = map(x / size), v = map(y / size);
      if (!roundRect(u, v, rad / k)) continue;
      const g = mix(C.bgTop, C.bgBot, clamp01(v));
      img.set(x, y, [g[0], g[1], g[2], 1]);
    }
  // accent frame
  img.paint((x, y) => {
    const u = map(x / size), v = map(y / size);
    const on = roundRect(u, v, rad / k);
    const inner = !inBox(u, v, pad / k + 0.035, pad / k + 0.035, 1 - pad / k - 0.035, 1 - pad / k - 0.035);
    return on && inner;
  }, [C.accent[0], C.accent[1], C.accent[2], 0.85]);

  const shift = o.maskable ? 0.06 : 0;
  const sc = 1 - shift * 2;
  const S = (v) => 0.5 + (v - 0.5) * sc;
  const box = (x0, y0, x1, y1) => (u, v) => inBox(u, v, S(x0), S(y0), S(x1), S(y1));

  // screen with a scanline wash
  img.paint((x, y) => box(0.2, 0.19, 0.8, 0.56)(map(x / size), map(y / size)), [
    C.screen[0], C.screen[1], C.screen[2], 1,
  ]);
  img.paint((x, y) => {
    const u = map(x / size), v = map(y / size);
    if (!box(0.2, 0.19, 0.8, 0.56)(u, v)) return false;
    const py = Math.floor((v - 0.19) * 26);
    return py % 2 === 0;
  }, [C.dark[0], C.dark[1], C.dark[2], 0.22]);
  // three "pixels" on the screen so it reads as a game, not a label
  img.paint((x, y) => box(0.27, 0.27, 0.37, 0.34)(map(x / size), map(y / size)), [C.light[0], C.light[1], C.light[2], 0.9]);
  img.paint((x, y) => box(0.6, 0.42, 0.72, 0.49)(map(x / size), map(y / size)), [C.red[0], C.red[1], C.red[2], 0.95]);

  // d-pad
  img.paint((x, y) => {
    const u = map(x / size), v = map(y / size);
    if (!inBox(u, v, S(0.19), S(0.64), S(0.41), S(0.86))) return false;
    const cx = S(0.3), cy = S(0.75);
    const arm = 0.052;
    const inV = Math.abs(v - cy) <= arm && u >= S(0.19) && u <= S(0.41);
    const inH = Math.abs(u - cx) <= arm && v >= S(0.64) && v <= S(0.86);
    return inV || inH;
  }, [C.light[0], C.light[1], C.light[2], 0.92]);

  // two buttons
  img.paint((x, y) => inCircle(map(x / size), map(y / size), S(0.62), S(0.72), 0.062), [C.accent[0], C.accent[1], C.accent[2], 1]);
  img.paint((x, y) => inCircle(map(x / size), map(y / size), S(0.78), S(0.8), 0.062), [C.green[0], C.green[1], C.green[2], 1]);
  return img;
}

/* --------------------------------------------------------------- encoder */
function png(img) {
  const { size, data } = img;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = Math.round(clamp01(data[i]) * 255);
      raw[o + 1] = Math.round(clamp01(data[i + 1]) * 255);
      raw[o + 2] = Math.round(clamp01(data[i + 2]) * 255);
      raw[o + 3] = Math.round(clamp01(data[i + 3]) * 255);
    }
  }
  const chunk = (type, bytes) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(bytes.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), bytes]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

let CRC = null;
function crcTable() {
  if (CRC) return CRC;
  CRC = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    CRC[n] = c;
  }
  return CRC;
}
function crc32(buf) {
  const t = crcTable();
  let c = ~0;
  for (let i = 0; i < buf.length; i++) c = t[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (~c) >>> 0;
}

/* ------------------------------------------------------------------- write */
mkdirSync(OUT, { recursive: true });
const targets = [
  ["icon-192.png", 192, {}],
  ["icon-512.png", 512, {}],
  ["maskable-512.png", 512, { maskable: true }],
  ["apple-touch-icon.png", 180, {}],
];
for (const [name, size, opts] of targets) {
  const buf = png(draw(size, opts));
  writeFileSync(join(OUT, name), buf);
  console.log(`${name.padEnd(22)} ${size}x${size}  ${(buf.length / 1024).toFixed(1)} kB`);
}

writeFileSync(
  join(OUT, "favicon.svg"),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#151b2b"/><stop offset="1" stop-color="#070910"/>
  </linearGradient></defs>
  <rect x="1" y="1" width="62" height="62" rx="14" fill="url(#g)" stroke="#ff9a4c" stroke-width="2"/>
  <rect x="13" y="12" width="38" height="24" rx="3" fill="#8ad7ff"/>
  <rect x="13" y="12" width="38" height="24" rx="3" fill="#05070c" opacity=".18"/>
  <rect x="18" y="18" width="8" height="6" fill="#e8ecf3" opacity=".9"/>
  <rect x="38" y="27" width="8" height="6" fill="#ff5f6d"/>
  <path d="M15 41h6v-6h8v6h-6v6h-8v-6h-0Z" fill="#e8ecf3" opacity=".92"/>
  <circle cx="42" cy="42" r="5.5" fill="#ff9a4c"/><circle cx="53" cy="48" r="5.5" fill="#68e0c0"/>
</svg>
`,
);
console.log("favicon.svg             vector");
