/**
 * RetroDeck - shell renderer.
 *
 * Draws the console *model* you picked as vector art behind the game screen, so
 * a Game Boy looks like a Game Boy and an upright cabinet looks like a cabinet.
 * Everything is one inline <svg> in a viewBox whose aspect ratio is locked by
 * CSS - no images, no network, works offline in a service worker cache.
 *
 * The screen itself is a real DOM node layered on top of the art (the emulator
 * mounts its canvas into it), positioned with the same coordinates the art used.
 */

const R = (x, y, w, h, f, o = {}) =>
  `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="${n(o.r ?? 0)}" ${paint(f, o)}/>`;
const C = (cx, cy, r, f, o = {}) =>
  `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" ${paint(f, o)}/>`;
const E = (cx, cy, rx, ry, f, o = {}) =>
  `<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(rx)}" ry="${n(ry)}" ${paint(f, o)}/>`;
const P = (d, f, o = {}) => `<path d="${d}" ${paint(f, o)}/>`;
const L = (x1, y1, x2, y2, s, w = 0.4, o = {}) =>
  `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" stroke="var(${varOf(s)})" stroke-width="${n(w)}" ${o.op != null ? `opacity="${o.op}"` : ""}/>`;
const T = (x, y, text, size, f, o = {}) =>
  `<text x="${n(x)}" y="${n(y)}" font-size="${n(size)}" ${o.rot ? `transform="rotate(${o.rot} ${n(x)} ${n(y)})"` : ""} text-anchor="${o.anchor || "start"}" fill="var(${varOf(f)})" font-family="${o.font || "ui-sans-serif,system-ui,sans-serif"}" font-weight="${o.weight || 600}" letter-spacing="${n(o.ls ?? 0)}" ${o.op != null ? `opacity="${o.op}"` : ""}>${esc(text)}</text>`;
const G = (items, attrs = "") => `<g ${attrs}>${items.filter(Boolean).join("")}</g>`;

function n(v) {
  return typeof v === "number" ? Math.round(v * 100) / 100 : v;
}
function varOf(f) {
  if (!f) return "--shell";
  return f.startsWith("--") ? f.slice(2) : f;
}
function paint(f, o) {
  const bits = [];
  if (f && f !== "none") bits.push(`fill="var(--${varOf(f)})"`);
  else if (o.noFill !== true) bits.push(`fill="none"`);
  if (o.stroke) bits.push(`stroke="var(--${varOf(o.stroke)})"`);
  if (o.sw) bits.push(`stroke-width="${n(o.sw)}"`);
  if (o.op != null) bits.push(`opacity="${o.op}"`);
  if (o.clip) bits.push(`clip-path="url(#${o.clip})"`);
  return bits.join(" ");
}
const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/* ------------------------------------------------------------------ helpers */
function grille(x, y, w, h, cols, rows, size = 0.55) {
  const items = [];
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++)
      items.push(C(x + (i + 0.5) * (w / cols), y + (j + 0.5) * (h / rows), size, "grille", { op: 0.85 }));
  return G(items);
}
function ventLines(x, y, w, h, count) {
  const items = [];
  for (let i = 0; i < count; i++)
    items.push(R(x + (i * w) / count, y, w / count - 0.5, h, "shell2", { r: 0.2, op: 0.9 }));
  return G(items);
}
function keyRows(x, y, w, h, rows, cols) {
  const items = [];
  const kw = w / cols;
  const kh = h / rows;
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      const wide = j === rows - 1 && i > cols - 4;
      items.push(
        R(x + i * kw + 0.14, y + j * kh + 0.14, kw - 0.28, kh - 0.28, "btn", { r: 0.25, op: 0.72 })
      );
    }
  return G(items);
}
function dpadArt(cx, cy, s, style = "cross") {
  if (style === "disc" || style === "ball")
    return G([
      C(cx, cy, s * 0.52, "dpad", { op: 0.95 }),
      C(cx, cy, s * 0.42, "dpadHi", { op: 0.6 }),
      R(cx - s * 0.09, cy - s * 0.44, s * 0.18, s * 0.88, "shell2", { r: 0.2, op: 0.55 }),
      R(cx - s * 0.44, cy - s * 0.09, s * 0.88, s * 0.18, "shell2", { r: 0.2, op: 0.55 }),
    ]);
  return G([
    R(cx - s * 0.17, cy - s * 0.5, s * 0.34, s, "dpad", { r: s * 0.05 }),
    R(cx - s * 0.5, cy - s * 0.17, s, s * 0.34, "dpad", { r: s * 0.05 }),
    C(cx, cy, s * 0.1, "shellHi", { op: 0.35 }),
  ]);
}
function faceArt(cx, cy, s, labels = ["A", "B"], style = "round") {
  return G(labels.map((l, i) => {
    const dx = labels.length === 1 ? 0 : (i === 0 ? -1 : 1) * s * 0.72;
    const dy = labels.length === 1 ? 0 : (i === 0 ? -0.34 : 0.34) * s;
    return G([
      C(cx + dx, cy + dy, s * 0.5, "btn"),
      C(cx + dx, cy + dy - s * 0.08, s * 0.4, "btnHi", { op: 0.75 }),
      T(cx + dx, cy + dy + s * 0.16, l, s * 0.5, "btnText", { anchor: "middle", weight: 700 }),
    ]);
  }));
}

/* ---------------------------------------------------------------- templates */
export const TEMPLATES = {
  /* vertical handhelds: DMG, Pocket, Light, GBC, NGPC, WonderSwan */
  "handheld-portrait": (m) => {
    const W = 62, H = 100;
    const sc = m.screen || {};
    const sw = (sc.w ?? 56) * 0.62;
    const sh = sw * (sc.ar && sc.ar[0] ? sc.ar[1] / sc.ar[0] : 0.9);
    return {
      vb: [W, H],
      aspect: W / H,
      screen: { x: (W - sw) / 2, y: 9, w: sw, h: sh },
      items: (m2) => {
        const sx = (W - sw) / 2;
        const sy = 9;
        return [
          R(2, 1, W - 4, H - 3, "shell", { r: 6, stroke: "shell2", sw: 0.35 }),
          R(2, 1, W - 4, 26, "shellHi", { r: 6, op: 0.35 }),
          R(sx - 2.2, sy - 2.2, sw + 4.4, sh + 4.4, "bezel", { r: 2.4 }),
          R(sx - 1.4, sy - 1.4, sw + 2.8, sh + 2.8, "shell2", { r: 1.6, op: 0.5 }),
          T(W / 2, 6, m2.deco.brand || "", 2.6, "label", { anchor: "middle", weight: 800, ls: 0.12 }),
          T(W / 2, 8.6, m2.deco.product || "", 1.9, "accent", { anchor: "middle", ls: 0.2, op: 0.9 }),
          m2.deco.sub ? T(sx, sy + sh + 3.4, m2.deco.sub, 1.35, "label", { op: 0.8 }) : "",
          /* left: D-pad */
          dpadArt(15, sy + sh + 14, 12, m2.deco.dpad || "cross"),
          /* right: A/B diagonal + start/select */
          faceArt(47, sy + sh + 14, 6, ["A", "B"], "round"),
          G([
            E(26, sy + sh + 26, 2.5, 1, "btn"),
            E(33, sy + sh + 26, 2.5, 1, "btn"),
            T(26, sy + sh + 24, "SELECT", 1, "label", { anchor: "middle", op: 0.8 }),
            T(33, sy + sh + 24, "START", 1, "label", { anchor: "middle", op: 0.8 }),
          ]),
          /* speaker + power */
          G(Array.from({ length: 6 }, (_, i) => E(52 + (i % 2) * 3.4, sy + sh + 31 + Math.floor(i / 2) * 3, 1.1, 1.1, "grille"))),
          m2.deco.contrast ? G([R(6, sy - 5.2, 12, 1.5, "shell2", { r: 0.7 }), C(9 + (m2.deco.contrastPos ?? 6), sy - 4.45, 0.9, "btn"), T(19.5, sy - 4, "VOL", 1.1, "label")]) : "",
          m2.deco.power ? G([R(W - 16, 2.2, 12, 2.4, "shell2", { r: 1.2 }), C(W - 13, 3.4, 0.9, "led"), T(W - 11, 4, m2.deco.power === "slide" ? "POWER" : "PWR", 1.1, "label")]) : "",
          R(6, H - 4.5, W - 12, 2, "shell2", { r: 1, op: 0.5 }),
          T(W / 2, H - 2, m2.deco.battery || "", 1.2, "label", { anchor: "middle", op: 0.6 }),
        ];
      },
    };
  },

  /* wide handhelds: GBA, Game Gear, Lynx, PSP, Nomad */
  "handheld-landscape": (m) => {
    const W = 100, H = 62;
    const sw = (m.screen?.w ?? 40);
    const sh = sw * 0.72;
    const sx = 50 - sw / 2;
    const sy = (H - sh) / 2 - 1;
    return {
      vb: [W, H],
      aspect: W / H,
      screen: { x: sx, y: sy, w: sw, h: sh },
      items: (m2) => [
        R(1, 4, W - 2, H - 8, "shell", { r: 7, stroke: "shell2", sw: 0.35 }),
        R(1, 4, W - 2, 10, "shellHi", { r: 7, op: 0.3 }),
        /* shoulder bumpers */
        R(6, 1.5, 20, 5, "shell2", { r: 2.2 }),
        R(W - 26, 1.5, 20, 5, "shell2", { r: 2.2 }),
        T(16, 5.2, "L", 2.6, "label", { anchor: "middle" }),
        T(W - 16, 5.2, "R", 2.6, "label", { anchor: "middle" }),
        R(sx - 2, sy - 2, sw + 4, sh + 4, "bezel", { r: 1.6 }),
        T(50, sy - 3.4, m2.deco.brand || "", 2.2, "label", { anchor: "middle", weight: 800, ls: 0.1 }),
        T(50, H - 5, m2.deco.product || "", 1.7, "accent", { anchor: "middle", ls: 0.18 }),
        dpadArt(13, H / 2 + 2, 11, m2.deco.dpad || "cross"),
        faceArt(88, H / 2 + 1, 5.6, ["A", "B"]),
        G([
          E(41, H - 8.5, 2.6, 0.95, "btn"),
          E(49, H - 8.5, 2.6, 0.95, "btn"),
          T(41, H - 10.4, "SELECT", 1, "label", { anchor: "middle", op: 0.8 }),
          T(49, H - 10.4, "START", 1, "label", { anchor: "middle", op: 0.8 }),
        ]),
        m2.deco.speaker === "grille-left" ? grille(4, H / 2 + 12, 16, 6, 10, 3, 0.42) : "",
        m2.deco.speaker === "bars" ? G([R(W - 22, H - 6, 16, 1, "grille", { r: 0.5 }), R(W - 22, H - 4, 16, 1, "grille", { r: 0.5 })]) : "",
        m2.deco.lights ? G(Array.from({ length: 4 }, (_, i) => C(30 + i * 4, sy - 3.4, 0.8, i === 3 ? "led" : "grille"))) : "",
      ],
    };
  },

  /* PSP-N1000: the screen slides up, so the controls live in the band under it */
  "handheld-slide": (m) => {
    const W = 100, H = 66;
    const sw = m.screen?.w ?? 48;
    const sh = sw * (m.screen?.ar && m.screen.ar[0] ? m.screen.ar[1] / m.screen.ar[0] : 0.5625);
    const sx = 50 - sw / 2;
    const sy = 7;
    const seam = sy + sh + 4;
    const band = seam + 11.5;
    return {
      vb: [W, H],
      aspect: W / H,
      screen: { x: sx, y: sy, w: sw, h: sh },
      items: (m2) => [
        R(1, 3, W - 2, H - 6, "shell", { r: 9, stroke: "shell2", sw: 0.35 }),
        R(1, 3, W - 2, 10, "shellHi", { r: 9, op: 0.26 }),
        R(sx - 2.4, sy - 2.6, sw + 4.8, sh + 5.2, "bezel", { r: 1.8 }),
        /* the two rails the slider rides on, and its shadow */
        R(2.5, seam, W - 5, 1.3, "shell2", { r: 0.6, op: 0.9 }),
        R(2.5, seam + 1.3, W - 5, 0.7, "bezel", { r: 0.3, op: 0.45 }),
        T(50, sy - 4.6, m2.deco.brand || "SONY", 2, "label", { anchor: "middle", weight: 800, ls: 0.16 }),
        T(50, H - 3.4, m2.deco.product || "", 1.6, "accent", { anchor: "middle", ls: 0.2 }),
        grille(sx - 4.8, sy + 1.5, 3.4, sh - 3, 2, 7, 0.38),
        grille(sx + sw + 1.4, sy + 1.5, 3.4, sh - 3, 2, 7, 0.38),
        dpadArt(13, band, 9.5, m2.deco.dpad || "cross"),
        /* the nub that replaced the D-pad's diagonal on this model */
        C(27, band + 8, 3.6, "btn", { stroke: "shell2", sw: 0.28 }),
        C(27, band + 7.8, 2.5, "btnHi", { op: 0.5 }),
        T(27, band + 13.4, "ANALOG", 1, "label", { anchor: "middle", op: 0.7 }),
        G([
          C(88, band - 4.4, 2.5, "btn"), C(88, band - 4.6, 2, "btnHi", { op: 0.7 }), T(88, band - 4.1, "\u25B3", 1.9, "btnText", { anchor: "middle" }),
          C(83.4, band, 2.5, "btn"), C(83.4, band - 0.2, 2, "btnHi", { op: 0.7 }), T(83.4, band + 0.5, "\u25CB", 1.9, "btnText", { anchor: "middle" }),
          C(92.6, band, 2.5, "btn"), C(92.6, band - 0.2, 2, "btnHi", { op: 0.7 }), T(92.6, band + 0.5, "\u2715", 1.9, "btnText", { anchor: "middle" }),
          C(88, band + 4.4, 2.5, "btn"), C(88, band + 4.2, 2, "btnHi", { op: 0.7 }), T(88, band + 4.9, "\u25A1", 1.9, "btnText", { anchor: "middle" }),
        ]),
        E(41, band + 1.5, 3, 1, "btn", { op: 0.9 }),
        T(41, band - 1.4, "SELECT", 1, "label", { anchor: "middle", op: 0.75 }),
        E(60, band + 1.5, 3, 1, "btn", { op: 0.9 }),
        T(60, band - 1.4, "START", 1, "label", { anchor: "middle", op: 0.75 }),
        C(70, band - 8.2, 1, "led", { op: 0.9 }),
        m2.deco.stereo ? G([C(46, H - 3.4, 0.7, "grille"), C(54, H - 3.4, 0.7, "grille")]) : "",
      ],
    };
  },

  /* GBA SP style clamshell: lid above, controls below */
  clamshell: (m) => {
    const W = 100, H = 74;
    const sw = 44, sh = sw * 0.7;
    const sx = 50 - sw / 2, sy = 5;
    return {
      vb: [W, H],
      aspect: W / H,
      screen: { x: sx, y: sy, w: sw, h: sh },
      items: (m2) => [
        R(2, 1, W - 4, sh + 11, "shell", { r: 4 }),
        R(2, sy + sh + 10, W - 4, H - sh - 14, "shell", { r: 4, stroke: "shell2", sw: 0.35 }),
        R(10, sy + sh + 8.4, W - 20, 2.2, "shell2", { r: 1, op: 0.8 }),
        R(sx - 2, sy - 1.4, sw + 4, sh + 2.8, "bezel", { r: 1.4 }),
        T(50, sy - 0.4, "GAME BOY ADVANCE SP", 1.7, "label", { anchor: "middle", ls: 0.12 }),
        dpadArt(14, sy + sh + 18, 10, "cross"),
        faceArt(87, sy + sh + 17, 5.2, ["A", "B"]),
        G([R(4, sy + sh + 12.4, 15, 3.6, "shell2", { r: 1.4 }), R(W - 19, sy + sh + 12.4, 15, 3.6, "shell2", { r: 1.4 })]),
        G([E(42, sy + sh + 21, 2.6, 0.9, "btn"), E(52, sy + sh + 21, 2.6, 0.9, "btn")]),
        G(Array.from({ length: 3 }, (_, i) => C(64 + i * 3.4, sy + sh + 20.6, 0.8, i === 2 ? "led" : "grille"))),
        grille(24, H - 3.4, 52, 3, 30, 1, 0.34),
      ],
    };
  },

  "handheld-compact": (m) => {
    const W = 100, H = 56;
    const sw = 46, sh = sw * 0.68;
    const sx = 50 - sw / 2, sy = 5;
    return {
      vb: [W, H],
      aspect: W / H,
      screen: { x: sx, y: sy, w: sw, h: sh },
      items: (m2) => [
        R(1, 2, W - 2, H - 4, "shell", { r: 3, stroke: "shell2", sw: 0.3 }),
        R(sx - 1.6, sy - 1.2, sw + 3.2, sh + 2.4, "bezel", { r: 1 }),
        T(50, H - 2.6, m2.deco.product || "GAME BOY MICRO", 1.7, "label", { anchor: "middle", ls: 0.2 }),
        dpadArt(9, sy + sh + 7, 8, "cross"),
        faceArt(91, sy + sh + 6, 4.6, ["A", "B"]),
        G([R(7, H - 12, 13, 3, "shell2", { r: 1.2 }), R(W - 20, H - 12, 13, 3, "shell2", { r: 1.2 })]),
        m2.deco.faceplates ? R(2, 2, 4, H - 4, "accent", { r: 2, op: 0.65 }) : "",
      ],
    };
  },

  /* NES-001 / Mega Drive 1 / TG16 / Atari 2600 / Neo Geo AES */
  "front-loader": (m) => {
    const W = 100, H = 46;
    const sw = m.screen?.w ?? 34, sh = sw * 0.74;
    const sx = 50 - sw / 2, sy = 3;
    return {
      vb: [W, H],
      aspect: W / H,
      screen: { x: sx, y: sy, w: sw, h: sh },
      items: (m2) => [
        R(1, 12, W - 2, H - 16, "shell", { r: 1.6, stroke: "shell2", sw: 0.3 }),
        R(1, 12, W - 2, 4, "shellHi", { r: 1.6, op: 0.4 }),
        /* cartridge bay + door line */
        R(24, 9.5, 52, 6, "shell2", { r: 0.8 }),
        R(26, 11.4, 48, 2.4, "bezel", { r: 0.5 }),
        T(50, 8.4, m2.deco.brand || "SEGA", 2.6, "accent", { anchor: "middle", weight: 800, ls: 0.16 }),
        T(50, 20, m2.deco.product || "", 1.6, "label", { anchor: "middle", ls: 0.24 }),
        m2.deco.stripe ? R(3, 30, W - 6, 3.4, "accent", { r: 1, op: 0.85 }) : "",
        /* front face: slots, switches, LED, controllers */
        R(8, 34, 26, 6, "bezel", { r: 0.8 }),
        R(66, 34, 26, 6, "bezel", { r: 0.8 }),
        T(21, 42.4, "CONTROLLER 1", 1.1, "label", { anchor: "middle", op: 0.75 }),
        T(79, 42.4, "CONTROLLER 2", 1.1, "label", { anchor: "middle", op: 0.75 }),
        m2.deco.lever ? G([R(38, 33, 8, 8, "shell2", { r: 1 }), R(40, 34.4, 4, 3, "btn", { r: 0.6 }), T(42, 43, "POWER", 1, "label", { anchor: "middle" })]) : "",
        m2.deco.resetButton ? G([C(58, 37, 1.7, "btn"), T(58, 42.4, "RESET", 1, "label", { anchor: "middle" })]) : "",
        m2.deco.led === "red" ? C(11, 26, 1.1, "led") : "",
        m2.deco.wood ? R(3, 13.4, W - 6, 3, "accent", { r: 0.6, op: 0.9 }) : "",
        m2.deco.switches === 9 ? G(Array.from({ length: 9 }, (_, i) => R(38 + (i % 5) * 3.4 - 6, 22 + Math.floor(i / 5) * 4, 1.6, 3, "btn", { r: 0.4 }))) : "",
        m2.deco.vents === "lines" ? ventLines(4, 24, 16, 6, 6) : "",
        m2.deco.vents === "stripes" ? G([R(4, 24, 14, 1, "grille"), R(4, 26, 14, 1, "grille"), R(4, 28, 14, 1, "grille")]) : "",
        m2.deco.mic ? G([grille(84, 24, 10, 5, 8, 3, 0.34), T(89, 30.6, "MIC", 1, "label", { anchor: "middle" })]) : "",
      ],
    };
  },

  "top-loader": (m) => {
    const W = 100, H = 42;
    const sw = m.screen?.w ?? 32, sh = sw * 0.74;
    const sx = 50 - sw / 2, sy = 3;
    return {
      vb: [W, H],
      aspect: W / H,
      screen: { x: sx, y: sy, w: sw, h: sh },
      items: (m2) => [
        R(2, 11, W - 4, H - 16, "shell", { r: 3.4, stroke: "shell2", sw: 0.3 }),
        R(30, 8.6, 40, 6.4, "shell2", { r: 1.2 }),
        R(33, 10.2, 34, 3, "bezel", { r: 0.6 }),
        T(16, 20, m2.deco.brand || "NINTENDO", 2.3, "label", { weight: 800, ls: 0.1 }),
        T(16, 24, m2.deco.product || "", 1.5, "accent", { ls: 0.2 }),
        G([C(74, 19, 3.4, "btn"), T(74, 24.6, "POWER", 1.1, "label", { anchor: "middle" })]),
        G([C(84, 19, 2.4, "btn"), T(84, 24.6, "RESET", 1.1, "label", { anchor: "middle" })]),
        R(6, 30, 24, 4.4, "bezel", { r: 0.7 }),
        R(W - 30, 30, 24, 4.4, "bezel", { r: 0.7 }),
        T(18, 38.4, "CONTROLLER 1", 1.1, "label", { anchor: "middle", op: 0.7 }),
        T(W - 18, 38.4, "CONTROLLER 2", 1.1, "label", { anchor: "middle", op: 0.7 }),
        ventLines(38, 28, 24, 6, 8),
        m2.deco.paks ? G([R(40, 11.4, 8, 2.2, "shellHi", { r: 0.4 }), T(44, 10.4, "PAK", 1, "label", { anchor: "middle" })]) : "",
      ],
    };
  },

  "dog-bone": (m) => {
    const W = 100, H = 40;
    const sw = m.screen?.w ?? 30, sh = sw * 0.74;
    const sx = 50 - sw / 2, sy = 2;
    return {
      vb: [W, H],
      aspect: W / H,
      screen: { x: sx, y: sy, w: sw, h: sh },
      items: (m2) => [
        R(1, 12, W - 2, H - 20, "shell", { r: 8 }),
        E(10, H / 2, 11, 12, "shell", { op: 1 }),
        E(W - 10, H / 2, 11, 12, "shell", { op: 1 }),
        R(1, 12, W - 2, 3, "shellHi", { r: 8, op: 0.35 }),
        T(10, 18, m2.deco.brand || "Nintendo", 2.2, "label", { anchor: "middle", weight: 800 }),
        T(50, 16, m2.deco.product || "", 1.6, "accent", { anchor: "middle", ls: 0.18 }),
        R(32, 10.4, 36, 5.4, "shell2", { r: 1 }),
        R(35, 11.8, 30, 2.4, "bezel", { r: 0.5 }),
        G([R(24, 24, 9, 4, m2.deco.purple ? "accent" : "btn", { r: 2 }), T(28.5, 27.2, "POWER", 1.05, "btnText", { anchor: "middle" })]),
        G([R(W - 33, 24, 9, 4, m2.deco.purple ? "accent" : "btn", { r: 2 }), T(W - 28.5, 27.2, "EJECT", 1.05, "btnText", { anchor: "middle" })]),
        R(30, 30, 15, 3.6, "bezel", { r: 0.6 }),
        R(W - 45, 30, 15, 3.6, "bezel", { r: 0.6 }),
        T(37.5, 37, "CTRL 1", 1.05, "label", { anchor: "middle", op: 0.7 }),
        T(W - 37.5, 37, "CTRL 2", 1.05, "label", { anchor: "middle", op: 0.7 }),
      ],
    };
  },

  "slim-console": (m) => {
    const W = 100, H = 34;
    const sw = m.screen?.w ?? 30, sh = sw * 0.72;
    const sx = 50 - sw / 2, sy = 1;
    return {
      vb: [W, H],
      aspect: W / H,
      screen: { x: sx, y: sy, w: sw, h: sh },
      items: (m2) => [
        R(2, 11, W - 4, H - 18, "shell", { r: 4.5, stroke: "shell2", sw: 0.3 }),
        R(28, 8.8, 44, 5.4, "shell2", { r: 1 }),
        R(31, 10.2, 38, 2.2, "bezel", { r: 0.5 }),
        T(50, 22, m2.deco.brand || "SEGA", 2.4, "label", { anchor: "middle", weight: 800, ls: 0.14 }),
        T(50, 26, m2.deco.product || "", 1.5, "accent", { anchor: "middle", ls: 0.16 }),
        G([C(16, 20, 2.6, "btn"), T(16, 26, "POWER", 1, "label", { anchor: "middle" })]),
        G([C(24, 20, 1.9, "btn"), T(24, 26, "RESET", 1, "label", { anchor: "middle" })]),
        R(60, 28, 34, 3.4, "bezel", { r: 0.6 }),
        T(77, 34, "CONTROLLER PORTS (2)", 1.05, "label", { anchor: "middle", op: 0.7 }),
        m2.deco.hdmi ? G([R(6, 28, 16, 3.4, "bezel", { r: 0.6 }), T(14, 34, "HDMI", 1, "label", { anchor: "middle", op: 0.7 })]) : "",
      ],
    };
  },

  "disc-console": (m) => {
    const W = 100, H = 36;
    const sw = m.screen?.w ?? 30, sh = sw * 0.72;
    const sx = 50 - sw / 2, sy = 1;
    return {
      vb: [W, H],
      aspect: W / H,
      screen: { x: sx, y: sy, w: sw, h: sh },
      items: (m2) => [
        R(2, 12, W - 4, H - 18, "shell", { r: 2, stroke: "shell2", sw: 0.3 }),
        C(30, 22, 6.6, "shell2", { op: 0.9 }),
        C(30, 22, 4.6, "bezel"),
        C(30, 22, 1.1, "accent"),
        R(44, 16, 14, 4, "shell2", { r: 0.8 }),
        T(51, 19.2, m2.deco.lid === "top" ? "DISC" : "TRAY", 1.2, "label", { anchor: "middle" }),
        G([C(66, 18, 2.2, "btn"), T(66, 24, "RESET", 1, "label", { anchor: "middle" })]),
        G([C(74, 18, 2.2, "btn"), T(74, 24, "POWER", 1, "label", { anchor: "middle" })]),
        m2.deco.cards
          ? G([R(82, 15.4, 14, 4.2, "bezel", { r: 0.6 }), R(82, 21, 14, 4.2, "bezel", { r: 0.6 }), T(89, 28.6, "MEMORY CARD 1/2", 1, "label", { anchor: "middle", op: 0.7 })])
          : "",
        T(14, 30, m2.deco.brand || "SONY", 2, "label", { weight: 800 }),
        T(14, 33, m2.deco.product || "", 1.4, "accent", { ls: 0.14 }),
        ventLines(38, 24, 20, 5, 7),
        m2.deco.cd ? R(2, 12, W - 4, 1.4, "shellHi", { r: 0.6, op: 0.5 }) : "",
      ],
    };
  },

  "slim-disc": (m) => {
    const W = 100, H = 30;
    const sw = m.screen?.w ?? 28, sh = sw * 0.7;
    const sx = 50 - sw / 2, sy = 0.5;
    return {
      vb: [W, H],
      aspect: W / H,
      screen: { x: sx, y: sy, w: sw, h: sh },
      items: (m2) => [
        R(3, 11, W - 6, H - 16, "shell", { r: 5, stroke: "shell2", sw: 0.3 }),
        E(50, 15.4, 16, 3.2, "shell2", { op: 0.85 }),
        E(50, 15.4, 13, 2.2, "bezel"),
        T(50, 22.4, m2.deco.product || "", 1.5, "accent", { anchor: "middle", ls: 0.2 }),
        T(16, 17, m2.deco.brand || "SEGA", 2.1, "label", { weight: 800, ls: 0.06 }),
        G([C(74, 16, 2, "btn"), T(74, 21, "RESET", 0.95, "label", { anchor: "middle" })]),
        G([C(82, 16, 2, "btn"), T(82, 21, "OPEN", 0.95, "label", { anchor: "middle" })]),
        m2.deco.vmu ? G([R(88, 23, 9, 4.4, "bezel", { r: 0.6 }), R(90, 24.2, 5, 2, "led", { r: 0.3, op: 0.55 })]) : "",
        m2.deco.spin ? G([E(50, 15.4, 4.4, 1.2, "accent", { op: 0.5 })]) : "",
      ],
    };
  },

  "dual-handheld": (m) => {
    const W = 70, H = 118;
    const sw = 52, sh = sw * 0.75;
    const sx = (W - sw) / 2;
    return {
      vb: [W, H],
      aspect: W / H,
      screen: { x: sx, y: 8, w: sw, h: sh },
      secondScreen: { x: sx, y: 8 + sh + 14, w: sw, h: sh },
      items: (m2) => [
        R(2, 2, W - 4, H / 2 - 1, "shell", { r: 5 }),
        R(2, H / 2 + 1, W - 4, H / 2 - 3, "shell", { r: 5 }),
        R(6, H / 2 - 2.4, W - 12, 4.8, "shell2", { r: 2 }),
        R(sx - 2, 5.4, sw + 4, sh + 4, "bezel", { r: 1.4 }),
        R(sx - 2, 8 + sh + 12, sw + 4, sh + 4, "bezel", { r: 1.4 }),
        T(W / 2, 4, m2.deco.brand || "Nintendo", 2, "label", { anchor: "middle", weight: 800 }),
        T(W / 2, H / 2 + 5, m2.deco.product || "", 1.6, "accent", { anchor: "middle", ls: 0.16 }),
        dpadArt(13, H * 0.72, 9, "cross"),
        faceArt(57, H * 0.71, 4.6, ["Y", "X"]),
        faceArt(57, H * 0.78, 4.6, ["A", "B"]),
        G([E(26, H * 0.86, 2.4, 0.85, "btn"), E(36, H * 0.86, 2.4, 0.85, "btn"), T(26, H * 0.83, "SELECT", 0.95, "label", { anchor: "middle" }), T(36, H * 0.83, "START", 0.95, "label", { anchor: "middle" })]),
        C(46, H * 0.86, 1.3, "led", { op: 0.8 }),
        m2.deco.mic ? G([C(W / 2, H * 0.58, 0.9, "grille"), T(W / 2 + 4, H * 0.585, "MIC", 1, "label")]) : "",
        R(sx + 1, 8 + sh + 13.6, sw - 2, sh + 0.8, "glass", { r: 0.6, op: 0.35 }),
      ],
    };
  },

  visor: (m) => {
    const W = 100, H = 66;
    const sw = 44, sh = sw * 0.6;
    const sx = 50 - sw / 2, sy = 6;
    return {
      vb: [W, H],
      aspect: W / H,
      screen: { x: sx, y: sy, w: sw, h: sh },
      items: (m2) => [
        R(6, 4, W - 12, sh + 12, "shell", { r: 10 }),
        E(16, sy + sh / 2 + 5, 8, 10, "shell2"),
        E(W - 16, sy + sh / 2 + 5, 8, 10, "shell2"),
        R(50 - 22, sy - 2, 44, sh + 4, "bezel", { r: 1.4 }),
        T(50, 4, m2.deco.product || "VIRTUAL BOY", 1.8, "accent", { anchor: "middle", ls: 0.2 }),
        G([R(28, sh + 20, 44, 6, "shell", { r: 2 }), C(34, sh + 23, 1.4, "led"), dpadArt(20, sh + 23, 7, "cross"), faceArt(80, sh + 23, 4, ["A", "B"])]),
        R(44, H - 12, 12, 10, "shell2", { r: 1 }),
        R(20, H - 3, 60, 2.4, "shell2", { r: 1.2, op: 0.8 }),
      ],
    };
  },

  cab: (m) => {
    const W = 74, H = 124;
    const sw = 46, sh = sw * 0.78;
    const sx = (W - sw) / 2, sy = 30;
    return {
      vb: [W, H],
      aspect: W / H,
      screen: { x: sx, y: sy, w: sw, h: sh },
      items: (m2) => [
        R(2, 2, W - 4, H - 4, "shell", { r: 3 }),
        R(6, 5, W - 12, 16, "bezel", { r: 1.4 }),
        T(W / 2, 15, m2.deco.marquee || "INSERT COIN", 4.4, "accent", { anchor: "middle", weight: 800, ls: 0.1 }),
        T(W / 2, 19.4, m2.deco.product || "", 1.8, "label", { anchor: "middle", ls: 0.2 }),
        R(sx - 4, sy - 4, sw + 8, sh + 8, "bezel", { r: 1.2 }),
        R(sx - 6, sy - 6.4, sw + 12, 2.4, "shell2", { r: 1 }),
        /* control panel */
        R(4, sy + sh + 6, W - 8, 22, "shell2", { r: 2 }),
        G([C(20, sy + sh + 17, 6.4, "dpad"), C(20, sy + sh + 17, 3.4, "dpadHi"), R(19, sy + sh + 8, 2, 6, "shell", { r: 0.6 })]),
        G([
          C(40, sy + sh + 13, 3.4, "btnA"), C(49, sy + sh + 13, 3.4, "btnB"), C(58, sy + sh + 13, 3.4, "btnX"),
          C(40, sy + sh + 21, 3.4, "btnC"), C(49, sy + sh + 21, 3.4, "btnY"), C(58, sy + sh + 21, 3.4, "btnZ"),
        ]),
        m2.deco.slots ? G([R(8, sy + sh + 30, 20, 4, "bezel", { r: 0.6 }), T(18, sy + sh + 36, `${m2.deco.slots} SLOTS`, 1.4, "label", { anchor: "middle" })]) : "",
        /* coin door */
        R(12, H - 30, W - 24, 20, "shell2", { r: 1.4 }),
        G([R(24, H - 25, 8, 3, "bezel", { r: 0.5 }), R(W - 32, H - 25, 8, 3, "bezel", { r: 0.5 }), C(28, H - 18, 1.3, "led"), C(W - 28, H - 18, 1.3, "led"), T(W / 2, H - 12, "COIN · SERVICE", 1.6, "label", { anchor: "middle" })]),
        R(6, H - 8, W - 12, 3, "shell2", { r: 1 }),
      ],
    };
  },

  computer: (m) => {
    const W = 100, H = 78;
    const sw = 44, sh = sw * 0.75;
    const sx = 50 - sw / 2, sy = 3;
    return {
      vb: [W, H],
      aspect: W / H,
      screen: { x: sx, y: sy, w: sw, h: sh },
      items: (m2) => [
        /* monitor */
        R(14, 1, W - 28, sh + 6, "shell", { r: 2.4 }),
        R(sx - 1.6, sy - 1, sw + 3.2, sh + 2, "bezel", { r: 1 }),
        G([C(W - 22, sh + 2, 1.2, "led"), R(W - 19, sh + 1.2, 3, 1.6, "btn", { r: 0.4 })]),
        R(46, sh + 7, 8, 3.4, "shell2", { r: 0.6 }),
        R(34, sh + 10, 32, 2.2, "shell2", { r: 1 }),
        /* deck */
        R(4, sh + 15, W - 8, H - sh - 22, "shell", { r: 1.6, stroke: "shell2", sw: 0.3 }),
        T(9, sh + 20, m2.deco.brand || "commodore", 2.4, "label", { weight: 800 }),
        T(W - 9, sh + 20, m2.deco.product || "64", 2.4, "accent", { anchor: "end", weight: 800 }),
        keyRows(8, sh + 22, W - 16, 13, m2.deco.keys > 80 ? 6 : 5, 14),
        R(10, H - 6, 14, 3.4, "shell2", { r: 0.7 }),
        R(W - 24, H - 6, 14, 3.4, "shell2", { r: 0.7 }),
        T(17, H - 3.2, m2.deco.drive || "JOYSTICK 1", 1.1, "label", { anchor: "middle", op: 0.75 }),
        T(W - 17, H - 3.2, m2.deco.tape || "JOYSTICK 2", 1.1, "label", { anchor: "middle", op: 0.75 }),
        m2.deco.drive ? R(W / 2 + 14, H - 7, 20, 4, "bezel", { r: 0.8 }) : "",
      ],
    };
  },

  addon: (m) => {
    const W = 100, H = 34;
    const sw = m.screen?.w ?? 28, sh = sw * 0.7;
    const sx = 50 - sw / 2, sy = 0;
    return {
      vb: [W, H],
      aspect: W / H,
      screen: { x: sx, y: sy, w: sw, h: sh },
      items: (m2) => [
        R(6, 12, W - 12, H - 20, "shell", { r: 2.4, stroke: "shell2", sw: 0.3 }),
        R(30, 9.6, 40, 5, "shell2", { r: 0.8 }),
        R(33, 11, 34, 2, "bezel", { r: 0.4 }),
        T(50, 22, m2.deco.product || "ADD-ON", 2, "accent", { anchor: "middle", ls: 0.18 }),
        T(50, 26, m2.deco.brand || "", 1.4, "label", { anchor: "middle", ls: 0.1 }),
        R(12, 20, 14, 5, "bezel", { r: 0.8 }),
        C(80, 22, 2.2, "btn"),
        T(80, 27.6, m2.deco.resetLabel || "RESET", 1, "label", { anchor: "middle" }),
      ],
    };
  },

  dongle: (m) => {
    const W = 100, H = 30;
    const sw = m.screen?.w ?? 30, sh = sw * 0.7;
    const sx = 50 - sw / 2, sy = 0;
    return {
      vb: [W, H],
      aspect: W / H,
      screen: { x: sx, y: sy, w: sw, h: sh },
      items: (m2) => [
        R(10, 12, W - 20, H - 22, "shell", { r: 3 }),
        R(4, 15, 10, 6, "bezel", { r: 1 }),
        T(50, 19, m2.deco.brand || "iQue", 2.2, "label", { anchor: "middle", weight: 800 }),
        T(50, 23.4, m2.deco.product || "", 1.4, "accent", { anchor: "middle", ls: 0.14 }),
        C(84, 18, 2.4, "led", { op: 0.9 }),
        dpadArt(24, 22, 6, "cross"),
        faceArt(70, 22, 3.2, ["A", "B"]),
      ],
    };
  },
};

export const TEMPLATE_IDS = Object.keys(TEMPLATES);

/**
 * @param {object} model  a MODELS entry
 * @param {object} opts   { skin, label }
 * @returns {{svg:string, screen:{x:number,y:number,w:number,h:number}, aspect:number, secondScreen?:object}}
 */
export function buildShell(model, opts = {}) {
  const tpl = TEMPLATES[model.tpl] || TEMPLATES["front-loader"];
  const t = tpl(model);
  const items = t.items(model);
  const [VW, VH] = t.vb || [100, 100 / (t.aspect || 1)];
  const vb = `0 0 ${VW} ${VH}`;
  const svg =
    `<svg class="shell__art" viewBox="${vb}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">` +
    `<defs>` +
    `<filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="0.6"/></filter>` +
    `</defs>` +
    items.join("") +
    `</svg>`;
  return { svg, screen: t.screen, secondScreen: t.secondScreen, aspect: t.aspect, viewBox: vb, box: [VW, VH] };
}

/** Percentage geometry for the screen overlay from a shell box. */
export function screenStyle(box, viewBoxW = 100, viewBoxH = null) {
  const vb = box; // already in viewBox units
  return {
    left: `${(vb.x / viewBoxW) * 100}%`,
    top: `${(vb.y / (viewBoxH || 100)) * 100}%`,
    width: `${(vb.w / viewBoxW) * 100}%`,
    height: `${(vb.h / (viewBoxH || 100)) * 100}%`,
  };
}
