/**
 * RetroDeck - built-in game host.
 *
 * The six titles in this folder are original games written for this project, in
 * the *tradition of* arcade classics: a maze chomper, a bomber, a momentum
 * platformer, a brick breaker, a falling-block puzzler and a shoot-em-up. They
 * share one tiny engine so they all get: integer-scaled pixel output, the same
 * on-screen pad as the emulators, sound, pause, high scores in localStorage,
 * and a fixed-timestep loop (so a 120Hz phone and a 60Hz laptop play the same).
 *
 * No asset files: sprites are drawn as rects/paths, "music" is a 3-voice
 * WebAudio arpeggiator. That keeps the repo free of copyrighted material and
 * means the whole thing works from file:// too.
 */

export const LOGICAL = {
  nes: { w: 256, h: 240 },
  gb: { w: 160, h: 144 },
  snes: { w: 256, h: 224 },
  gba: { w: 240, h: 160 },
  segaMD: { w: 320, h: 224 },
  arcade: { w: 224, h: 256 },
};

/* ------------------------------------------------------------------ input */
export class Input {
  constructor(deck) {
    this.deck = deck;
    this.prev = new Set();
    this.cur = new Set();
    this.queue = [];
    this.analog = { x: 0, y: 0 };
  }
  poll() {
    const p = this.prev;
    this.prev = new Set(this.cur);
    const held = this.deck?.pressed ?? new Set();
    this.cur = new Set([...held].filter((id) => !id.includes("#t")));
    this.queue = [];
    for (const id of this.cur) if (!p.has(id)) this.queue.push(id);
    const a = this.deck?.analog?.lstick || { x: 0, y: 0 };
    this.analog.x = Math.abs(a.x) > 0.22 ? Math.sign(a.x) : 0;
    this.analog.y = Math.abs(a.y) > 0.22 ? Math.sign(a.y) : 0;
    const dp = this.deck;
    if (dp) {
      if (dp.isDown?.("left")) this.analog.x = -1;
      if (dp.isDown?.("right")) this.analog.x = 1;
      if (dp.isDown?.("up")) this.analog.y = -1;
      if (dp.isDown?.("down")) this.analog.y = 1;
    }
  }
  down(id) {
    return this.cur.has(id);
  }
  pressed(id) {
    return this.queue.includes(id);
  }
  axis() {
    return this.analog;
  }
}

/* ------------------------------------------------------------------- audio */
export class Sfx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.enabled = typeof window !== "undefined" && !!window.AudioContext;
  }
  resume() {
    if (!this.enabled) return;
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.16;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
  }
  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.16;
  }
  tone(freq, dur = 0.08, type = "square", vol = 1, slideTo = null) {
    if (!this.enabled || this.muted || !this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.9 * vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
  noise(dur = 0.14, vol = 0.7, hp = 400) {
    if (!this.enabled || this.muted || !this.ctx) return;
    const t = this.ctx.currentTime;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = hp;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
  }
  chord(freqs, dur = 0.2, type = "triangle") {
    freqs.forEach((f, i) => setTimeout(() => this.tone(f, dur, type, 0.8), i * 30));
  }
  /* tiny event jingles */
  get coin() {
    this.tone(880, 0.05, "square", 0.9);
    setTimeout(() => this.tone(1320, 0.09, "square", 0.8), 45);
  }
  get death() {
    this.chord([440, 330, 220, 165], 0.16, "square");
  }
  get power() {
    [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone(f, 0.07, "triangle", 0.9), i * 45));
  }
  get clear() {
    [659, 784, 988, 1319].forEach((f, i) => setTimeout(() => this.tone(f, 0.09, "square", 0.8), i * 55));
  }
  get bump() {
    this.tone(180, 0.05, "square", 0.6, 120);
  }
  get boom() {
    this.noise(0.28, 0.9, 260);
  }
}

/* ------------------------------------------------------------------ helpers */
export const px = (ctx) => {
  ctx.imageSmoothingEnabled = false;
};
export function rect(ctx, x, y, w, h, c) {
  ctx.fillStyle = c;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}
export function text(ctx, s, x, y, c = "#fff", size = 8, align = "left") {
  ctx.fillStyle = c;
  ctx.font = `${size}px "Courier New", ui-monospace, monospace`;
  ctx.textAlign = align;
  ctx.textBaseline = "top";
  ctx.fillText(s, Math.round(x), Math.round(y));
}
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (n) => Math.floor(Math.random() * n);
export function circles(ctx, list, r, c) {
  ctx.fillStyle = c;
  for (const p of list) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}
export function outline(ctx, x, y, w, h, c, t = 1) {
  rect(ctx, x, y, w, t, c);
  rect(ctx, x, y + h - t, w, t, c);
  rect(ctx, x, y, t, h, c);
  rect(ctx, x + w - t, y, t, h, c);
}

/* --------------------------------------------------------------- game host */
export class GameHost {
  /**
   * @param {object} o { canvas, game, deck, onEvent, fps }
   */
  constructor(o) {
    this.o = o;
    this.canvas = o.canvas;
    this.ctx = this.canvas.getContext("2d", { alpha: false });
    this.sfx = new Sfx();
    this.input = new Input(o.deck);
    this.fps = o.fps || 60;
    this.running = false;
    this.paused = false;
    this.frames = 0;
    this.acc = 0;
    this.last = 0;
    this.hud = { score: 0, lives: 0, level: 1, extra: "" };
    this.score = 0;
    this.gameOver = false;
    const res = LOGICAL[o.game.system] || { w: 256, h: 224 };
    this.w = o.game.w ?? res.w;
    this.h = o.game.h ?? res.h;
    this.canvas.width = this.w;
    this.canvas.height = this.h;
    px(this.ctx);
  }

  start() {
    const io = {
      input: this.input,
      /** seconds of simulated game time (advanced once per fixed step) */
      time: 0,
      frames: 0,
      fps: this.fps,
      cfg: this.o.cfg || {},
      sfx: this.sfx,
      w: this.w,
      h: this.h,
      hud: (patch) => Object.assign(this.hud, patch),
      score: (n) => {
        this.score += n;
        this.hud.score = this.score;
      },
        setScore: (n) => {
        this.score = n;
        this.hud.score = n;
      },
      /** read the score as a number (io.score itself is the adder) */
      getScore: () => this.score,
      over: (msg) => {
        this.gameOver = true;
        this.o.onEvent?.("gameover", { score: this.score, msg });
      },
      restart: () => {
        this.gameOver = false;
        this.score = 0;
        this.api?.reset?.();
      },
      event: (n, p) => this.o.onEvent?.(n, p),
      save: (k, v) => {
        try {
          localStorage.setItem(`retrodeck.builtin.${this.o.game.id}.${k}`, JSON.stringify(v));
        } catch { /* full */ }
      },
      load: (k, d) => {
        try {
          const v = localStorage.getItem(`retrodeck.builtin.${this.o.game.id}.${k}`);
          return v == null ? d : JSON.parse(v);
        } catch {
          return d;
        }
      },
    };
    this.io = io;
    this.api = this.o.game.create(this.ctx, io, this);
    this.running = true;
    this.paused = false;
    this.last = performance.now();
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
    this.sfx.resume();
    // a user gesture is required before audio can start on mobile
    const unlock = () => {
      this.sfx.resume();
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    this._unlock = unlock;
  }

  loop(now) {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.loop);
    const step = 1000 / this.fps;
    let dt = now - this.last;
    this.last = now;
    if (dt > 250) dt = step; // tab was backgrounded
    if (this.paused) {
      this.api?.draw?.(this.ctx, this.io);
      text(this.ctx, "PAUSED", this.w / 2, this.h / 2 - 4, "#fff", 8, "center");
      return;
    }
    this.acc += dt;
    let steps = 0;
    while (this.acc >= step && steps < 5) {
      this.acc -= step;
      steps++;
      this.frames++;
      this.io.time = this.frames / this.fps;
      this.io.frames = this.frames;
      this.input.poll();
      try {
        this.api?.update?.(step / 1000, this.io, this.frames);
      } catch (err) {
        console.error("[retrodeck] game update threw:", err);
        this.stop();
        this.o.onEvent?.("crash", { msg: String(err?.message || err) });
        return;
      }
      if (this.gameOver && this.api?.onGameOver) this.api.onGameOver(this.io);
    }
    this.ctx.fillStyle = this.api?.bg || "#000";
    this.ctx.fillRect(0, 0, this.w, this.h);
    try {
      this.api?.draw?.(this.ctx, this.io, this.frames);
    } catch (err) {
      console.error("[retrodeck] game draw threw:", err);
    }
    if (this.api?.drawHud !== false) this.drawHud();
  }

  drawHud() {
    const { score = this.score, lives, level, extra } = this.hud;
    if (lives != null || score) text(this.ctx, `${String(score).padStart(6, "0")}`, 4, 2, "#ffd54a", 8);
    if (lives != null) text(this.ctx, `♥${lives}`, this.w - 4, 2, "#ff5f6d", 8, "right");
    if (level != null) text(this.ctx, `LV${level}`, this.w / 2, 2, "#8ad7ff", 8, "center");
    if (extra) text(this.ctx, extra, 4, this.h - 10, "#9fb0c8", 7);
  }

  pause(v = !this.paused) {
    this.paused = v;
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    window.removeEventListener("pointerdown", this._unlock);
    window.removeEventListener("keydown", this._unlock);
    this.api?.destroy?.();
  }

  /** Reboot the same game: used by the player's "Reset" action. */
  restart() {
    this.stop();
    this.start();
  }

  /** let a game react to a raw button event from the deck (not polled) */
  button(id, down) {
    this.api?.onButton?.(id, down, this.io);
  }
}
