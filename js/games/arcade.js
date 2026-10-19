/**
 * Two original arcade titles for RetroDeck (MIT, written from scratch).
 *
 *   Maze Chomp   - maze-chase. The labyrinth is *generated*: a mirrored
 *                  spanning-tree maze, braided so there are no dead ends (a
 *                  chase game needs loops), plus a ghost house and an open
 *                  tunnel row for wrap-around. That keeps the level legal,
 *                  always solvable, and different every session.
 *   Brick Storm  - wall breaker: 4 power-ups, per-wall patterns, multi-ball.
 *
 * Both are homages to a genre rather than copies of a shipped game: own maze,
 * own sprites, own sound, own scoring. No third-party assets are used.
 */
import { rect, text, clamp, outline } from "./engine.js";

/* ------------------------------------------------------------ maze generator */
export const COLS = 19; // odd -> the mirror is exact
export const ROWS = 15;
export const TILE = 14;
const W = COLS * TILE;
const H = ROWS * TILE;
const DOT = 1, PELLET = 2, WALL = 3, GATE = 4, OPEN = 0;
const wrapX = (x) => ((x % COLS) + COLS) % COLS;
const CX = (COLS - 1) / 2; // 9 - the mirror axis
const CY = (ROWS - 1) / 2; // 7

/** cell lattice: cells live at odd x in [1..CX], odd y in [1..ROWS-2] */
const cellX = (i) => 1 + i * 2;
const cellY = (j) => 1 + j * 2;
const NI = (CX - 1) / 2 + 1; // 5 columns of cells on the half
const NJ = (ROWS - 2 - 1) / 2 + 1; // 7 rows of cells

export function makeMaze(rnd = Math.random) {
  const g = Array.from({ length: ROWS }, () => Array(COLS).fill(WALL));
  const visited = new Set();
  const stack = [[0, 0]];
  visited.add("0,0");
  g[cellY(0)][cellX(0)] = OPEN;
  while (stack.length) {
    const [i, j] = stack[stack.length - 1];
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]].sort(() => rnd() - 0.5);
    let moved = false;
    for (const [di, dj] of dirs) {
      const ni = i + di, nj = j + dj;
      if (ni < 0 || ni >= NI || nj < 0 || nj >= NJ) continue;
      const k = `${ni},${nj}`;
      if (visited.has(k)) continue;
      visited.add(k);
      g[cellY(j) + dj][cellX(i) + di] = OPEN; // knock the wall between
      g[cellY(nj)][cellX(ni)] = OPEN;
      stack.push([ni, nj]);
      moved = true;
      break;
    }
    if (!moved) stack.pop();
  }
  /* braid the half: remove some internal walls so there are loops */
  for (let j = 0; j < NJ; j++)
    for (let i = 0; i < NI - 1; i++) if (rnd() < 0.3) g[cellY(j)][cellX(i) + 1] = OPEN;
  for (let j = 0; j < NJ - 1; j++)
    for (let i = 0; i < NI; i++) if (rnd() < 0.3) g[cellY(j) + 1][cellX(i)] = OPEN;
  /* mirror */
  for (let y = 0; y < ROWS; y++) for (let x = 1; x <= CX; x++) g[y][COLS - 1 - x] = g[y][x];
  /* centre column: make sure it is a corridor so mirrored halves join */
  for (let j = 0; j < NJ; j++) if (g[cellY(j)][CX] === WALL) g[cellY(j)][CX] = OPEN;
  /* ghost house */
  for (let y = CY - 1; y <= CY; y++) for (let x = CX - 1; x <= CX + 1; x++) g[y][x] = OPEN;
  g[CY - 2][CX] = GATE;
  /* tunnel row: fully open, wraps at both edges */
  const ty = ROWS - 2;
  for (let x = 1; x < COLS - 1; x++) if (g[ty][x] === WALL) g[ty][x] = OPEN;
  g[ty][0] = OPEN;
  g[ty][COLS - 1] = OPEN;

  /* dots: only on cells the player can actually reach without the gate */
  const start = [CX, ROWS - 4];
  if (g[start[1]][start[0]] !== OPEN) g[start[1]][start[0]] = OPEN;
  const reach = new Set();
  const q = [start];
  reach.add(start.join(","));
  while (q.length) {
    const [x, y] = q.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = wrapX(x + dx), ny = y + dy;
      if (ny < 1 || ny > ROWS - 2 || nx < 0 || nx > COLS - 1) continue;
      const v = g[ny][nx];
      if (v === WALL || v === GATE) continue;
      const k = `${nx},${ny}`;
      if (reach.has(k)) continue;
      reach.add(k);
      q.push([nx, ny]);
    }
  }
  let dots = 0;
  for (const k of reach) {
    const [x, y] = k.split(",").map(Number);
    if (y >= CY - 1 && y <= CY && Math.abs(x - CX) <= 1) continue; // house
    if (Math.abs(x - start[0]) + Math.abs(y - start[1]) <= 1) continue; // spawn
    g[y][x] = DOT;
    dots++;
  }
  /* four power pellets, as far apart as we can manage */
  const far = [...reach]
    .map((k) => k.split(",").map(Number))
    .filter(([x, y]) => g[y][x] === DOT)
    .sort(
      (a, b) =>
        (Math.min(b[0], COLS - 1 - b[0]) + Math.min(b[1], ROWS - 1 - b[1])) *
          (1 + Math.abs(b[0] - CX) / COLS) -
        (Math.min(a[0], COLS - 1 - a[0]) + Math.min(a[1], ROWS - 1 - a[1])) *
          (1 + Math.abs(a[0] - CX) / COLS)
    );
  const picked = [];
  for (const [x, y] of far) {
    if (picked.length >= 4) break;
    if (picked.some(([px, py]) => Math.abs(px - x) + Math.abs(py - y) < 7)) continue;
    g[y][x] = PELLET;
    picked.push([x, y]);
  }
  return { grid: g, dots, start, house: [CX, CY - 1], gate: [CX, CY - 2], pellets: picked };
}

/** tile-hop movement: entities travel between tile centres, like real hardware */
function hop(ent, dt, canEnter, pick) {
  let guard = 5;
  while (guard-- > 0) {
    const dx = ent.tx - ent.x;
    const dy = ent.ty - ent.y;
    const d = Math.abs(dx) + Math.abs(dy);
    if (d < 1e-6) {
      ent.x = ent.tx;
      ent.y = ent.ty;
      const nd = pick(ent) || { x: 0, y: 0 };
      ent.dirX = nd.x;
      ent.dirY = nd.y;
      if (!nd.x && !nd.y) return;
      const nty = ent.ty + nd.y;
      let ntx = ent.tx + nd.x;
      const wrapped = Math.abs(ntx - ent.tx) > 1 || ntx < 0 || ntx > COLS - 1;
      ntx = wrapX(ntx);
      if (!canEnter(ntx, nty, ent)) {
        ent.dirX = 0;
        ent.dirY = 0;
        return;
      }
      ent.tx = ntx;
      ent.ty = nty;
      if (wrapped) ent.x = wrapX(ent.tx - nd.x);
      continue;
    }
    const m = Math.min(ent.speed * dt, d);
    ent.x += Math.sign(dx) * m;
    ent.y += Math.sign(dy) * m;
    return;
  }
}

const CORNERS = [[1, 1], [COLS - 2, 1], [1, ROWS - 3], [COLS - 2, ROWS - 3]];

/* ------------------------------------------------------------------ Maze Chomp */
export const Chomp = {
  id: "chomp",
  title: "Maze Chomp",
  system: "arcade",
  pad: "arcade4",
  genre: "Arcade",
  year: 2026,
  w: W,
  h: H + 22,
  blurb:
    "Eat every seed, dodge four Beetles, swallow a hot pepper and turn the tables. A fresh labyrinth every time you press A.",
  howto: "D-pad to move · A or Start to begin · B is a 2-second dash that costs a life when it ends · hold B for auto-fire",
  create(ctx, io) {
    const S = {
      grid: null,
      dots: 0,
      eaten: 0,
      level: 1,
      lives: 3,
      fright: 0,
      combo: 0,
      mode: "hunt",
      modeT: 0,
      freeze: 0,
      dash: 0,
      started: false,
      over: false,
      bestT: 3,
      msg: "PRESS  A",
      fruit: null,
      fruitT: 0,
      best: 0,
      player: { x: CX, y: ROWS - 4, tx: CX, ty: ROWS - 4, dirX: 0, dirY: 0, speed: 8, want: { x: 0, y: 0 }, mouth: 0 },
      ghosts: [],
    };

    const mkGhosts = () => {
      const h = [CX, CY - 1];
      return [
        { name: "BASH", color: "#ff5f6d", hue: 0, home: [h[0] - 1, h[1]], dirX: -1, dirY: 0, exitT: 0 },
        { name: "RUST", color: "#ffb02e", hue: 1, home: [h[0] + 1, h[1]], dirX: 1, dirY: 0, exitT: 0.5 },
        { name: "MINT", color: "#68e0c0", hue: 2, home: [h[0] - 1, h[1] + 1], dirX: 0, dirY: -1, exitT: 1 },
        { name: "PLUM", color: "#c48bff", hue: 3, home: [h[0] + 1, h[1] + 1], dirX: 0, dirY: -1, exitT: 1.5 },
      ].map((g) => ({ ...g, x: g.home[0], y: g.home[1], tx: g.home[0], ty: g.home[1], speed: 6, eaten: false }));
    };

    function newLevel(n) {
      const m = makeMaze();
      S.grid = m.grid;
      S.dots = m.dots;
      S.eaten = 0;
      S.fright = 0;
      S.combo = 0;
      S.fruit = null;
      S.ghosts = mkGhosts();
      Object.assign(S.player, { x: m.start[0], y: m.start[1], tx: m.start[0], ty: m.start[1], dirX: 0, dirY: 0, want: { x: 0, y: 0 } });
      S.freeze = 0.7;
      io.hud({ level: n, lives: S.lives });
    }
    function respawn() {
      const m = { start: [CX, ROWS - 4] };
      Object.assign(S.player, { x: m.start[0], y: m.start[1], tx: m.start[0], ty: m.start[1], dirX: 0, dirY: 0 });
      S.ghosts = mkGhosts();
      S.freeze = 0.7;
      S.fright = 0;
    }
    newLevel(1);
    S.best = io.load("best", 0);

    const at = (x, y) => (y < 0 || y >= ROWS ? WALL : S.grid[y][wrapX(x)]);
    const blocked = (x, y, isGhost) => {
      const v = at(x, y);
      if (v === WALL) return true;
      if (v === GATE) return !isGhost;
      return false;
    };
    const canEnterP = (x, y) => !blocked(x, y, false);
    /**
     * Ghosts may cross the door only while they are still inside the house
     * (they leave upwards through it) or when they are the returning eyeballs.
     * The player is always blocked by it.
     */
    const canEnterG = (x, y, g) => !blocked(x, y, !!g?.eaten || (g ? g.y >= CY - 2 : false));

    const pickPlayer = (p) => {
      const w = p.want;
      if ((w.x || w.y) && canEnterP(p.tx + w.x, p.ty + w.y)) return w;
      if ((p.dirX || p.dirY) && canEnterP(p.tx + p.dirX, p.ty + p.dirY)) return { x: p.dirX, y: p.dirY };
      return { x: 0, y: 0 };
    };
    const pickGhost = (g) => {
      const p = S.player;
      const frightened = S.fright > 0 && !g.eaten;
      const tgt = g.eaten
        ? g.home
        : frightened
        ? [1 + Math.floor(Math.random() * (COLS - 2)), 1 + Math.floor(Math.random() * (ROWS - 3))]
        : S.mode === "scatter"
        ? CORNERS[g.hue % 4]
        : g.hue === 0
        ? [p.tx, p.ty]
        : g.hue === 1
        ? [p.tx + p.dirX * 4, p.ty + p.dirY * 4]
        : g.hue === 2
        ? [p.tx + 4, p.ty - 2]
        : [p.tx - 4, p.ty + 2];
      const opts = [[0, -1], [-1, 0], [0, 1], [1, 0]].filter(([dx, dy]) => !(dx === -g.dirX && dy === -g.dirY));
      let best = null;
      let bd = Infinity;
      for (const [dx, dy] of opts) {
        if (canEnterG(g.tx + dx, g.ty + dy, g)) {
          const d = Math.hypot(g.tx + dx - tgt[0], g.ty + dy - tgt[1]);
          if (d < bd - 1e-6) { bd = d; best = { x: dx, y: dy }; }
        }
      }
      return best || { x: -g.dirX, y: -g.dirY };
    };

    return {
      bg: "#05060d",
      reset() {
        S.level = 1;
        S.lives = 3;
        S.over = false;
        S.started = true;
        S.msg = "";
        io.setScore(0);
        newLevel(1);
      },
      update(dt) {
        const inp = io.input;
        if (inp.pressed("a") || inp.pressed("start")) {
          if (S.over) { this.reset(); return; }
          if (!S.started) { S.started = true; S.msg = ""; io.sfx.power(); return; }
        }
        if (!S.started || S.over) { S.player.mouth += dt * 6; return; }
        if (S.freeze > 0) { S.freeze -= dt; return; }

        const p = S.player;
        const ax = inp.axis();
        p.want = { x: ax.x, y: ax.y };
        if (inp.down("b") && S.dash <= 0) { S.dash = 2; io.sfx.tone(320, 0.1, "sawtooth", 0.5, 780); }
        if (S.dash > 0) {
          const was = S.dash;
          S.dash = Math.max(0, S.dash - dt);
          if (was > 0 && S.dash === 0 && !S.over) {
            S.lives--;
            io.sfx.death();
            if (S.lives <= 0) io.over("The dash cost you the last life.");
            else respawn();
          }
        }
        p.speed = 8 * (S.dash > 0 ? 1.55 : 1);
        p.mouth += dt * 12;
        hop(p, dt, canEnterP, pickPlayer);

        /* eating */
        const cx = wrapX(Math.round(p.x));
        const cy = Math.round(p.y);
        const cell = at(cx, cy);
        if (cell === DOT || cell === PELLET) {
          S.grid[cy][cx] = OPEN;
          S.eaten++;
          if (cell === DOT) io.score(10);
          else {
            io.score(50);
            S.fright = Math.max(5.5 - S.level * 0.7, 1.6);
            S.combo = 0;
            io.sfx.power();
            for (const g of S.ghosts) if (!g.eaten) { g.dirX = -g.dirX; g.dirY = -g.dirY; }
          }
          if (S.eaten % 24 === 0) { S.fruit = { x: wrapX(cx + 2), y: cy }; S.fruitT = 8; }
          if (S.eaten >= S.dots) {
            io.score(300 * S.level);
            io.sfx.clear();
            S.level++;
            S.best = Math.max(S.best, io.getScore());
            io.save("best", S.best);
            io.event("level", { level: S.level });
            newLevel(S.level);
          }
        }
        if (S.fruit && Math.round(p.x) === S.fruit.x && Math.round(p.y) === S.fruit.y) {
          S.fruit = null;
          io.score(250);
          io.sfx.coin();
        }
        if (S.fruit && (S.fruitT -= dt) < 0) S.fruit = null;

        /* ghost mode cycle */
        S.modeT += dt;
        if (S.fright > 0) S.fright = Math.max(0, S.fright - dt);
        else if (S.modeT > 11) { S.mode = S.mode === "hunt" ? "scatter" : "hunt"; S.modeT = 0; }

        for (const g of S.ghosts) {
          if (g.exitT > 0) {
            g.exitT -= dt;
            g.speed = 4;
            hop(g, dt, canEnterG, () => ({ x: 0, y: -1 }));
            continue;
          }
          g.speed = g.eaten ? 11 : (6 + S.level * 0.5) * (S.fright > 0 ? 0.62 : 1);
          hop(g, dt, canEnterG, pickGhost);
          if (Math.abs(g.x - p.x) < 0.55 && Math.abs(g.y - p.y) < 0.55) {
            if (g.eaten) continue;
            if (S.fright > 0) {
              g.eaten = true;
              S.combo++;
              io.score(200 * 2 ** clamp(S.combo - 1, 0, 3));
              io.sfx.boom();
            } else {
              S.lives--;
              io.sfx.death();
              if (S.lives <= 0) {
                S.over = true;
                S.lives = 0;
                S.msg = `CAUGHT BY ${g.name}`;
                S.best = Math.max(S.best, io.getScore());
                io.save("best", S.best);
                io.over(`${g.name} caught you on labyrinth ${S.level} · ${S.eaten}/${S.dots} seeds`);
              } else respawn();
            }
          }
        }
        /* Throttle the best-score write: localStorage every frame is wasteful
           on a phone, so keep it in memory and flush at most every 3 seconds. */
        if (io.getScore() > S.best) {
          S.best = io.getScore();
          S.bestT -= dt;
          if (S.bestT <= 0) { S.bestT = 3; io.save("best", S.best); }
        }
        io.hud({ lives: Math.max(0, S.lives), level: S.level, extra: S.fright > 0 ? `TURN! ${S.fright.toFixed(1)}s` : "" });
      },
      draw(c) {
        for (let y = 0; y < ROWS; y++)
          for (let x = 0; x < COLS; x++) {
            const v = S.grid[y][x];
            const X = x * TILE, Y = y * TILE;
            if (v === WALL) {
              rect(c, X, Y, TILE, TILE, "#0f1740");
              const up = at(x, y - 1) !== WALL;
              const dn = at(x, y + 1) !== WALL;
              const lf = at(x - 1, y) !== WALL;
              const rt = at(x + 1, y) !== WALL;
              const ec = S.fright > 0 ? "#5f8bff" : "#3f6bff";
              if (!up) rect(c, X, Y, TILE, 2, ec);
              if (!dn) rect(c, X, Y + TILE - 2, TILE, 2, ec);
              if (!lf) rect(c, X, Y, 2, TILE, ec);
              if (!rt) rect(c, X + TILE - 2, Y, 2, TILE, ec);
            } else if (v === GATE) rect(c, X, Y + TILE / 2 - 1, TILE, 3, "#ff9ad2");
            else if (v === DOT) rect(c, X + TILE / 2 - 1, Y + TILE / 2 - 1, 2, 2, "#ffe6b0");
            else if (v === PELLET) {
              const r = 2.4 + Math.sin(S.player.mouth * 1.3) * 1.2;
              rect(c, X + TILE / 2 - r, Y + TILE / 2 - r, r * 2, r * 2, "#ffd54a");
            }
          }
        if (S.fruit) {
          const X = S.fruit.x * TILE, Y = S.fruit.y * TILE + Math.sin(S.player.mouth) * 1.6;
          rect(c, X + 2, Y + 5, 10, 7, "#ff5f6d");
          rect(c, X + 6, Y + 1, 2, 5, "#68e0c0");
        }
        const blink = S.fright > 0 && S.fright < 1.7 && Math.floor(performance.now() / 150) % 2;
        for (const g of S.ghosts) {
          const X = g.x * TILE, Y = g.y * TILE;
          const body = g.eaten ? null : S.fright > 0 ? (blink ? "#e8ecf3" : "#2f4bd6") : g.color;
          if (body) {
            rect(c, X + 2, Y + 3, TILE - 4, TILE - 6, body);
            rect(c, X + 3, Y + 1, TILE - 6, 3, body);
            for (let i = 0; i < 3; i++) rect(c, X + 2 + i * (TILE / 3), Y + TILE - 3, 3, 3, body);
          }
          rect(c, X + 3, Y + 5, 3, 4, g.eaten ? "#8ad7ff" : "#fff");
          rect(c, X + TILE - 6, Y + 5, 3, 4, g.eaten ? "#8ad7ff" : "#fff");
          rect(c, X + 4 + g.dirX, Y + 6 + g.dirY, 2, 2, "#05060d");
          rect(c, X + TILE - 5 + g.dirX, Y + 6 + g.dirY, 2, 2, "#05060d");
        }
        const p = S.player;
        const PX = p.x * TILE + TILE / 2, PY = p.y * TILE + TILE / 2;
        const open = Math.abs(Math.sin(p.mouth)) * 0.7 + 0.12;
        const ang = p.dirX === -1 ? Math.PI : p.dirY === -1 ? -Math.PI / 2 : p.dirY === 1 ? Math.PI / 2 : 0;
        c.fillStyle = "#ffd54a";
        c.beginPath();
        c.moveTo(PX, PY);
        c.arc(PX, PY, TILE / 2 + 1, ang + open, ang - open + Math.PI * 2);
        c.closePath();
        c.fill();
        if (S.dash > 0) outline(c, p.x * TILE, p.y * TILE, TILE, TILE, "#8ad7ff", 1);

        rect(c, 0, H, W, 22, "#0a0d1c");
        text(c, `BEST ${String(S.best).padStart(6, "0")}`, 4, H + 12, "#9fb0c8", 7);
        text(c, S.fright > 0 ? "CHARGE!" : S.mode === "scatter" ? "BEETLES DRIFT" : "BEETLES HUNT", W - 4, H + 12, "#8ad7ff", 7, "right");
        if (S.msg) text(c, S.msg, W / 2, H / 2 + 30, "#ffffff", 8, "center");
        if (S.lives <= 0) text(c, "GAME OVER  ·  A TO RETRY", W / 2, H / 2 + 42, "#ff5f6d", 8, "center");
      },
    };
  },
};

/* ---------------------------------------------------------------- Brick Storm */
const BW2 = 16, BH2 = 10, FW2 = 14;
const WW = BW2 * FW2;
const WH = 256;

export const Bricks = {
  id: "bricks",
  title: "Brick Storm",
  system: "nes",
  pad: "nes",
  genre: "Arcade",
  year: 2026,
  w: WW,
  h: WH,
  blurb: "Endless walls of block, four power-ups, one very tired paddle. Every wall is a little faster than the last.",
  howto: "Left/Right moves · A launches the ball and (with the laser) fires it",
  create() {
    const PAT = [
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2],
      [3, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 3],
      [1, 3, 2, 1, 1, 2, 2, 2, 2, 1, 1, 2, 3, 1],
      [4, 3, 3, 2, 2, 2, 1, 1, 2, 2, 2, 3, 3, 4],
    ];
    const colors = [null, "#8ad7ff", "#ffd54a", "#ff5f6d", "#c48bff"];
    const st = {
      alive: false,
      lives: 3,
      level: 1,
      paddle: { x: WW / 2, w: 38 },
      balls: [],
      bricks: [],
      drops: [],
      lasers: [],
      msg: "PRESS A",
      laser: 0,
      shake: 0,
      lastFire: 0,
    };
    function makeLevel(n) {
      st.bricks = [];
      const pat = PAT[(n - 1) % PAT.length];
      const rows = Math.min(pat.length + Math.min(3, Math.floor(n / 2)), 10);
      for (let r = 0; r < rows; r++) {
        const v = pat[Math.min(r, pat.length - 1)] || 1;
        for (let c = 0; c < FW2; c++) {
          if (n > 2 && (c * 3 + r * 5) % 11 === 0) continue;
          const hp = v > 2 && n > 3 ? 2 : v;
          st.bricks.push({ c, r, hp, max: Math.max(hp, 1) });
        }
      }
      st.drops.length = 0;
      st.lasers.length = 0;
      st.balls = [{ x: st.paddle.x, y: 214, vx: 0, vy: 0, stuck: true }];
    }
    makeLevel(1);
    return {
      bg: "#05060d",
      reset(io) {
        st.lives = 3;
        st.level = 1;
        st.alive = true;
        st.msg = "";
        st.paddle.w = 38;
        st.laser = 0;
        io.setScore(0);
        makeLevel(1);
      },
      update(dt, io) {
        const inp = io.input;
        if (inp.pressed("a") || inp.pressed("start")) {
          if (!st.alive) { this.reset(io); return; }
          for (const b of st.balls)
            if (b.stuck) {
              b.stuck = false;
              b.vx = 92 + st.level * 10;
              b.vy = -(168 + st.level * 12);
              io.sfx.tone(660, 0.06, "square", 0.7, 990);
            }
          if (st.laser > 0 && performance.now() - st.lastFire > 140) {
            st.lastFire = performance.now();
            for (const s of [-1, 1]) st.lasers.push({ x: st.paddle.x + s * 10, y: 214, vy: -300 });
            io.sfx.tone(1200, 0.05, "square", 0.4, 400);
          }
        }
        if (!st.alive) return;

        const pd = st.paddle;
        const ax = inp.axis();
        pd.x = clamp(pd.x + ax.x * 250 * dt, pd.w / 2, WW - pd.w / 2);
        if (st.laser > 0) st.laser = Math.max(0, st.laser - dt);

        for (let i = st.lasers.length - 1; i >= 0; i--) {
          const l = st.lasers[i];
          l.y += l.vy * dt;
          if (l.y < 24) { st.lasers.splice(i, 1); continue; }
          const col = Math.floor(l.x / BW2), r = Math.floor((l.y - 24) / BH2);
          const hit = st.bricks.findIndex((b) => b.c === col && b.r === r);
          if (hit >= 0) {
            const b = st.bricks[hit];
            if (--b.hp <= 0) { st.bricks.splice(hit, 1); io.score(10 * b.max); maybeDrop(b); }
            st.lasers.splice(i, 1);
          }
        }
        function maybeDrop(b) {
          if (Math.random() < 0.22) {
            const kinds = ["wide", "multi", "laser", "slow"];
            st.drops.push({ x: b.c * BW2 + BW2 / 2, y: 24 + b.r * BH2, k: kinds[Math.floor(Math.random() * 4)] });
          }
        }

        for (let bi = st.balls.length - 1; bi >= 0; bi--) {
          const b = st.balls[bi];
          if (b.stuck) { b.x = pd.x; b.y = 214; continue; }
          b.x += b.vx * dt;
          b.y += b.vy * dt;
          if (b.x < 3) { b.x = 3; b.vx = Math.abs(b.vx); io.sfx.bump(); }
          if (b.x > WW - 3) { b.x = WW - 3; b.vx = -Math.abs(b.vx); io.sfx.bump(); }
          if (b.y < 25) { b.y = 25; b.vy = Math.abs(b.vy); io.sfx.bump(); }
          if (b.y > WH - 4) {
            if (st.balls.length > 1) { st.balls.splice(bi, 1); continue; }
            st.lives--;
            io.sfx.death();
            if (st.lives <= 0) {
              st.alive = false;
              io.save("best", Math.max(io.load("best", 0), io.getScore()));
              io.over(`Out of balls on wall ${st.level}`);
            } else { b.stuck = true; b.vx = b.vy = 0; }
            break;
          }
          if (b.vy > 0 && b.y > 210 && b.y < 222 && Math.abs(b.x - pd.x) < pd.w / 2 + 3) {
            const off = clamp((b.x - pd.x) / (pd.w / 2), -1, 1);
            const speed = Math.min(Math.hypot(b.vx, b.vy) * 1.015, 340);
            const ang = -Math.PI / 2 + off * 1.05;
            b.vx = Math.cos(ang) * speed;
            b.vy = Math.sin(ang) * speed;
            b.y = 209;
            io.sfx.tone(520, 0.05, "square", 0.6, 780);
          }
          const col = Math.floor(b.x / BW2), r = Math.floor((b.y - 24) / BH2);
          for (let i = st.bricks.length - 1; i >= 0; i--) {
            const br = st.bricks[i];
            if (br.c !== col || br.r !== r) continue;
            br.hp--;
            b.vy = -b.vy;
            b.vx += (Math.random() - 0.5) * 24;
            st.shake = 0.08;
            io.sfx.tone(280 + br.hp * 130, 0.04, "square", 0.5);
            if (br.hp <= 0) {
              st.bricks.splice(i, 1);
              io.score(10 * br.max);
              maybeDrop(br);
            }
            break;
          }
        }
        for (let i = st.drops.length - 1; i >= 0; i--) {
          const d = st.drops[i];
          d.y += 96 * dt;
          if (d.y > 206 && d.y < 222 && Math.abs(d.x - pd.x) < pd.w / 2 + 6) {
            st.drops.splice(i, 1);
            io.sfx.power();
            io.score(40);
            if (d.k === "wide") pd.w = Math.min(70, pd.w + 12);
            if (d.k === "slow") for (const b of st.balls) { b.vx *= 0.72; b.vy *= 0.72; }
            if (d.k === "laser") st.laser = 6;
            if (d.k === "multi") {
              const s = st.balls[0] || { x: pd.x, y: 200, vx: 90, vy: -160 };
              for (const m of [-1, 1]) st.balls.push({ x: s.x, y: s.y, vx: s.vx + m * 55, vy: -Math.abs(s.vy || 160), stuck: false });
            }
            continue;
          }
          if (d.y > WH) st.drops.splice(i, 1);
        }
        if (pd.w > 38) pd.w = Math.max(38, pd.w - dt * 3.5);
        if (st.shake > 0) st.shake -= dt;

        if (!st.bricks.length) {
          io.score(220 * st.level);
          io.sfx.clear();
          st.level++;
          makeLevel(st.level);
          io.save("best", Math.max(io.load("best", 0), io.getScore()));
          io.event("level", { level: st.level });
        }
        io.hud({ level: st.level, lives: st.lives, extra: st.laser > 0 ? "LASER" : "" });
      },
      draw(c, io) {
        c.save();
        if (st.shake > 0) c.translate((Math.random() - 0.5) * 3, 0);
        for (let x = 0; x <= WW; x += BW2) rect(c, x, 24, 1, 190, "#0c1124");
        for (const b of st.bricks) {
          const X = b.c * BW2, Y = 24 + b.r * BH2;
          rect(c, X + 1, Y + 1, BW2 - 2, BH2 - 2, colors[clamp(b.hp, 1, 4)] || "#8ad7ff");
          rect(c, X + 1, Y + 1, BW2 - 2, 1, "#ffffff55");
        }
        for (const d of st.drops) {
          rect(c, d.x - 7, d.y - 4, 14, 8, "#ffd54a");
          text(c, d.k[0].toUpperCase(), d.x - 3, d.y - 3, "#05060d", 7);
        }
        for (const l of st.lasers) rect(c, l.x - 1, l.y - 6, 2, 6, "#ff5f6d");
        const pd = st.paddle;
        rect(c, pd.x - pd.w / 2, 218, pd.w, 6, st.laser > 0 ? "#ff5f6d" : "#e8ecf3");
        rect(c, pd.x - pd.w / 2, 218, pd.w, 2, "#8ad7ff");
        for (const b of st.balls) rect(c, b.x - 3, b.y - 3, 6, 6, "#fff");
        rect(c, 0, 0, WW, 22, "#0a0d1c");
        text(c, `WALL ${st.level}`, 4, 4, "#8ad7ff", 8);
        text(c, "●".repeat(Math.max(0, st.lives)), 4, 14, "#ff5f6d", 7);
        text(c, `BEST ${io.load("best", 0)}`, WW - 4, 8, "#ffd54a", 8, "right");
        if (st.msg) text(c, st.msg, WW / 2, 140, "#fff", 9, "center");
        if (!st.alive) text(c, "GAME OVER · A TO RETRY", WW / 2, 154, "#ff5f6d", 8, "center");
        c.restore();
      },
    };
  },
};
