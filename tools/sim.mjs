/**
 * Headless smoke-run of the built-in games.
 *
 * The games are plain canvas apps, so they can be driven from node with a
 * recording 2D-context stub and a fake RetroDeck `io` object. That catches the
 * class of bug the type of bug `node --check` cannot see: a typo inside a
 * branch that only runs on frame 400 (a ghost leaving its house, a boss dying,
 * a line clear) throws a ReferenceError at the player, on a phone.
 *
 * Usage:  node tools/sim.mjs [frames]
 * Exit:   0 all games survived, 1 something threw.
 */
const FRAMES = Number(process.argv[2] || 1800);

/** Any property read returns a no-op; unknown assignments are tolerated. */
function stubCtx() {
  const state = { calls: 0 };
  const grad = { addColorStop() {} };
  const target = { canvas: { width: 320, height: 240 } };
  return new Proxy(target, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === "createLinearGradient" || k === "createRadialGradient" || k === "createPattern") return () => grad;
      if (k === "measureText") return () => ({ width: 8 });
      if (typeof k === "string" && /^(fillStyle|strokeStyle|font|textAlign|textBaseline|globalAlpha|lineWidth|lineCap|lineJoin|imageSmoothingEnabled|globalCompositeOperation)$/.test(k)) return "#000";
      return (...args) => {
        state.calls++;
        for (const a of args) if (typeof a === "number" && !Number.isFinite(a)) throw new Error(`non-finite argument to ctx.${String(k)}: ${args.join(", ")}`);
        return undefined;
      };
    },
    set() { return true; },
  });
}

/** Input surface: a script of key hold-presses that walks the pad around. */
function makeInput(profile = "cycle") {
  const held = new Set();
  const seq = profile === "sprint"
    ? [["right"], ["right", "a"], ["right", "b"], ["right", "up"], ["right", "down", "a"],
       ["right", "a", "b"], ["right", "c"], ["right", "up", "a"], ["right", "x"], ["right", "a"],
       ["left", "down"], ["right", "select"], ["right", "start", "a"], ["down", "b"], ["right", "a"]]
    : [
    ["right"], ["right", "a"], ["down"], ["down", "b"], ["left"], ["up"], ["up", "a"],
    ["left", "b"], ["right", "up"], ["start"], ["select"], ["a", "b"], ["down", "right2"],
    ["left", "y"], ["x"], ["b"], ["coin"], ["a"],
  ];
  let idx = 0;
  let queue = [];
  return {
    poll(i) {
      const chunk = profile === "sprint" ? (i % 4 < 2 ? 14 : 6) : 40;
      if (i % chunk === 0) { idx = (idx + 1) % seq.length; held.clear(); for (const k of seq[idx]) held.add(k); }
      queue = [...held];
    },
    down: (id) => held.has(id),
    pressed: (id) => queue.includes(id),
    axis() {
      const x = (held.has("right") ? 1 : 0) - (held.has("left") ? 1 : 0);
      const y = (held.has("down") ? 1 : 0) - (held.has("up") ? 1 : 0);
      return { x: Math.sign(x), y: Math.sign(y) };
    },
  };
}

function makeSfx() {
  const noop = () => {};
  return {
    tone: noop, noise: noop, chord: noop, coin: noop, death: noop, power: noop,
    clear: noop, bump: noop, boom: noop, resume: noop, muted: true,
  };
}

function runGame(def, profile) {
  const store = new Map();
  const hud = { score: 0, lives: 3, level: 1, extra: "" };
  const events = [];
  const input = makeInput(profile);
  const io = {
    input,
    sfx: makeSfx(),
    w: def.w ?? 256,
    h: def.h ?? 224,
    time: 0,
    frames: 0,
    fps: 60,
    cfg: { autoFire: false, shake: true, crt: true },
    hud: (patch) => (patch ? Object.assign(hud, patch) : hud),
    score: (n) => { hud.score += n; },
    getScore: () => hud.score,
    setScore: (n) => { hud.score = n; },
    over: (msg) => { io._over = msg; },
    restart: () => {},
    event: (name, payload) => events.push([name, payload]),
    save: (k, v) => store.set(`${def.id}.${k}`, v),
    load: (k, d) => (store.has(`${def.id}.${k}`) ? store.get(`${def.id}.${k}`) : d),
  };
  const ctx = stubCtx();
  const api = def.create(ctx, io);
  if (!api || typeof api.update !== "function" || typeof api.draw !== "function")
    throw new Error("a game must expose update(dt, io) and draw(ctx, io)");
  const frames = profile === "sprint" ? FRAMES * 3 : FRAMES;
  for (let i = 0; i < frames; i++) {
    io.frames = i;
    io.time = i / 60;
    input.poll(i);
    api.update(1 / 60, io, i);
    api.draw(ctx, io, i);
    if (i === Math.floor(frames / 2) && typeof api.reset === "function") api.reset(io);
    if (!Number.isFinite(hud.score)) throw new Error(`score went non-finite on frame ${i}`);
  }
  return {
    frames,
    hud,
    events: events.length,
    gameOver: Boolean(io._over),
    saved: [...store.entries()].map(([k, v]) => `${k}=${v}`),
  };
}

const mods = ["../js/games/arcade.js", "../js/games/puzzle.js", "../js/games/action.js"];
let bad = 0;
for (const m of mods) {
  const mod = await import(new URL(m, import.meta.url));
  const defs = Object.values(mod).filter((v) => v && typeof v === "object" && v.id && v.create);
  if (!defs.length) { console.error(`FAIL ${m}: no game components exported`); bad++; continue; }
  for (const def of defs) {
    try {
      const a = runGame(def, "cycle");
      const r = runGame(def, "sprint");
      console.log(
        `ok   ${def.id.padEnd(8)} ${a.frames}+${r.frames} frames · best score ${Math.max(a.hud.score, r.hud.score)} · lv ${r.hud.level}` +
        ` · lives ${r.hud.lives} · ${r.events} events · ${r.gameOver ? "game over (fine)" : "alive"}` +
        ` · ${r.saved.join(" ") || "no saves"}`,
      );
    } catch (err) {
      bad++;
      console.error(`FAIL ${def.id}: ${err && err.stack ? err.stack.split("\n").slice(0, 4).join("\n     ") : err}`);
    }
  }
}
console.log(bad ? `\n${bad} game(s) failed the smoke run` : "\nall built-in games ran clean");
process.exit(bad ? 1 : 0);
