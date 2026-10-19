/**
 * Two original puzzle/action titles for RetroDeck (MIT).
 *
 *   Stack Drop    - falling-block puzzler: 7-bag randomiser, hold, ghost
 *                   piece, soft/hard drop, combos, spins on a D-pad only.
 *   Blastr Zone   - grid bomber: chain fuses, cross flames, breakable bricks,
 *                   two enemy brains, power-ups, exit revealed on clear.
 *
 * Genre mechanics are not copyrightable, so these are original builds with own
 * art, own audio and own level generation - not rips of any commercial cart.
 */
import { rect, text, clamp, rand } from "./engine.js";

/* ------------------------------------------------------------------ Stack Drop */
const CW = 10, ROWS = 18, CELL = 8, OX = 4, OY = 24;
const FIELD_W = OX * 2 + CW * CELL + 46;
const FIELD_H = OY + ROWS * CELL + 4;

const PIECES = {
  I: { s: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]], c: "#68e0c0" },
  O: { s: [[1, 1], [1, 1]], c: "#ffd54a" },
  T: { s: [[0, 1, 0], [1, 1, 1], [0, 0, 0]], c: "#c48bff" },
  S: { s: [[0, 1, 1], [1, 1, 0], [0, 0, 0]], c: "#5ad05a" },
  Z: { s: [[1, 1, 0], [0, 1, 1], [0, 0, 0]], c: "#ff5f6d" },
  J: { s: [[1, 0, 0], [1, 1, 1], [0, 0, 0]], c: "#4f9dff" },
  L: { s: [[0, 0, 1], [1, 1, 1], [0, 0, 0]], c: "#ff9a4c" },
};
const KEYS = Object.keys(PIECES);

export const Stack = {
  id: "stack",
  title: "Stack Drop",
  system: "gb",
  pad: "gb",
  genre: "Puzzle",
  year: 2026,
  w: FIELD_W,
  h: FIELD_H,
  blurb: "Ten columns, seven shapes, no mercy. Four rows at once is a Storm.",
  howto: "Left/Right move · Down soft-drops · Up or B rotates · A hard-drops · Select swaps the HOLD box",
  create(ctx, io0) {
    const io = io0;
    const board = Array.from({ length: ROWS }, () => Array(CW).fill(0));
    let bag = [], cur = null, next = null, hold = null, canHold = true;
    let dropEvery = 0.75, lockTimer = 0, lineCount = 0, combo = 0, level = 1;
    let flash = 0, flashRows = [], started = false, over = false, msg = "PRESS  A";
    const das = { x: 0, t: 0 };

    const pull = () => {
      if (!bag.length) bag = [...KEYS].sort(() => Math.random() - 0.5);
      return bag.pop();
    };
    function collide(m, x, y) {
      for (let r = 0; r < m.length; r++)
        for (let c = 0; c < m.length; c++) {
          if (!m[r][c]) continue;
          const bx = x + c, by = Math.floor(y) + r;
          if (bx < 0 || bx >= CW || by >= ROWS) return true;
          if (by >= 0 && board[by][bx]) return true;
        }
      return false;
    }
    const make = (k) => ({ k, m: PIECES[k].s.map((r) => [...r]), c: PIECES[k].c, x: Math.floor((CW - PIECES[k].s.length) / 2), y: 0 });
    function spawn() {
      const k = next || pull();
      next = pull();
      cur = make(k);
      lockTimer = 0;
      if (collide(cur.m, cur.x, cur.y)) { over = true; msg = "TOPPED OUT"; io.save("best", Math.max(io.load("best", 0), io.getScore())); }
    }
    function move(dx) {
      if (!collide(cur.m, cur.x + dx, cur.y)) {
        cur.x += dx;
        io.sfx.tone(420, 0.02, "square", 0.22);
      }
    }
    const rotateCW = (m) => m[0].map((_, i) => m.map((r) => r[i]).reverse());
    function tryRotate(times) {
      let m = cur.m;
      for (let i = 0; i < times; i++) m = rotateCW(m);
      for (const k of [0, -1, 1, -2, 2])
        if (!collide(m, cur.x + k, cur.y)) {
          cur.m = m;
          cur.x += k;
          io.sfx.tone(700, 0.04, "square", 0.35);
          return;
        }
      io.sfx.bump();
    }
    function lock() {
      // cur.y drifts as a float between steps, so quantise before writing cells
      const ry0 = Math.floor(cur.y);
      cur.y = ry0;
      for (let r = 0; r < cur.m.length; r++)
        for (let c = 0; c < cur.m.length; c++) {
          const ry = ry0 + r;
          if (!cur.m[r][c] || ry < 0 || ry >= ROWS) continue;
          board[ry][cur.x + c] = cur.c;
        }
      if (ry0 < 0) { over = true; msg = "TOPPED OUT"; }
      const full = [];
      for (let r = 0; r < ROWS; r++) if (board[r].every((v) => v)) full.push(r);
      if (full.length) {
        flash = 0.22;
        flashRows = full;
        for (const r of full) { board.splice(r, 1); board.unshift(Array(CW).fill(0)); }
        lineCount += full.length;
        combo++;
        io.score([0, 100, 300, 500, 800][full.length] * level + (combo > 1 ? combo * 50 : 0));
        if (full.length === 4) io.sfx.clear(); else io.sfx.power();
        level = 1 + Math.floor(lineCount / 10);
        dropEvery = Math.max(0.09, 0.75 - (level - 1) * 0.055);
        io.event("lines", { n: full.length, level });
        io.hud({ extra: full.length === 4 ? "STORM!" : `${full.length} LINE${full.length > 1 ? "S" : ""}${combo > 1 ? ` x${combo}` : ""}` });
      } else {
        combo = 0;
        io.hud({ extra: "" });
      }
      canHold = true;
      spawn();
    }
    function hardDrop() {
      let n = 0;
      while (!collide(cur.m, cur.x, Math.floor(cur.y) + n + 1)) n++;
      cur.y = Math.floor(cur.y) + n;
      io.score(n * 2);
      lock();
    }
    function swap() {
      if (!canHold) return;
      if (hold) {
        const k = hold;
        hold = cur.k;
        cur = make(k);
      } else {
        hold = cur.k;
        spawn();
      }
      canHold = false;
      io.sfx.tone(880, 0.05, "triangle", 0.45);
    }
    spawn();
    spawn();
    io.hud({ level: 1, extra: "" });

    return {
      bg: "#0b0f0a",
      reset() {
        for (let r = 0; r < ROWS; r++) board[r].fill(0);
        bag = []; hold = null; canHold = true;
        lineCount = 0; combo = 0; level = 1; dropEvery = 0.75;
        over = false; started = true; msg = "";
        io.setScore(0);
        io.hud({ level: 1, extra: "" });
        spawn(); spawn();
      },
      update(dt) {
        const inp = io.input;
        if (inp.pressed("a") || inp.pressed("start")) {
          if (!started || over) { this.reset(); return; }
        }
        if (!started || over) return;
        const ax = inp.axis();
        if (ax.x) {
          if (das.x !== ax.x) { das.x = ax.x; das.t = 0.16; move(ax.x); }
          else { das.t -= dt; if (das.t <= 0) { move(ax.x); das.t = 0.055; } }
        } else das.x = 0;
        if (inp.pressed("up") || inp.pressed("b")) tryRotate(1);
        if (inp.pressed("left2")) tryRotate(3);
        if (inp.pressed("select")) swap();
        if (inp.pressed("a")) hardDrop();
        const speed = inp.down("down") ? Math.max(0.02, dropEvery * 0.09) : dropEvery;
        if (!collide(cur.m, cur.x, Math.floor(cur.y) + 1)) {
          cur.y += dt / speed;
          lockTimer = 0;
        } else {
          lockTimer += dt;
          if (lockTimer > 0.5) lock();
        }
        io.hud({ level });
      },
      draw(c) {
        rect(c, 0, 0, FIELD_W, FIELD_H, "#0b0f0a");
        rect(c, OX - 1, OY - 1, CW * CELL + 2, ROWS * CELL + 2, "#1c241a");
        for (let r = 0; r < ROWS; r++)
          for (let col = 0; col < CW; col++) {
            const v = board[r][col];
            const X = OX + col * CELL, Y = OY + r * CELL;
            rect(c, X, Y, CELL - 1, CELL - 1, v || "#0e130d");
            if (v) rect(c, X, Y, CELL - 1, 2, "#ffffff33");
          }
        if (flash > 0) {
          flash -= 1 / 60;
          for (const r of flashRows) rect(c, OX, OY + r * CELL, CW * CELL, CELL, "#ffffff40");
        }
        if (cur) {
          let g = 0;
          while (!collide(cur.m, cur.x, Math.floor(cur.y) + g + 1)) g++;
          for (let r = 0; r < cur.m.length; r++)
            for (let col = 0; col < cur.m.length; col++) {
              if (!cur.m[r][col]) continue;
              rect(c, OX + (cur.x + col) * CELL, OY + (Math.floor(cur.y) + g + r) * CELL, CELL - 1, CELL - 1, "#ffffff18");
            }
          for (let r = 0; r < cur.m.length; r++)
            for (let col = 0; col < cur.m.length; col++) {
              if (!cur.m[r][col]) continue;
              const Y = OY + (Math.floor(cur.y) + r) * CELL;
              if (Y < OY) continue;
              rect(c, OX + (cur.x + col) * CELL, Y, CELL - 1, CELL - 1, cur.c);
              rect(c, OX + (cur.x + col) * CELL, Y, CELL - 1, 2, "#ffffff44");
            }
        }
        const SX = OX + CW * CELL + 10;
        text(c, "NEXT", SX, OY, "#9fb0c8", 7);
        if (next) {
          const p = PIECES[next];
          for (let r = 0; r < p.s.length; r++)
            for (let col = 0; col < p.s.length; col++)
              if (p.s[r][col]) rect(c, SX + col * 6, OY + 8 + r * 6, 5, 5, p.c);
        }
        text(c, "HOLD", SX, OY + 48, "#9fb0c8", 7);
        if (hold) {
          const p = PIECES[hold];
          for (let r = 0; r < p.s.length; r++)
            for (let col = 0; col < p.s.length; col++)
              if (p.s[r][col]) rect(c, SX + col * 6, OY + 56 + r * 6, 5, 5, canHold ? p.c : "#4a4f57");
        }
        text(c, `LV ${level}`, SX, OY + 96, "#8ad7ff", 7);
        text(c, `${lineCount} LN`, SX, OY + 106, "#ffd54a", 7);
        text(c, `BEST ${io.load("best", 0)}`, SX, OY + 118, "#9fb0c8", 6);
        if (msg) text(c, msg, OX + (CW * CELL) / 2, OY + 80, "#fff", 8, "center");
        if (over) text(c, "A TO RETRY", OX + (CW * CELL) / 2, OY + 92, "#8ad7ff", 7, "center");
      },
    };
  },
};

/* ---------------------------------------------------------------- Blastr Zone */
const GW = 15, GH = 13, TS = 16;
const BW = GW * TS, BH = GH * TS + 22;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function makeStage(n) {
  const g = Array.from({ length: GH }, () => Array(GW).fill(0));
  for (let y = 0; y < GH; y++)
    for (let x = 0; x < GW; x++)
      g[y][x] = x === 0 || y === 0 || x === GW - 1 || y === GH - 1 ? 1 : x % 2 === 0 && y % 2 === 0 ? 1 : 0;
  for (const [x, y] of [[1, 1], [2, 1], [1, 2], [1, 3], [3, 1]]) if (g[y]) g[y][x] = 0;
  const density = clamp(0.34 + n * 0.05, 0.34, 0.62);
  const bricks = [];
  for (let y = 1; y < GH - 1; y++)
    for (let x = 1; x < GW - 1; x++)
      if (g[y][x] === 0 && !(x <= 3 && y <= 3) && Math.random() < density) { g[y][x] = 2; bricks.push([x, y]); }
  const ex = bricks.length ? bricks[rand(bricks.length)] : [GW - 2, GH - 2];
  g[ex[1]][ex[0]] = 2;
  return { g, exit: { x: ex[0], y: ex[1], open: false } };
}
function brickCount(g) {
  let n = 0;
  for (const row of g) for (const v of row) if (v === 2) n++;
  return n;
}

export const Blastr = {
  id: "blastr",
  title: "Blastr Zone",
  system: "nes",
  pad: "nes",
  genre: "Action",
  year: 2026,
  w: BW,
  h: BH,
  blurb: "Drop a bomb, run, take out the wall - and whatever was behind it. The exit hides under a brick.",
  howto: "D-pad moves · A places a bomb · B detonates early · clear every bot then stand on the open exit tile",
  create(ctx, io0) {
    const io = io0;
    let stage = makeStage(1);
    const S = {
      started: false, over: false, msg: "PRESS  A", level: 1, lives: 3,
      maxBombs: 1, range: 2, speed: 5.2, inv: 0, shake: 0, anim: 0,
      bombs: [], flames: [], pickups: [], enemies: [], px: 1.5, py: 1.5, dirX: 1, dirY: 0, moving: false,
    };
    const solid = (x, y) => {
      const gx = Math.round(x - 0.5), gy = Math.round(y - 0.5);
      if (gx < 0 || gy < 0 || gx >= GW || gy >= GH) return true;
      const v = stage.g[gy]?.[gx];
      return v === 1 || v === 2;
    };
    function newLevel(n) {
      stage = makeStage(n);
      S.bombs.length = 0; S.flames.length = 0; S.pickups.length = 0;
      S.px = S.py = 1.5; S.dirX = 1; S.dirY = 0; S.inv = 0.8;
      const kinds = ["bomb", "fire", "speed", "life"];
      for (let y = 0; y < GH; y++)
        for (let x = 0; x < GW; x++)
          if (stage.g[y][x] === 2 && Math.random() < 0.18) S.pickups.push({ x, y, k: kinds[rand(kinds.length)], hidden: true });
      const count = Math.min(2 + Math.floor(n / 2), 6);
      S.enemies = Array.from({ length: count }, (_, i) => {
        let ex, ey, tries = 0;
        do { ex = 1 + rand(GW - 2); ey = 1 + rand(GH - 2); tries++; }
        while ((stage.g[ey][ex] !== 0 || (ex < 5 && ey < 5) || (ex === stage.exit.x && ey === stage.exit.y)) && tries < 300);
        return { x: ex + 0.5, y: ey + 0.5, dir: DIRS[rand(4)], speed: 2.0 + n * 0.16, smart: i % 3 === 2, anim: i };
      });
      S.msg = "";
      io.hud({ level: n, lives: S.lives, extra: `${S.maxBombs}x bomb · range ${S.range}` });
    }
    function boom(bx, by, range) {
      const push = (x, y) => S.flames.push({ x, y, t: 0.55 });
      push(bx, by);
      for (const [dx, dy] of DIRS)
        for (let i = 1; i <= range; i++) {
          const x = bx + dx * i, y = by + dy * i;
          if (x < 0 || y < 0 || x >= GW || y >= GH) break;
          const v = stage.g[y][x];
          if (v === 1) break;
          if (v === 2) {
            stage.g[y][x] = 0;
            push(x, y);
            const q = S.pickups.find((p) => p.hidden && p.x === x && p.y === y);
            if (q) q.hidden = false;
            const nb = S.bombs.find((b) => b.x === x && b.y === y);
            if (nb) nb.fuse = Math.min(nb.fuse, 0.04);
            break;
          }
          push(x, y);
          const nb = S.bombs.find((b) => b.x === x && b.y === y);
          if (nb) nb.fuse = Math.min(nb.fuse, 0.04);
        }
      S.shake = 0.22;
      io.sfx.boom();
    }
    function hurt(what) {
      if (S.inv > 0 || S.over) return;
      S.lives--;
      S.inv = 1.5;
      io.sfx.death();
      io.hud({ lives: S.lives });
      if (S.lives <= 0) {
        S.over = true;
        S.msg = `CAUGHT BY ${what.toUpperCase()}`;
        io.save("best", Math.max(io.load("best", 0), io.getScore()));
        io.over(`Caught by ${what} in sector ${S.level}`);
      } else { S.px = S.py = 1.5; S.bombs.length = 0; }
    }
    newLevel(1);

    return {
      bg: "#0a0c08",
      reset() {
        S.level = 1; S.lives = 3; S.maxBombs = 1; S.range = 2; S.speed = 5.2;
        S.over = false; S.started = true;
        io.setScore(0);
        newLevel(1);
      },
      update(dt) {
        const inp = io.input;
        if (inp.pressed("a") || inp.pressed("start")) {
          if (!S.started || S.over) { this.reset(); return; }
          const bx = Math.round(S.px - 0.5), by = Math.round(S.py - 0.5);
          if (S.bombs.length < S.maxBombs && !S.bombs.some((b) => b.x === bx && b.y === by) && stage.g[by][bx] === 0) {
            S.bombs.push({ x: bx, y: by, fuse: 2.1, anim: 0 });
            io.sfx.tone(240, 0.06, "square", 0.45);
          }
        }
        if (inp.pressed("b")) for (const b of S.bombs) if (b.fuse > 0.3) b.fuse = 0.04;
        if (!S.started || S.over) return;
        S.anim += dt;

        /* --- player: axis-aligned sliding with a round-ish hitbox ------ */
        /* --- player: sliding hitbox with corner-cutting, like the carts -- */
        const R = 0.3;
        const cell = (v) => Math.round(v - 0.5);
        const centre = (v) => cell(v) + 0.5;
        const blockedCell = (cx, cy) => {
          if (cx < 0 || cy < 0 || cx >= GW || cy >= GH) return true;
          const v = stage.g[cy][cx];
          if (v === 1 || v === 2) return true;
          if (S.bombs.some((b) => b.x === cx && b.y === cy)) return !(cell(S.px) === cx && cell(S.py) === cy);
          return false;
        };
        const fits = (px, py) => {
          for (const cx of [cell(px - R), cell(px + R)])
            for (const cy of [cell(py - R), cell(py + R)]) if (blockedCell(cx, cy)) return false;
          return true;
        };
        const ax = inp.axis();
        const dirX = Math.sign(ax.x), dirY = Math.sign(ax.y);
        const sp = S.speed * dt;
        S.moving = !!(dirX || dirY);
        S.anim += dt * (S.moving ? 8 : 0);
        if (dirX) {
          const nx = S.px + dirX * sp;
          if (fits(nx, S.py)) S.px = nx;
          else if (fits(nx, centre(S.py))) { S.px = nx; S.py = centre(S.py); }
          else {
            const wall = cell(nx + dirX * R);
            const flush = dirX > 0 ? wall - R : wall + 1 + R;
            if (dirX > 0 ? flush > S.px : flush < S.px) S.px = flush;
          }
          S.dirX = dirX; S.dirY = 0;
        }
        if (dirY) {
          const ny = S.py + dirY * sp;
          if (fits(S.px, ny)) S.py = ny;
          else if (fits(centre(S.px), ny)) { S.py = ny; S.px = centre(S.px); }
          else {
            const wall = cell(ny + dirY * R);
            const flush = dirY > 0 ? wall - R : wall + 1 + R;
            if (dirY > 0 ? flush > S.py : flush < S.py) S.py = flush;
          }
          S.dirY = dirY; S.dirX = 0;
        }
        /* --- pickups ------------------------------------------------------ */
        for (let i = S.pickups.length - 1; i >= 0; i--) {
          const q = S.pickups[i];
          if (q.hidden) continue;
          if (Math.abs(q.x + 0.5 - S.px) < 0.6 && Math.abs(q.y + 0.5 - S.py) < 0.6) {
            S.pickups.splice(i, 1);
            io.sfx.power();
            io.score(120);
            if (q.k === "bomb") S.maxBombs = Math.min(8, S.maxBombs + 1);
            if (q.k === "fire") S.range = Math.min(8, S.range + 1);
            if (q.k === "speed") S.speed = Math.min(8.4, S.speed + 0.5);
            if (q.k === "life") S.lives = Math.min(9, S.lives + 1);
            io.hud({ lives: S.lives, extra: `${S.maxBombs}x bomb · range ${S.range}` });
          }
        }
        /* --- exit -------------------------------------------------------- */
        if (stage.exit.open && !S.enemies.length &&
            Math.round(S.px - 0.5) === stage.exit.x && Math.round(S.py - 0.5) === stage.exit.y) {
          io.score(500 * S.level);
          io.sfx.clear();
          S.level++;
          io.event("level", { level: S.level });
          newLevel(S.level);
          return;
        }
        /* --- bombs & flames ---------------------------------------------- */
        for (let i = S.bombs.length - 1; i >= 0; i--) {
          const b = S.bombs[i];
          b.fuse -= dt; b.anim += dt;
          if (b.fuse <= 0) { S.bombs.splice(i, 1); boom(b.x, b.y, S.range); }
        }
        for (let i = S.flames.length - 1; i >= 0; i--) {
          const f = S.flames[i];
          f.t -= dt;
          if (f.t <= 0) { S.flames.splice(i, 1); continue; }
          if (Math.abs(f.x + 0.5 - S.px) < 0.72 && Math.abs(f.y + 0.5 - S.py) < 0.72) hurt("a blast");
          for (const e of S.enemies)
            if (e.dead === undefined && Math.abs(f.x + 0.5 - e.x) < 0.72 && Math.abs(f.y + 0.5 - e.y) < 0.72) {
              e.dead = 0.2;
            }
        }
        for (let i = S.enemies.length - 1; i >= 0; i--) {
          const e = S.enemies[i];
          if (e.dead === undefined) continue;
          e.dead -= dt;
          if (e.dead <= 0) {
            S.enemies.splice(i, 1);
            io.score(250);
            io.sfx.coin();
            if (!S.enemies.length) {
              stage.exit.open = true;
              io.hud({ extra: "EXIT OPEN" });
              io.sfx.power();
            }
          }
        }
        /* --- enemies ------------------------------------------------------- */
        for (const e of S.enemies) {
          if (e.dead !== undefined) continue;
          e.anim += dt * 5;
          const es = e.speed * dt;
          const tryDir = ([dx, dy]) => {
            if (!dx && !dy) return false;
            const nx = e.x + dx * es, ny = e.y + dy * es;
            if (solid(nx + dx * 0.32, ny + dy * 0.32)) return false;
            e.x = nx; e.y = ny;
            e.dir = [dx, dy];
            return true;
          };
          if (e.smart) {
            const chase = DIRS.filter(([dx, dy]) => (dx && Math.sign(S.px - e.x) === dx) || (dy && Math.sign(S.py - e.y) === dy));
            let moved = false;
            for (const d of chase.sort(() => Math.random() - 0.5)) if (tryDir(d)) { moved = true; break; }
            if (!moved || Math.random() < 0.02) for (const d of DIRS) if (tryDir(d)) break;
          } else {
            if (!tryDir(e.dir)) e.dir = DIRS[rand(4)];
            if (Math.random() < 0.015) e.dir = DIRS[rand(4)];
          }
          if (Math.abs(e.x - S.px) < 0.62 && Math.abs(e.y - S.py) < 0.62) hurt(e.smart ? "a chaser bot" : "a walker");
        }
        if (S.inv > 0) S.inv -= dt;
        if (S.shake > 0) S.shake -= dt;
      },
      draw(c) {
        c.save();
        if (S.shake > 0) c.translate((Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4);
        rect(c, 0, 0, BW, BH, "#0a0c08");
        for (let y = 0; y < GH; y++)
          for (let x = 0; x < GW; x++) {
            const v = stage.g[y][x], X = x * TS, Y = y * TS;
            if (v === 1) { rect(c, X, Y, TS, TS, "#2f4a68"); rect(c, X + 1, Y + 1, TS - 2, 3, "#41648c"); rect(c, X, Y + TS - 2, TS, 2, "#1d3149"); }
            else if (v === 2) { rect(c, X, Y, TS, TS, "#a4463a"); rect(c, X + 1, Y + 1, TS - 2, TS - 4, "#c25a4a"); rect(c, X, Y + 7, TS, 1, "#7e332b"); }
            else { rect(c, X, Y, TS, TS, "#16261a"); rect(c, X, Y, TS, 1, "#1d3122"); }
          }
        if (stage.exit.open) {
          const X = stage.exit.x * TS, Y = stage.exit.y * TS;
          rect(c, X + 2, Y + 2, TS - 4, TS - 4, "#05070a");
          rect(c, X + 4, Y + 4, TS - 8, TS - 8, Math.floor(S.anim * 3) % 2 ? "#ffd54a" : "#68e0c0");
        }
        for (const q of S.pickups) {
          if (q.hidden) continue;
          const X = q.x * TS, Y = q.y * TS;
          rect(c, X + 2, Y + 3, TS - 4, TS - 6, "#e8ecf3");
          text(c, { bomb: "◆", fire: "▲", speed: ">>", life: "+" }[q.k], X + TS / 2, Y + 4, "#0a0c08", 9, "center");
        }
        for (const b of S.bombs) {
          const p = 1 + Math.sin(b.anim * (b.fuse < 0.7 ? 22 : 8)) * 0.14;
          const X = b.x * TS + TS / 2, Y = b.y * TS + TS / 2;
          rect(c, X - 6 * p, Y - 5 * p, 12 * p, 12 * p, b.fuse < 0.7 && Math.floor(b.anim * 14) % 2 ? "#ff5f6d" : "#2b2f3a");
          rect(c, X - 2, Y - 10 * p, 3, 4, "#ffd54a");
        }
        for (const f of S.flames) {
          const X = f.x * TS, Y = f.y * TS, k = clamp(f.t / 0.55, 0, 1);
          rect(c, X + 1, Y + 1, TS - 2, TS - 2, `rgba(255,${Math.round(150 + k * 80)},${Math.round(40 + k * 120)},${0.4 + k * 0.55})`);
          rect(c, X + 5, Y + 5, TS - 10, TS - 10, "#ffe066");
        }
        for (const e of S.enemies) {
          const X = e.x * TS - TS / 2, Y = e.y * TS - TS / 2, bob = Math.sin(e.anim) * 1.5;
          const col = e.smart ? "#c48bff" : "#ff9a4c";
          rect(c, X + 2, Y + 3 + bob, TS - 4, TS - 6, e.dead !== undefined ? "#ffb0b0" : col);
          rect(c, X + 4, Y + 6 + bob, 3, 3, "#0a0c08");
          rect(c, X + TS - 7, Y + 6 + bob, 3, 3, "#0a0c08");
        }
        if (!(S.inv > 0 && Math.floor(S.inv * 12) % 2)) {
          const PX = S.px * TS - TS / 2, PY = S.py * TS - TS / 2;
          rect(c, PX + 3, PY + 2, TS - 6, TS - 4, "#e8ecf3");
          rect(c, PX + 4, PY + 4, TS - 8, 4, "#4f9dff");
          rect(c, PX + 5 + S.dirX * 2, PY + 9, 2, 2, "#0a0c08");
          rect(c, PX + TS - 7 + S.dirX * 2, PY + 9, 2, 2, "#0a0c08");
          rect(c, PX + 4, PY + TS - 3 - (S.moving && Math.floor(S.anim * 8) % 2 ? 1 : 0), 3, 2, "#2b2f3a");
          rect(c, PX + TS - 7, PY + TS - 3 - (S.moving && Math.floor(S.anim * 8 + 1) % 2 ? 1 : 0), 3, 2, "#2b2f3a");
        }
        c.restore();
        const hy = GH * TS;
        rect(c, 0, hy, BW, 22, "#0a0d08");
        text(c, `BOTS ${S.enemies.length}  BRICKS ${brickCount(stage.g)}`, 4, hy + 12, "#9fb0c8", 7);
        text(c, `BEST ${io.load("best", 0)}`, BW - 4, hy + 12, "#ffd54a", 7, "right");
        if (S.msg) text(c, S.msg, BW / 2, GH * TS / 2, "#fff", 9, "center");
        if (S.over) text(c, "A TO RETRY", BW / 2, GH * TS / 2 + 14, "#8ad7ff", 7, "center");
      },
    };
  },
};
