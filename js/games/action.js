/**
 * Two original action titles for RetroDeck (MIT).
 *
 *   Blitz Hog    - momentum platformer on a heightmap: tucked rolls speed you
 *                  downhill, skids on the dirt, rings in hand, spikes in the
 *                  way, and a goal ring at the end of every zone.
 *   Star Lancer  - vertical shooter: formations, spread power-up, shields and
 *                  a multi-phase boss every fifth wave.
 *
 * Both are built from scratch with original art, audio and level generation -
 * genre mechanics are not copyrightable, so no asset from any real cart lives
 * in here.
 */
import { rect, text, clamp, lerp, rand } from "./engine.js";

/* ------------------------------------------------------------------- Blitz Hog */
const LW = 320, LH = 200;
const COLW = 8;             // heightmap column width
const GRAV = 0.62;
const GROUND = 150;         // baseline ground y

function buildZone(n) {
  const cols = 360 + n * 40;
  const h = new Array(cols).fill(0);
  const type = new Array(cols).fill("dirt");
  let i = 0;
  h[0] = GROUND;
  while (i < cols) {
    const len = 10 + rand(26);
    const kind = i < 12 ? "flat" : ["flat", "up", "down", "flat", "pit", "plateau", "down"][rand(7)];
    const base = h[Math.max(0, i - 1)];
    for (let k = 0; k < len && i + k < cols; k++) {
      const x = i + k;
      if (kind === "flat") h[x] = base;
      else if (kind === "up") h[x] = clamp(base - k * 1.6, 74, GROUND);
      else if (kind === "down") h[x] = clamp(base + k * 1.6, 74, GROUND);
      else if (kind === "plateau") h[x] = clamp(base - 26, 74, GROUND);
      else if (kind === "pit") { h[x] = 999; type[x] = "pit"; }
      else h[x] = base;
    }
    if (kind === "plateau") for (let k = 0; k < 6 && i + len + k < cols; k++) type[i + len + k] = "edge";
    i += len + rand(3);
  }
  // guarantee a sane finish
  for (let x = cols - 24; x < cols; x++) { h[x] = GROUND; type[x] = "dirt"; }
  // hazards + pickups + enemies on top
  const spikes = [], coins = [], bots = [], springs = [];
  for (let x = 20; x < cols - 26; x += 3 + rand(6)) {
    if (type[x] === "pit" || h[x] > 900) continue;
    const r = Math.random();
    if (r < 0.16) { const w = 2 + rand(3); for (let k = 0; k < w; k++) spikes.push({ c: x + k }); x += w; }
    else if (r < 0.62) { const w = 3 + rand(5); for (let k = 0; k < w; k++) coins.push({ c: x + k, y: h[x] - 18 - (k % 2 ? 12 : 0) }); x += w; }
    else if (r < 0.72) springs.push({ c: x, y: h[x] });
  }
  for (let x = 30; x < cols - 30; x += 26 + rand(40))
    if (type[x] !== "pit" && h[x] < 900)
      bots.push({ px: x * COLW + COLW / 2, dir: Math.random() < 0.5 ? -1 : 1, alive: true, anim: rand(6), speed: 26 + n * 4 });
  return { cols, h, type, spikes, coins, bots, springs, goal: (cols - 16) * COLW, len: cols * COLW };
}

export const Blitz = {
  id: "blitz",
  title: "Blitz Hog",
  system: "segaMD",
  pad: "md3",
  genre: "Action",
  year: 2026,
  w: LW,
  h: LH,
  blurb: "Roll fast, jump further. Spikes cost you every ring you were carrying - so don't get greedy.",
  howto: "D-pad runs · A or B jumps (hold for height) · C / R tucks for rolls · down+left skids",
  create(ctx, io0) {
    const io = io0;
    let zone = buildZone(1);
    const P = {
      x: 30, y: 0, vx: 0, vy: 0, onGround: true, tuck: false, rings: 0,
      lives: 3, inv: 0, anim: 0, skid: false, jumpHeld: false, coyote: 0, airJumps: 0, face: 1,
    };
    let cam = 0, started = false, over = false, zoneN = 1, t0 = 0, timeS = 0, msg = "PRESS  START";
    let parts = [], shake = 0;
    P.y = GROUND - 16;

    const groundAt = (px) => {
      const c = clamp(Math.floor(px / COLW), 0, zone.cols - 1);
      return zone.h[c] > 900 ? LH + 60 : zone.h[c];
    };
    const slopeAt = (px) => {
      const a = groundAt(px - 6), b = groundAt(px + 6);
      return (b - a) / 12;
    };
    function puff(x, y, col, n = 6, spd = 2) {
      for (let i = 0; i < n; i++) parts.push({ x, y, vx: (Math.random() - 0.5) * spd * 2, vy: -Math.random() * spd, t: 0.45 + Math.random() * 0.3, col });
    }
    function respawn() {
      const c = clamp(Math.floor(P.x / COLW), 0, zone.cols - 1);
      // walk left until solid ground
      let k = c;
      while (k > 0 && (zone.h[k] > 900 || zone.type[k] === "pit")) k--;
      P.x = k * COLW + COLW / 2;
      P.y = (zone.h[k] > 900 ? GROUND : zone.h[k]) - 16;
      P.vx = P.vy = 0;
      P.inv = 1.6;
    }
    function nextZone() {
      zoneN++;
      io.score(500 * Math.max(1, Math.round(60 - timeS)) + P.rings * 10);
      io.sfx.clear();
      io.event("level", { level: zoneN });
      zone = buildZone(zoneN);
      P.x = 30; P.y = GROUND - 16; P.vx = 0; P.vy = 0; P.rings = Math.floor(P.rings * 0.5);
      t0 = io.time; timeS = 0;
      io.hud({ level: zoneN, lives: P.lives, extra: `ZONE ${zoneN}` });
    }
    io.hud({ level: 1, lives: 3, extra: "ZONE 1" });

    return {
      bg: "#123a5e",
      reset() {
        P.lives = 3; P.rings = 0; over = false; started = true;
        zoneN = 1; zone = buildZone(1);
        P.x = 30; P.y = GROUND - 16; P.vx = P.vy = 0; P.inv = 0;
        io.setScore(0);
        t0 = io.time; timeS = 0;
        msg = "";
        io.hud({ level: 1, lives: 3, extra: "ZONE 1" });
      },
      update(dt) {
        const inp = io.input;
        if (inp.pressed("start") || inp.pressed("a")) {
          if (!started || over) { this.reset(); return; }
        }
        if (!started || over) return;
        timeS = io.time - t0;
        const ax = inp.axis();
        const speedCap = 3.6 + zoneN * 0.12;
        const holding = inp.down("b") || inp.down("c") || inp.down("right2");
        P.tuck = holding && P.onGround;
        P.skid = ax.x !== 0 && ax.x * P.vx < -0.4 && P.onGround && !inp.down("up");

        /* horizontal: accel on dirt, gravity-assist on slopes */
        const slope = slopeAt(P.x);
        if (P.skid) {
          P.vx = lerp(P.vx, -Math.sign(P.vx) * 1.2, 0.3);
          if (Math.random() < 0.6) puff(P.x, P.y + 14, "#d8c48a", 2, 1.4);
        } else if (ax.x) {
          const acc = P.onGround ? (P.tuck ? 0.14 : 0.32) : 0.2;
          P.vx += ax.x * acc;
          P.face = Math.sign(ax.x);
          if (P.tuck && P.onGround) P.vx += slope * 0.9;      // downhill roll
        } else {
          P.vx = lerp(P.vx, 0, P.onGround ? 0.16 : 0.03);
        }
        if (P.onGround) P.vx -= slope * 0.42;                  // slopes always pull
        P.vx = clamp(P.vx, -(P.tuck ? speedCap * 1.55 : speedCap), P.tuck ? speedCap * 1.55 : speedCap);

        /* jump */
        if ((inp.pressed("a") || inp.pressed("b")) && (P.onGround || P.coyote > 0)) {
          P.vy = -8.2 - clamp(Math.abs(P.vx) * 0.28, 0, 2.1);
          P.onGround = false; P.coyote = 0; P.jumpHeld = true;
          io.sfx.tone(560, 0.09, "triangle", 0.5, 380);
          puff(P.x, P.y + 15, "#e8ecf3", 5, 1.6);
        }
        if (!P.jumpHeld && P.vy < -3) P.vy = -3;
        if (inp.down("a") || inp.down("b")) P.jumpHeld = true;
        else P.jumpHeld = false;

        /* integrate + terrain */
        P.vy += GRAV;
        P.x += P.vx;
        P.y += P.vy;
        const g = groundAt(P.x);
        if (P.y + 16 >= g) {
          if (!P.onGround && P.vy > 4) { puff(P.x, g, "#d8c48a", 6, 1.8); shake = 0.12; }
          P.y = g - 16;
          P.vy = 0;
          P.onGround = true;
          P.coyote = 0.12;
        } else {
          P.onGround = false;
          P.coyote -= dt;
        }
        if (P.onGround) P.anim += Math.abs(P.vx) * dt * 3.4;
        if (P.x < 4) { P.x = 4; P.vx = Math.max(0, P.vx); }

        /* springs */
        for (const s of zone.springs) {
          const sx = s.c * COLW + COLW / 2;
          if (Math.abs(sx - P.x) < 12 && P.y + 16 > s.y - 10 && P.y + 16 < s.y + 12 && P.vy >= 0) {
            P.vy = -12.4; P.onGround = false;
            io.sfx.tone(300, 0.14, "square", 0.5, 900);
            puff(sx, s.y, "#ffd54a", 8, 2.4);
          }
        }
        /* coins */
        for (const q of zone.coins) {
          if (q.got) continue;
          const cx = q.c * COLW + COLW / 2;
          if (Math.abs(cx - P.x) < 11 && Math.abs(q.y - (P.y + 8)) < 15) {
            q.got = true; P.rings++;
            io.score(10);
            io.sfx.coin();
            puff(cx, q.y, "#ffd54a", 4, 1.4);
          }
        }
        /* spikes */
        for (const s of zone.spikes) {
          const sx = s.c * COLW + COLW / 2;
          const gy = zone.h[s.c] > 900 ? LH + 60 : zone.h[s.c];
          if (Math.abs(sx - P.x) < 10 && P.y + 16 > gy - 10) hit("spikes");
        }
        /* bots */
        for (const b of zone.bots) {
          if (!b.alive) continue;
          b.anim += dt * 4;
          const col = clamp(Math.floor(b.px / COLW), 0, zone.cols - 1);
          const gy = zone.h[col];
          const next = clamp(col + b.dir, 0, zone.cols - 1);
          const turnBack =
            next === col || zone.h[next] > 900 || zone.type[next] === "pit" || Math.abs(zone.h[next] - gy) > 20;
          if (turnBack) b.dir *= -1;
          else b.px = clamp(b.px + b.dir * b.speed * dt, COLW, zone.len - COLW);
          const by = zone.h[clamp(Math.floor(b.px / COLW), 0, zone.cols - 1)];
          b.y = by > 900 ? LH : by;
          if (Math.abs(b.px - P.x) < 13 && P.y + 16 > b.y - 16 && P.y + 16 < b.y + 6) {
            if (P.vy > 1.4 && P.y + 16 < b.y - 8) {
              b.alive = false;
              P.vy = -7.4;
              io.score(150);
              io.sfx.bump();
              puff(b.px, b.y - 8, "#c48bff", 10, 2.6);
            } else hit("a grinder bot");
          }
        }
        /* pit death */
        if (P.y > LH + 40) {
          P.lives--;
          io.sfx.death();
          io.hud({ lives: P.lives });
          if (P.lives <= 0) return die("the pit");
          P.rings = 0;
          respawn();
        }
        /* goal */
        if (P.x > zone.goal) { nextZone(); return; }
        if (P.inv > 0) P.inv -= dt;
        if (shake > 0) shake -= dt;
        for (let i = parts.length - 1; i >= 0; i--) {
          const p = parts[i];
          p.x += p.vx; p.y += p.vy; p.vy += 0.12; p.t -= dt;
          if (p.t <= 0) parts.splice(i, 1);
        }
        cam = clamp(P.x - LW * 0.36, 0, zone.len - LW);
        io.hud({ extra: `${P.rings} RINGS` });
        function hit(what) {
          if (P.inv > 0) return;
          if (P.rings > 0) {
            P.inv = 1.3;
            P.rings = 0;
            P.vy = -5.2;
            shake = 0.3;
            io.sfx.death();
            puff(P.x, P.y + 6, "#ffd54a", 14, 3.4);
            io.hud({ extra: "RINGS LOST" });
          } else return die(what);
        }
        function die(what) {
          P.lives--;
          io.hud({ lives: P.lives });
          P.rings = 0;
          if (P.lives <= 0) {
            over = true;
            io.save("best", Math.max(io.load("best", 0), io.getScore()));
            io.over(`Taken out by ${what} in zone ${zoneN}`);
            io.sfx.death();
            msg = `OUT BY ${what.toUpperCase()}`;
            P.lives = 3;
            io.hud({ lives: 3 });
          } else respawn();
        }
      },
      draw(c) {
        c.save();
        if (shake > 0) c.translate((Math.random() - 0.5) * 5, (Math.random() - 0.5) * 5);
        /* sky + parallax */
        const grd = c.createLinearGradient(0, 0, 0, LH);
        grd.addColorStop(0, "#1f5f9e");
        grd.addColorStop(0.55, "#3f9ad0");
        grd.addColorStop(1, "#8ed0e8");
        c.fillStyle = grd;
        c.fillRect(0, 0, LW, LH);
        for (const [layer, col, speed, base] of [[0, "#2a6fa0", 0.15, 120], [1, "#2f7d55", 0.35, 142]]) {
          c.fillStyle = col;
          c.beginPath();
          const off = cam * speed;
          for (let x = -20; x <= LW + 20; x += 8) {
            const y = base + Math.sin((x + off) * 0.012 + layer) * 18 + Math.sin((x + off) * 0.031) * 8;
            if (x === -20) c.moveTo(x, y);
            else c.lineTo(x, y);
          }
          c.lineTo(LW + 20, LH);
          c.lineTo(-20, LH);
          c.closePath();
          c.fill();
        }
        /* terrain */
        const c0 = clamp(Math.floor(cam / COLW) - 1, 0, zone.cols - 1);
        const c1 = clamp(c0 + Math.ceil(LW / COLW) + 2, 0, zone.cols - 1);
        c.fillStyle = "#6b4a2a";
        c.beginPath();
        c.moveTo(c0 * COLW - cam, LH);
        for (let i = c0; i <= c1; i++) {
          const gy = zone.h[i] > 900 ? LH + 40 : zone.h[i];
          c.lineTo(i * COLW - cam, gy);
        }
        c.lineTo(c1 * COLW - cam, LH);
        c.closePath();
        c.fill();
        for (let i = c0; i <= c1; i++) {
          if (zone.h[i] > 900) continue;
          const X = i * COLW - cam, Y = zone.h[i];
          c.fillStyle = (i % 2) ? "#8fd06a" : "#7bc256";
          c.fillRect(X, Y, COLW, 5);
          c.fillStyle = (Math.floor(i / 2) % 2) ? "#4a3320" : "#5b3f26";
          c.fillRect(X, Y + 5, COLW, 5);
        }
        /* springs */
        for (const s of zone.springs) {
          const X = s.c * COLW - cam;
          if (X < -20 || X > LW + 20) continue;
          rect(c, X + 1, s.y - 5, COLW - 2, 5, "#c9d4e4");
          rect(c, X + 2, s.y - 8, COLW - 4, 3, "#ff5f6d");
        }
        /* spikes */
        c.fillStyle = "#c9d4e4";
        for (const s of zone.spikes) {
          const X = s.c * COLW - cam;
          if (X < -20 || X > LW + 20) continue;
          const Y = zone.h[s.c] > 900 ? LH : zone.h[s.c];
          c.beginPath();
          c.moveTo(X, Y);
          c.lineTo(X + COLW / 2, Y - 10);
          c.lineTo(X + COLW, Y);
          c.closePath();
          c.fill();
        }
        /* coins */
        for (const q of zone.coins) {
          if (q.got) continue;
          const X = q.c * COLW + COLW / 2 - cam;
          if (X < -12 || X > LW + 12) continue;
          const wob = Math.abs(Math.sin(io.time * 4 + q.c)) * 5 + 2;
          c.strokeStyle = "#ffd54a";
          c.lineWidth = 2;
          c.beginPath();
          c.ellipse(X, q.y, wob / 2, 4, 0, 0, Math.PI * 2);
          c.stroke();
        }
        /* bots */
        for (const b of zone.bots) {
          if (!b.alive) continue;
          const X = b.px - cam, Y = b.y ?? LH;
          if (X < -20 || X > LW + 20) continue;
          rect(c, X - 9, Y - 14, 18, 12, "#7b3fa0");
          rect(c, X - 7, Y - 11, 5, 4, "#ffe066");
          rect(c, X + 2, Y - 11, 5, 4, "#ffe066");
          rect(c, X - 10, Y - 3 + (Math.floor(b.anim) % 2 ? 1 : 0), 6, 3, "#2b2f3a");
          rect(c, X + 4, Y - 3 + (Math.floor(b.anim + 1) % 2 ? 1 : 0), 6, 3, "#2b2f3a");
        }
        /* goal */
        const GX = zone.goal - cam;
        if (GX < LW + 40) {
          rect(c, GX - 3, GROUND - 54, 6, 54, "#e8ecf3");
          const flag = Math.floor(io.time * 3) % 2;
          rect(c, GX, GROUND - 52, 22, 12, flag ? "#ffd54a" : "#ff9a4c");
          text(c, "GOAL", GX + 11, GROUND - 46, "#0a0c08", 7, "center");
        }
        /* player */
        const PX = P.x - cam, PY = P.y;
        if (!(P.inv > 0 && Math.floor(P.inv * 14) % 2)) {
          const spin = P.tuck && P.onGround;
          if (spin) {
            c.save();
            c.translate(PX, PY + 8);
            c.rotate(P.anim * P.face * 2.2);
            rect(c, -9, -9, 18, 18, "#2a6cf0");
            for (let i = 0; i < 5; i++) {
              c.save();
              c.rotate((i / 5) * Math.PI * 2);
              rect(c, -2, -13, 4, 6, "#e8ecf3");
              c.restore();
            }
            c.restore();
          } else {
            rect(c, PX - 9, PY + 1, 18, 15, "#2a6cf0");
            rect(c, PX - 8 + (P.face > 0 ? 8 : 0), PY - 4, 8, 6, "#2a6cf0");
            for (let i = 0; i < 4; i++) rect(c, PX - 7 + i * 4, PY - 6 + (i % 2 ? 1 : 0), 3, 5, "#e8ecf3");
            rect(c, PX + (P.face > 0 ? 2 : -4), PY + 1, 3, 3, "#ffe066");
            rect(c, PX - 6, PY + 15 + (Math.floor(P.anim) % 2 ? 1 : 0), 5, 3, "#e08c2a");
            rect(c, PX + 2, PY + 15 + (Math.floor(P.anim + 0.5) % 2 ? 1 : 0), 5, 3, "#e08c2a");
          }
        }
        /* particles */
        for (const p of parts) rect(c, p.x - cam - 1, p.y - 1, 3, 3, p.col);
        c.restore();
        /* HUD band */
        rect(c, 0, 0, LW, 20, "#0a1622cc");
        text(c, `RINGS ${P.rings}`, 6, 12, "#ffd54a", 7);
        text(c, `ZONE ${zoneN}`, LW / 2 - 18, 12, "#e8ecf3", 7);
        text(c, `TIME ${Math.min(999, Math.floor(timeS))}`, LW - 66, 12, "#8ad7ff", 7);
        text(c, `BEST ${io.load("best", 0)}`, LW - 6, 12, "#ffd54a", 7, "right");
        if (msg) text(c, msg, LW / 2, LH / 2 - 8, "#fff", 9, "center");
        if (!started) text(c, "A / START TO RUN", LW / 2, LH / 2 + 10, "#8ad7ff", 7, "center");
        if (over) text(c, "A TO RETRY", LW / 2, LH / 2 + 10, "#8ad7ff", 7, "center");
      },
    };
  },
};

/* ------------------------------------------------------------------ Star Lancer */
const SW = 224, SH = 192;
const PAD = 8;

export const Lancer = {
  id: "lancer",
  title: "Star Lancer",
  system: "arcade",
  pad: "arcade4",
  genre: "Shooter",
  year: 2026,
  w: SW,
  h: SH,
  blurb: "Eight waves to the boss, and the boss has three moods. Grab the W to widen your spread.",
  howto: "Stick/D-pad flies · A fires (hold to stream) · B drops a Nova · don't fly into the rocks",
  create(ctx, io0) {
    const io = io0;
    const ship = { x: SW / 2, y: SH - 30, vx: 0, vy: 0, spd: 168, spread: 1, shield: 0, inv: 0, lives: 3, fire: 0, power: 0 };
    let bullets = [], ebul = [], foes = [], parts = [], pickups = [], stars = [];
    let wave = 0, started = false, over = false, msg = "INSERT COIN - PRESS A", boss = null, spawnQueue = [], spawnT = 0, shake = 0;
    const rnd = Math.random;
    for (let i = 0; i < 70; i++) stars.push({ x: rnd() * SW, y: rnd() * SH, s: 0.4 + rnd() * 1.8, v: 12 + rnd() * 60 });
    function burst(x, y, col, n = 12, spd = 90) {
      for (let i = 0; i < n; i++) {
        const a = rnd() * Math.PI * 2, v = spd * (0.3 + rnd() * 0.8);
        parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0.35 + rnd() * 0.5, col });
      }
    }
    function startWave(n) {
      wave = n;
      spawnQueue = [];
      if (n % 5 === 0) {
        boss = { x: SW / 2, y: -30, hp: 22 + n * 4, max: 22 + n * 4, t: 0, phase: 0, fire: 1.4, dir: 1, hit: 0 };
        io.hud({ extra: "CAPITAL SHIP" });
        io.sfx.power();
        return;
      }
      const kind = n % 4;
      if (kind === 0) for (let r = 0; r < 3; r++) for (let i = 0; i < 6 + r; i++) spawnQueue.push({ t: r * 0.55 + i * 0.12, k: "liner", x: 22 + i * 30, y: -18 - r * 14 });
      else if (kind === 1) for (let i = 0; i < 9; i++) spawnQueue.push({ t: i * 0.2, k: "weaver", x: 24 + (i % 3) * 66, y: -20 - Math.floor(i / 3) * 26 });
      else if (kind === 2) for (let i = 0; i < 6; i++) spawnQueue.push({ t: i * 0.5, k: "rock", x: 16 + rnd() * (SW - 32), y: -22 - rnd() * 40 });
      else { for (let i = 0; i < 5; i++) spawnQueue.push({ t: i * 0.42, k: "liner", x: 20 + i * 40, y: -16 }); for (let i = 0; i < 4; i++) spawnQueue.push({ t: 2.4 + i * 0.3, k: "kamikaze", x: 20 + rnd() * (SW - 40), y: -18 }); }
      io.hud({ extra: `WAVE ${n}` });
    }
    function damage() {
      if (ship.inv > 0) return;
      if (ship.shield > 0) {
        ship.shield = 0;
        ship.inv = 1.0;
        io.sfx.bump();
        burst(ship.x, ship.y, "#68e0c0", 14, 110);
        return;
      }
      ship.lives--;
      ship.spread = 1;
      io.sfx.death();
      burst(ship.x, ship.y, "#ff5f6d", 22, 130);
      shake = 0.35;
      io.hud({ lives: ship.lives });
      if (ship.lives <= 0) {
        over = true;
        io.save("best", Math.max(io.load("best", 0), io.getScore()));
        io.over(`Wrecked on wave ${wave}`);
        msg = "SHIP LOST";
      } else { ship.inv = 2.2; ship.x = SW / 2; ship.y = SH - 30; }
    }
    startWave(1);
    io.hud({ level: 1, lives: 3, extra: "WAVE 1" });

    return {
      bg: "#05060f",
      reset() {
        ship.lives = 3; ship.spread = 1; ship.shield = 0; ship.inv = 1.2;
        ship.x = SW / 2; ship.y = SH - 30; ship.vx = ship.vy = 0;
        bullets = []; ebul = []; foes = []; parts = []; pickups = []; boss = null;
        over = false; started = true; msg = "";
        io.setScore(0);
        startWave(1);
      },
      update(dt) {
        const inp = io.input;
        if (inp.pressed("a") || inp.pressed("start")) {
          if (!started || over) { this.reset(); return; }
        }
        /* stars always drift */
        for (const s of stars) {
          s.y += s.v * dt;
          if (s.y > SH) { s.y = -2; s.x = rnd() * SW; }
        }
        for (let i = parts.length - 1; i >= 0; i--) {
          const p = parts[i];
          p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 40 * dt; p.t -= dt;
          if (p.t <= 0) parts.splice(i, 1);
        }
        if (shake > 0) shake -= dt;
        if (!started || over) return;

        /* fly */
        const a = inp.axis();
        ship.vx = lerp(ship.vx, a.x * ship.spd, 0.34);
        ship.vy = lerp(ship.vy, a.y * ship.spd, 0.34);
        ship.x = clamp(ship.x + ship.vx * dt, 8, SW - 8);
        ship.y = clamp(ship.y + ship.vy * dt, 24, SH - 8);
        if (ship.inv > 0) ship.inv -= dt;
        /* fire */
        ship.fire -= dt;
        const rate = inp.down("a") || inp.down("y") ? 0.13 : 0.5;
        if ((inp.down("a") || inp.down("y") || io.cfg?.autoFire) && ship.fire <= 0) {
          ship.fire = rate;
          const n = ship.spread;
          for (let i = 0; i < n; i++) {
            const off = (i - (n - 1) / 2) * 6;
            bullets.push({ x: ship.x + off, y: ship.y - 8, vx: off * 5, vy: -330 });
          }
          io.sfx.tone(1050, 0.04, "square", 0.24);
          ship.power += 1;
        }
        if (inp.pressed("b") || inp.pressed("x")) {
          if (ship.shield <= 0) {
            ship.shield = 1;
            io.sfx.power();
            io.hud({ extra: "SHIELD UP" });
          } else {
            // nova: wipe every small shot and hurt everything on screen
            ebul.length = 0;
            for (const f of foes) f.hp -= 3;
            if (boss) boss.hp -= 4;
            shake = 0.4;
            io.sfx.boom();
            burst(ship.x, ship.y, "#8ad7ff", 30, 200);
          }
        }
        for (let i = bullets.length - 1; i >= 0; i--) {
          const b = bullets[i];
          b.x += b.vx * dt; b.y += b.vy * dt;
          if (b.y < -10 || b.x < -6 || b.x > SW + 6) bullets.splice(i, 1);
        }
        /* spawn queue */
        if (spawnQueue.length) {
          spawnT += dt;
          while (spawnQueue.length && spawnQueue[0].t <= spawnT) {
            const s = spawnQueue.shift();
            foes.push({
              k: s.k, x: s.x, y: s.y, hp: s.k === "rock" ? 3 : 1, t: 0,
              vx: s.k === "weaver" ? 60 : s.k === "kamikaze" ? 0 : 10,
              vy: s.k === "kamikaze" ? 150 : 42 + wave * 3, fire: 0.8 + rnd(),
              seed: rnd() * 6, spin: 0,
            });
          }
        }
        /* foes */
        for (let i = foes.length - 1; i >= 0; i--) {
          const f = foes[i];
          f.t += dt;
          if (f.k === "weaver") { f.x += Math.sin(f.t * 3 + f.seed) * 70 * dt; f.y += f.vy * dt; }
          else if (f.k === "kamikaze") { f.vx = lerp(f.vx, clamp(ship.x - f.x, -110, 110), 0.05); f.x += f.vx * dt; f.y += f.vy * dt; }
          else if (f.k === "rock") { f.x += f.vx * dt; f.y += f.vy * dt; f.spin += dt * 3; }
          else { f.x += f.vx * dt; f.y += f.vy * dt; }
          if (f.k === "liner" || f.k === "weaver") {
            f.fire -= dt;
            if (f.fire <= 0 && f.y > 10 && f.y < SH - 40) {
              f.fire = 1.9 + rnd() * 1.4;
              const ang = Math.atan2(ship.y - f.y, ship.x - f.x);
              ebul.push({ x: f.x, y: f.y + 6, vx: Math.cos(ang) * 90, vy: Math.sin(ang) * 90 });
              io.sfx.tone(300, 0.04, "sawtooth", 0.16);
            }
          }
          if (f.hp <= 0) {
            foes.splice(i, 1);
            io.score(f.k === "rock" ? 60 : 40);
            io.sfx.coin();
            burst(f.x, f.y, "#ff9a4c", 12, 110);
            if (rnd() < (f.k === "rock" ? 0.35 : 0.14)) pickups.push({ x: f.x, y: f.y, k: rnd() < 0.55 ? "W" : rnd() < 0.6 ? "S" : "L", vy: 46 });
            continue;
          }
          if (f.y > SH + 20) { foes.splice(i, 1); continue; }
          if (Math.abs(f.x - ship.x) < 10 && Math.abs(f.y - ship.y) < 10) { f.hp = 0; damage(); }
        }
        /* enemy shots */
        for (let i = ebul.length - 1; i >= 0; i--) {
          const b = ebul[i];
          b.x += b.vx * dt; b.y += b.vy * dt;
          if (b.y > SH + 8 || b.y < -8 || b.x < -8 || b.x > SW + 8) { ebul.splice(i, 1); continue; }
          if (Math.abs(b.x - ship.x) < 7 && Math.abs(b.y - ship.y) < 7) { ebul.splice(i, 1); damage(); }
        }
        /* player shots vs foes handled above via hp; rocks take hits here */
        for (const b of bullets) {
          for (const f of foes) {
            if (Math.abs(b.x - f.x) < (f.k === "rock" ? 11 : 9) && Math.abs(b.y - f.y) < 9) {
              f.hp -= 1;
              b.y = -99;
              io.sfx.tone(760, 0.02, "square", 0.14);
              break;
            }
          }
          if (boss && Math.abs(b.x - boss.x) < 20 && Math.abs(b.y - boss.y) < 14) {
            boss.hp -= 1; boss.hit = 0.1; b.y = -99;
            io.sfx.tone(900, 0.02, "square", 0.18);
          }
        }
        bullets = bullets.filter((b) => b.y > -50);
        /* pickups */
        for (let i = pickups.length - 1; i >= 0; i--) {
          const q = pickups[i];
          q.y += q.vy * dt;
          if (q.y > SH + 10) { pickups.splice(i, 1); continue; }
          if (Math.abs(q.x - ship.x) < 12 && Math.abs(q.y - ship.y) < 12) {
            pickups.splice(i, 1);
            io.sfx.power();
            io.score(80);
            if (q.k === "W") ship.spread = Math.min(5, ship.spread + 1);
            if (q.k === "S") { ship.shield = 2; ship.spread = Math.min(5, ship.spread + 1); }
            if (q.k === "L") { ship.lives = Math.min(6, ship.lives + 1); io.hud({ lives: ship.lives }); }
            io.hud({ extra: `SPREAD x${ship.spread}` });
          }
        }
        /* boss */
        if (boss) {
          boss.t += dt;
          boss.y = lerp(boss.y, 44, 0.03);
          boss.x = SW / 2 + Math.sin(boss.t * (0.7 + boss.phase * 0.4)) * (44 + boss.phase * 22);
          if (boss.hit > 0) boss.hit -= dt;
          const frac = boss.hp / boss.max;
          boss.phase = frac > 0.66 ? 0 : frac > 0.33 ? 1 : 2;
          boss.fire -= dt;
          if (boss.fire <= 0 && boss.y > 20) {
            boss.fire = [1.15, 0.85, 0.6][boss.phase];
            const n = 3 + boss.phase * 2;
            for (let i = 0; i < n; i++) {
              const ang = Math.PI / 2 + (i - (n - 1) / 2) * 0.28 + Math.sin(boss.t) * 0.2;
              ebul.push({ x: boss.x, y: boss.y + 10, vx: Math.cos(ang) * 105, vy: Math.sin(ang) * 105 });
            }
            if (boss.phase === 2) {
              const ang = Math.atan2(ship.y - boss.y, ship.x - boss.x);
              for (let i = -1; i <= 1; i++) ebul.push({ x: boss.x, y: boss.y + 10, vx: Math.cos(ang + i * 0.16) * 150, vy: Math.sin(ang + i * 0.16) * 150 });
            }
            io.sfx.tone(220, 0.06, "sawtooth", 0.2);
          }
          if (Math.abs(boss.x - ship.x) < 22 && Math.abs(boss.y - ship.y) < 16) damage();
          if (boss.hp <= 0) {
            io.score(1500 + wave * 200);
            io.sfx.clear();
            burst(boss.x, boss.y, "#ff5f6d", 60, 190);
            burst(boss.x, boss.y, "#ffd54a", 40, 130);
            shake = 0.7;
            boss = null;
            ebul.length = 0;
            io.save("best", Math.max(io.load("best", 0), io.getScore()));
            io.event("boss", { wave });
            for (let i = 0; i < 5; i++) pickups.push({ x: 40 + i * 34, y: 30, k: ["W", "S", "W", "L", "S"][i], vy: 40 });
            startWave(wave + 1);
          }
        } else if (!foes.length && !spawnQueue.length) {
          spawnT = 0;
          startWave(wave + 1);
          io.score(200);
        }
        io.hud({ level: wave, lives: ship.lives });
      },
      draw(c) {
        c.save();
        if (shake > 0) c.translate((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6);
        rect(c, 0, 0, SW, SH, "#05060f");
        for (const s of stars) rect(c, s.x, s.y, s.s > 1.4 ? 2 : 1, s.s > 1.4 ? 2 : 1, s.s > 1.4 ? "#cfe0ff" : "#5a6f96");
        /* pickups */
        for (const q of pickups) {
          rect(c, q.x - 6, q.y - 6, 12, 12, "#0a1020");
          rect(c, q.x - 6, q.y - 6, 12, 2, "#68e0c0");
          text(c, q.k, q.x, q.y - 4, "#ffd54a", 8, "center");
        }
        /* player shots */
        for (const b of bullets) rect(c, b.x - 1, b.y - 5, 2, 9, "#8ad7ff");
        for (const b of ebul) rect(c, b.x - 2, b.y - 2, 4, 4, "#ff5f6d");
        /* foes */
        for (const f of foes) {
          if (f.k === "rock") {
            c.save();
            c.translate(f.x, f.y);
            c.rotate(f.spin);
            rect(c, -9, -8, 18, 16, "#6b5a4a");
            rect(c, -5, -4, 5, 4, "#8f7a63");
            c.restore();
          } else if (f.k === "kamikaze") {
            rect(c, f.x - 7, f.y - 6, 14, 12, "#ff9a4c");
            rect(c, f.x - 3, f.y + 4, 6, 4, "#ffe066");
          } else if (f.k === "weaver") {
            rect(c, f.x - 10, f.y - 4, 20, 8, "#c48bff");
            rect(c, f.x - 3, f.y - 7, 6, 6, "#e8ecf3");
          } else {
            rect(c, f.x - 9, f.y - 5, 18, 10, "#5ad05a");
            rect(c, f.x - 4, f.y - 2, 8, 4, "#0a0c08");
          }
        }
        /* boss */
        if (boss) {
          const col = boss.hit > 0 ? "#ffffff" : "#a55bd6";
          rect(c, boss.x - 28, boss.y - 12, 56, 24, col);
          rect(c, boss.x - 40, boss.y - 4, 12, 12, "#7b3fa0");
          rect(c, boss.x + 28, boss.y - 4, 12, 12, "#7b3fa0");
          rect(c, boss.x - 8, boss.y + 10, 16, 6, "#ffd54a");
          rect(c, boss.x - 16, boss.y - 6, 8, 6, "#0a0c08");
          rect(c, boss.x + 8, boss.y - 6, 8, 6, "#0a0c08");
          rect(c, 16, 14, SW - 32, 4, "#241f38");
          rect(c, 16, 14, (SW - 32) * clamp(boss.hp / boss.max, 0, 1), 4, "#ff5f6d");
        }
        /* ship */
        if (!(ship.inv > 0 && Math.floor(ship.inv * 14) % 2)) {
          rect(c, ship.x - 3, ship.y + 6, 6, 6 + (io.time * 30 % 4), "#ff9a4c");
          rect(c, ship.x - 10, ship.y - 2, 20, 8, "#e8ecf3");
          rect(c, ship.x - 3, ship.y - 9, 6, 9, "#4f9dff");
          rect(c, ship.x - 12, ship.y + 1, 4, 5, "#8ad7ff");
          rect(c, ship.x + 8, ship.y + 1, 4, 5, "#8ad7ff");
        }
        if (ship.shield > 0) {
          c.strokeStyle = ship.shield > 1 ? "#68e0c0" : "#2fbfa0";
          c.lineWidth = 2;
          c.beginPath();
          c.arc(ship.x, ship.y, 15 + Math.sin(io.time * 8) * 1.4, 0, Math.PI * 2);
          c.stroke();
        }
        for (const p of parts) rect(c, p.x - 1, p.y - 1, 3, 3, p.col);
        c.restore();
        rect(c, 0, SH - PAD, SW, PAD, "#0a1020");
        text(c, `W${wave}`, 4, SH - PAD + 6, "#9fb0c8", 6);
        text(c, `SPx${ship.spread}`, SW - 34, SH - PAD + 6, "#8ad7ff", 6);
        if (msg) text(c, msg, SW / 2, SH / 2, "#fff", 9, "center");
        if (!started) text(c, "PRESS A", SW / 2, SH / 2 + 12, "#8ad7ff", 7, "center");
        if (over) text(c, "A TO RETRY", SW / 2, SH / 2 + 12, "#8ad7ff", 7, "center");
      },
    };
  },
};
