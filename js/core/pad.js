/**
 * RetroDeck - the input deck.
 *
 * Renders a *console-accurate* controller from js/data/layouts.js and turns
 * touches, key presses and real gamepads into button state. The state is then
 * handed to whichever bridge the emulator needs:
 *
 *   keyboard  - synthesises trusted-looking KeyboardEvents with the codes
 *               EmulatorJS is told to map (via EJS_defaultControls). Uses only
 *               documented EmulatorJS options, so it survives version bumps.
 *   direct    - window.EJS_emulator.callEvent("button", [idx, pressed]) - the
 *               internal path; lower latency, may change between versions.
 *   native    - hands the state to our built-in games (js/games/*).
 *
 * One engine drives NES pads, SNES diamonds, the N64 stick + C-buttons, GBA
 * shoulders, PS1 twin sticks, arcade 6-button panels, trackballs and light-gun
 * tap regions, because those are just widget lists.
 */

import { PADS } from "../data/layouts.js";
import { store } from "./store.js";

/* RetroArch button index, per docs (EJS_defaultControls) */
export const EJS_INDEX = {
  B: 0, Y: 1, SELECT: 2, START: 3, UP: 4, DOWN: 5, LEFT: 6, RIGHT: 7,
  A: 8, X: 9, L: 10, R: 11, L2: 12, R2: 13, L3: 14, R3: 15,
  LX_POS: 16, LX_NEG: 17, LY_POS: 18, LY_NEG: 19,
  RX_POS: 20, RX_NEG: 21, RY_POS: 22, RY_NEG: 23,
  HOTKEY_1: 24, HOTKEY_2: 25, HOTKEY_3: 26, BOOST: 27, SPACE: 28, SLOW: 29,
};

/** code -> {key, keyCode} for the events we synthesise. */
const KEYCODE = {
  ArrowUp: ["ArrowUp", 38, "up arrow"], ArrowDown: ["ArrowDown", 40, "down arrow"],
  ArrowLeft: ["ArrowLeft", 37, "left arrow"], ArrowRight: ["ArrowRight", 39, "right arrow"],
  Enter: ["Enter", 13, "enter"], Escape: ["Escape", 27, "escape"],
  Space: [" ", 32, "space"], Tab: ["Tab", 9, "tab"], ShiftLeft: ["Shift", 16, "shift"],
  ControlLeft: ["Control", 17, "control"], AltLeft: ["Alt", 18, "alt"],
  Backspace: ["Backspace", 8, "backspace"], Delete: ["Delete", 46, "delete"],
  Backquote: ["`", 192, "backquote"], Minus: ["-", 189, "-"], Equal: ["=", 187, "+"],
  BracketLeft: ["[", 219, "["], BracketRight: ["]", 221, "]"],
  Semicolon: [";", 186, ";"], Quote: ["'", 222, "'"], Comma: [",", 188, ","],
  Period: [".", 190, "."], Slash: ["/", 191, "/"], Backslash: ["\\", 220, "\\"],
  NumpadAdd: ["+", 107, "add"], NumpadSubtract: ["-", 109, "subtract"],
  F1: ["F1", 112, "f1"], F2: ["F2", 113, "f2"], F3: ["F3", 114, "f3"], F4: ["F4", 115, "f4"],
  F5: ["F5", 116, "f5"], F6: ["F6", 117, "f6"], F7: ["F7", 118, "f7"], F8: ["F8", 119, "f8"],
  F9: ["F9", 120, "f9"], F10: ["F10", 121, "f10"], F11: ["F11", 122, "f11"], F12: ["F12", 123, "f12"],
  Digit0: ["0", 48], Digit1: ["1", 49], Digit2: ["2", 50], Digit3: ["3", 51], Digit4: ["4", 52],
  Digit5: ["5", 53], Digit6: ["6", 54], Digit7: ["7", 55], Digit8: ["8", 56], Digit9: ["57"],
};

export function keyFor(code) {
  if (!code) return "";
  const m = code.match(/^Key([A-Z])$/);
  if (m) return m[1].toLowerCase();
  const k = code.match(/^Digit(\d)$/);
  if (k) return k[1];
  return KEYCODE[code]?.[0] ?? code.toLowerCase();
}
export function keyCodeFor(code) {
  const m = code?.match(/^Key([A-Z])$/);
  if (m) return m[1].charCodeAt(0);
  const d = code?.match(/^Digit(\d)$/);
  if (d) return 48 + Number(d[1]);
  return KEYCODE[code]?.[1] ?? 0;
}
/** The string EmulatorJS stores in its own mapping tables ("up arrow", "z"). */
export function ejsKeyName(code) {
  const m = code?.match(/^Key([A-Z])$/);
  if (m) return m[1].toLowerCase();
  const d = code?.match(/^Digit(\d)$/);
  if (d) return d[1];
  return KEYCODE[code]?.[2] ?? keyFor(code);
}

/* ------------------------------------------------------------------ widget DOM */
function widgetHTML(w, i) {
  const common = `data-w="${i}" class="w w--${w.t}${w.id ? ` w--${String(w.id).replace(/[^a-z0-9]/gi, "")}` : ""}${w.tint ? ` is-tinted-${w.tint}` : ""}"`;
  const pos = `style="--x:${w.x};--y:${w.y};--s:${w.s ?? 9};--w:${w.w ?? w.s ?? 9};--h:${w.h ?? w.s ?? 9};${w.angle ? `--rot:${w.angle}deg;` : ""}"`;
  switch (w.t) {
    case "dpad":
      return `<div ${common} ${pos} data-dpad="1" role="group" aria-label="D-pad">
        <i class="w__cross"></i><u class="nub n" data-dir="up"></u><u class="nub s" data-dir="down"></u>
        <u class="nub w" data-dir="left"></u><u class="nub e" data-dir="right"></u></div>`;
    case "stick":
      return `<div ${common} ${pos} data-stick="1" data-style="${w.style || "nub"}" role="application" aria-label="Analog stick">
        <i class="ring"></i><i class="knob"></i></div>`;
    case "btn":
      return `<button ${common} ${pos} data-btn="${w.id}" aria-label="${w.label || w.id}">
        <span class="face"></span><span class="lbl">${w.label ?? ""}</span></button>`;
    case "pill":
      return `<button ${common} ${pos} data-btn="${w.id}" aria-label="${w.label || w.id}">
        <span class="pillface"></span><span class="lbl lbl--sm">${w.label ?? ""}</span></button>`;
    case "shoulder":
      return `<button ${common} ${pos} data-btn="${w.id}" aria-label="${w.label || w.id}">
        <span class="shface"></span><span class="lbl lbl--sm">${w.label ?? ""}</span></button>`;
    case "switch":
      return `<div ${common} ${pos} data-switch="${w.id}" role="button" tabindex="0" aria-label="${w.label}">
        <span class="swtrack"><i class="swthumb"></i></span><span class="lbl lbl--xs">${w.label ?? ""}</span></div>`;
    case "region":
      return `<div ${common} ${pos} data-region="${w.id || "touch"}" aria-hidden="true"><span class="rglabel">${w.label ?? ""}</span></div>`;
    case "keys":
      return `<div ${common} ${pos} data-keys="${w.rows || 4}"><span class="lbl lbl--xs">${w.label ?? ""}</span><div class="keygrid"></div></div>`;
    default:
      return "";
  }
}

const MINI_KEYS = [
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
  ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
  ["A", "S", "D", "F", "G", "H", "J", "K", "L", "-"],
  ["Z", "X", "C", "V", "B", "N", "M", ",", ".", "SP"],
  ["ESC", "TAB", "CR", "CTRL", "ALT", "STOP", "RUN", "F1", "F5", "F7"],
  ["+", "*", "=", "/", "#", "$", "%", "&", "?", "!"],
];

export class Deck {
  /**
   * @param {object} o
   * @param {HTMLElement} o.mount
   * @param {object} o.system      SYSTEMS entry
   * @param {string} o.padId       key of PADS
   * @param {object} [o.mapping]   { btnId: "KeyCode" }
   * @param {"keyboard"|"direct"|"both"|"native"} [o.bridge]
   * @param {(id:string,down:boolean)=>void} [o.onNative]
   * @param {(name:string,payload:object)=>void} [o.onAction]  hotkeys / meta buttons
   */
  constructor(o) {
    this.o = o;
    this.system = o.system;
    this.pad = PADS[o.padId] || PADS[this.system?.pad] || PADS.snes;
    this.mount = o.mount;
    this.bridge = o.bridge || "keyboard";
    this.mapping = { ...(o.mapping || defaultMapping(this.system)) };
    this.turbo = { ...(o.turbo || {}) };
    this.pressed = new Set();
    this.pointerTo = new Map();
    this.analog = { lstick: { x: 0, y: 0 }, rstick: { x: 0, y: 0 } };
    this.listeners = [];
    this.timers = new Map();
    this.frame = null;
    this.padScale = o.scale ?? store.get("play.padScale", 1);
    this.padOpacity = o.opacity ?? store.get("play.padOpacity", 0.9);
  }

  /* --------------------------------------------------------------- build */
  build() {
    const m = this.mount;
    if (!m) return;
    const padId = this.o.padId || this.system?.pad || "snes";
    m.innerHTML = `<div class="pad pad--${padId}"${this.pad.orient ? ` data-orient="${this.pad.orient}"` : ""} style="--padScale:${this.padScale};--padOpacity:${this.padOpacity}">
      ${this.pad.widgets.map(widgetHTML).join("")}
    </div>`;
    this.el = m.querySelector(".pad");
    this.bindWidgets();
    this.bindKeys();
    this.bindGamepad();
    return this.el;
  }

  /** Rebuild with a different pad id / mapping (used by Controls screen). */
  update(patch = {}) {
    Object.assign(this.o, patch);
    if (patch.padId) this.pad = PADS[patch.padId] || this.pad;
    if (patch.mapping) this.mapping = { ...this.mapping, ...patch.mapping };
    if (patch.scale != null) this.padScale = patch.scale;
    if (patch.opacity != null) this.padOpacity = patch.opacity;
    if (this.el) {
      this.el.style.setProperty("--padScale", this.padScale);
      this.el.style.setProperty("--padOpacity", this.padOpacity);
    }
    this.build();
  }

  destroy() {
    for (const off of this.listeners) {
      try { off(); } catch { /* already gone */ }
    }
    this.listeners = [];
    for (const t of this.timers.values()) clearInterval(t);
    this.timers.clear();
    if (this.frame) cancelAnimationFrame(this.frame);
    if (this.mount) this.mount.innerHTML = "";
    this.pressed.clear();
  }

  /* ------------------------------------------------------------ bridges */
  setBridge(b) {
    this.bridge = b;
  }

  #send(id, down) {
    const def = (this.system?.buttons || []).find((b) => b.id === id);
    const code = this.mapping[id] || def?.key;
    const b = this.bridge;

    if (b === "native" || b === "both") this.o.onNative?.(id, down);

    if (b === "keyboard" || b === "both") {
      if (code) this.#synth(code, down);
    }

    /* direct path: requested, or the only option when no key is bound */
    const wantDirect = b === "direct" || b === "both" || (b === "keyboard" && !code);
    if (wantDirect && typeof def?.ejs === "number") this.#direct(def.ejs, down);

    if (down && store.get("play.haptics", true) && navigator.vibrate) {
      try { navigator.vibrate(def?.group === "system" ? 6 : 9); } catch { /* unsupported */ }
    }
  }

  /**
   * The core lives in a same-origin iframe, so events must be created in that
   * frame (its own KeyboardEvent ctor) - otherwise EmulatorJS' listener, which
   * runs in the child realm, never sees them.
   */
  #synth(code, down) {
    const targetDoc = this.o.inputTarget?.() || (typeof document !== "undefined" ? document : null);
    if (!targetDoc) return;
    const win = targetDoc.defaultView || window;
    const type = down ? "keydown" : "keyup";
    const init = {
      key: keyFor(code),
      code,
      keyCode: keyCodeFor(code),
      which: keyCodeFor(code),
      bubbles: true,
      cancelable: true,
    };
    try {
      const Ctor = win.KeyboardEvent || KeyboardEvent;
      targetDoc.dispatchEvent(new Ctor(type, init));
      if (win !== window) win.dispatchEvent(new Ctor(type, init));
      else window.dispatchEvent(new KeyboardEvent(type, init));
    } catch (err) {
      console.warn("[retrodeck] key bridge failed:", err?.message);
    }
  }

  #direct(ejsIndex, down) {
    if (this.o.rpc) return this.o.rpc(ejsIndex, down);
    const emu = typeof window !== "undefined" && window.EJS_emulator;
    if (!emu?.callEvent) return;
    try {
      emu.callEvent("button", [ejsIndex, down]);
    } catch (err) {
      console.warn("[retrodeck] direct input failed, using keyboard:", err?.message);
      this.bridge = "keyboard";
      store.set("emulator.inputBridge", "keyboard");
    }
  }

  /* ------------------------------------------------------------ public API */
  press(id) {
    if (this.pressed.has(id)) return;
    this.pressed.add(id);
    this.#send(id, true);
    this.#mark(id, true);
    if (this.turbo[id]) this.#turbo(id);
  }

  release(id) {
    if (!this.pressed.has(id)) return;
    this.pressed.delete(id);
    this.#send(id, false);
    this.#mark(id, false);
    const t = this.timers.get(id);
    if (t) { clearInterval(t); this.timers.delete(id); }
  }

  toggle(id) {
    this.pressed.has(id) ? this.release(id) : this.press(id);
  }

  isDown(id) {
    return this.pressed.has(id);
  }

  /** Release everything (menu open, tab blur, emulator exit). */
  allUp() {
    for (const id of [...this.pressed]) this.release(id);
    for (const d of ["up", "down", "left", "right"]) this.release(`__dir:${d}`);
  }

  /**
   * Called by the emulator bridge when EmulatorJS changes state so the pad
   * highlight follows a real controller too.
   */
  #mark(id, down) {
    if (!this.el) return;
    for (const el of this.el.querySelectorAll(`[data-btn="${cssEsc(id)}"]`))
      el.classList.toggle("is-down", down);
    if (id.startsWith("__dir:")) {
      const dir = id.slice(6);
      const host = this.el.querySelector("[data-dpad]");
      host?.classList.toggle(`is-${dir}`, down);
    }
  }

  #turbo(id) {
    if (this.timers.has(id)) return;
    const iv = setInterval(() => {
      this.#send(id, !this.pressed.has(`${id}#t`));
      this.pressed.add(`${id}#t`);
    }, 60);
    this.timers.set(id, iv);
  }

  setTurbo(id, on) {
    this.turbo[id] = on;
    if (!on) {
      const t = this.timers.get(id);
      if (t) { clearInterval(t); this.timers.delete(id); }
      this.pressed.delete(`${id}#t`);
      this.#send(id, false);
      if (this.pressed.has(id)) this.#send(id, true);
    }
  }

  /* -------------------------------------------------------------- pointers */
  bindWidgets() {
    const pad = this.el;
    if (!pad) return;

    const widgets = [...pad.querySelectorAll("[data-w]")];
    for (const el of widgets) {
      const idx = Number(el.dataset.w);
      const w = this.pad.widgets[idx];
      if (!w) continue;

      el.addEventListener("contextmenu", (e) => e.preventDefault());

      if (w.t === "dpad") { this.#bindDirectional(el, w, ["up", "down", "left", "right"], false); continue; }
      if (w.t === "stick") { this.#bindDirectional(el, w, stickAxes(w.id, this.system), true, w.id); continue; }

      if (w.t === "region") {
        let down = false;
        const start = (e) => {
          e.preventDefault();
          const id = w.id === "fire" ? "a" : w.id === "touch" ? "touch" : w.id;
          if (w.id === "touch") this.o.onAction?.("pointer", { x: e.offsetX / el.clientWidth, y: e.offsetY / el.clientHeight, down: true, region: w.id });
          this.press(id);
          down = true;
        };
        const end = () => {
          if (!down) return;
          down = false;
          this.release(w.id === "fire" ? "a" : w.id === "touch" ? "touch" : w.id);
          if (w.id === "touch") this.o.onAction?.("pointer", { down: false, region: w.id });
        };
        el.addEventListener("pointerdown", start);
        el.addEventListener("pointerup", end);
        el.addEventListener("pointercancel", end);
        el.addEventListener("pointerleave", end);
        continue;
      }

      if (w.t === "switch") {
        el.addEventListener("click", () => {
          el.classList.toggle("is-on");
          this.o.onAction?.("switch", { id: w.id, on: el.classList.contains("is-on") });
        });
        continue;
      }

      if (w.t === "keys") {
        const grid = el.querySelector(".keygrid");
        const rows = Math.min(MINI_KEYS.length, w.rows || 4);
        grid.innerHTML = MINI_KEYS.slice(0, rows)
          .map((row) => row.map((k) => `<button class="mk" data-k="${k}">${k}</button>`).join(""))
          .join("");
        grid.addEventListener("pointerdown", (e) => {
          const b = e.target.closest(".mk");
          if (!b) return;
          e.preventDefault();
          this.o.onAction?.("key", { label: b.dataset.k });
        });
        continue;
      }

      /* plain button / pill / shoulder */
      const meta = (this.system?.buttons || []).find((x) => x.id === w.id);
      let long = null;
      el.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        try { el.setPointerCapture(e.pointerId); } catch { /* older */ }
        this.press(w.id);
        if (meta?.group === "system" || el.dataset.turboOk === "1") {
          long = setTimeout(() => this.o.onAction?.("longpress", { id: w.id, el }), 520);
        }
      });
      const up = () => {
        clearTimeout(long);
        this.release(w.id);
      };
      el.addEventListener("pointerup", up);
      el.addEventListener("pointercancel", up);
      el.addEventListener("pointerleave", () => { if (long) clearTimeout(long); });
      el.addEventListener("dblclick", (e) => {
        if (e.shiftKey) { this.setTurbo(w.id, !this.turbo[w.id]); el.classList.toggle("is-turbo", !!this.turbo[w.id]); }
      });
    }

    /* a finger lifted anywhere must release what it was holding */
    const dUp = (e) => {
      const held = this.pointerTo.get(e.pointerId);
      if (held) { this.#releaseHeld(held); this.pointerTo.delete(e.pointerId); }
    };
    document.addEventListener("pointerup", dUp);
    document.addEventListener("pointercancel", dUp);
    this.listeners.push(() => {
      document.removeEventListener("pointerup", dUp);
      document.removeEventListener("pointercancel", dUp);
    });
  }

  #releaseHeld(held) {
    for (const id of held) this.release(id);
  }

  #bindDirectional(el, w, ids, analog, stickId) {
    const held = new Set();
    const dirs = ["up", "down", "left", "right"];
    const set = (want) => {
      for (const d of ids) {
        const key = stickId ? `${stickId}:${d}` : d;
        if (want.has(d) && !held.has(key)) { held.add(key); this.press(key); }
        else if (!want.has(d) && held.has(key)) { held.delete(key); this.release(key); }
      }
    };
    const compute = (e) => {
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dx = (e.clientX - cx) / (r.width / 2);
      const dy = (e.clientY - cy) / (r.height / 2);
      const dead = w.dead ?? (analog ? 0.18 : 0.22);
      const mag = Math.hypot(dx, dy);
      if (stickId) {
        this.analog[stickId] = { x: clampN(dx), y: clampN(dy), mag };
        el.style.setProperty("--kx", `${clamp(dx, -1, 1) * 30}%`);
        el.style.setProperty("--ky", `${clamp(dy, -1, 1) * 30}%`);
      }
      const want = new Set();
      if (mag > dead) {
        const ax = Math.abs(dx), ay = Math.abs(dy);
        // real 8-way hardware sends two directions on a diagonal - so do we
        const eightWay = true;
        if (ax > ay * 0.55) want.add(dx > 0 ? "right" : "left");
        if (ay > ax * 0.55) want.add(dy > 0 ? "down" : "up");
        if (!eightWay && want.size === 2) {
          // lock to dominant axis for hardware 4-way pads (SMS/Atari stock)
          if (ax > ay) want.delete(dy > 0 ? "down" : "up");
          else want.delete(dx > 0 ? "right" : "left");
        }
      }
      set(want);
    };
    el.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      try { el.setPointerCapture(e.pointerId); } catch { /* older */ }
      this.pointerTo.set(e.pointerId, held);
      compute(e);
    });
    el.addEventListener("pointermove", (e) => {
      if (this.pointerTo.get(e.pointerId) !== held) return;
      compute(e);
    });
    const end = (e) => {
      if (this.pointerTo.get(e.pointerId) !== held) return;
      set(new Set());
      if (stickId) {
        this.analog[stickId] = { x: 0, y: 0, mag: 0 };
        el.style.setProperty("--kx", "0%");
        el.style.setProperty("--ky", "0%");
      }
      this.pointerTo.delete(e.pointerId);
    };
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
  }

  /* --------------------------------------------------------------- keyboard */
  bindKeys() {
    const byKey = new Map();
    for (const [id, code] of Object.entries(this.mapping)) if (code) byKey.set(code, id);
    for (const b of this.system?.buttons || []) if (b.key && !byKey.has(b.key)) byKey.set(b.key, b.id);

    const onKey = (e, down) => {
      if (e.repeat && down) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const id = byKey.get(e.code);
      if (!id) return;
      e.preventDefault();
      down ? this.press(id) : this.release(id);
    };
    const kd = (e) => onKey(e, true);
    const ku = (e) => onKey(e, false);
    const blur = () => this.allUp();
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    window.addEventListener("blur", blur);
    this.listeners.push(() => {
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      window.removeEventListener("blur", blur);
    });
  }

  /* ------------------------------------------------------- real gamepads */
  bindGamepad() {
    if (typeof navigator === "undefined" || !("getGamepads" in navigator)) return;
    let ids = [];
    const map = standardMap(this.system);
    const poll = () => {
      const pads = navigator.getGamepads?.() || [];
      for (const gp of pads) {
        if (!gp) continue;
        if (!ids.includes(gp.id)) {
          ids.push(gp.id);
          this.o.onAction?.("gamepad", { connected: gp.id, pads: ids.length });
        }
        gp.buttons.forEach((b, i) => {
          const id = map.buttons[i];
          if (!id) return;
          b.pressed ? this.press(id) : this.release(id);
        });
        // left stick -> 4 dirs
        const ax = gp.axes[0] ?? 0, ay = gp.axes[1] ?? 0;
        const want = new Set();
        if (Math.abs(ax) > 0.35) want.add(ax > 0 ? "right" : "left");
        if (Math.abs(ay) > 0.35) want.add(ay > 0 ? "down" : "up");
        for (const d of ["up", "down", "left", "right"]) {
          if (!map.dpad) continue;
          const already = gp.buttons[12 + ["up", "down", "left", "right"].indexOf(d)]?.pressed;
          if (already) continue;
          want.has(d) ? this.press(d) : this.release(d);
        }
      }
      if (ids.length) this.frame = requestAnimationFrame(poll);
    };
    const conn = (e) => {
      ids = ids.filter((x) => x !== e.gamepad?.id);
      if (e.type === "gamepadconnected") poll();
    };
    window.addEventListener("gamepadconnected", conn);
    window.addEventListener("gamepaddisconnected", conn);
    this.listeners.push(() => {
      window.removeEventListener("gamepadconnected", conn);
      window.removeEventListener("gamepaddisconnected", conn);
    });
  }
}

const clampN = (v) => Math.max(-1, Math.min(1, v));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function cssEsc(s) {
  return typeof CSS !== "undefined" && CSS.escape ? CSS.escape(s) : String(s).replace(/[#(){}.]/g, "\\$&");
}
function stickAxes(id, system) {
  const has = (b) => (system?.buttons || []).some((x) => x.id === b);
  if (id === "rstick") return has("cup") ? ["cup", "cdown", "cleft", "cright"] : ["rx", "ry", "rw", "re"];
  return ["up", "down", "left", "right"];
}

/** Default key mapping for a system, from its buttons[] */
export function defaultMapping(system) {
  const m = {};
  for (const b of system?.buttons || []) if (b.key) m[b.id] = b.key;
  return m;
}

/** Build the EJS_defaultControls table EmulatorJS should use for us. */
export function ejsControls(system, mapping) {
  const t = {};
  for (const b of system?.buttons || []) {
    if (typeof b.ejs !== "number") continue;
    const code = mapping?.[b.id] || b.key;
    t[b.ejs] = { value: code ? ejsKeyName(code) : "", value2: retroarchName(b.ejs) };
  }
  return { 0: t, 1: {}, 2: {}, 3: {} };
}

function retroarchName(i) {
  return ["BUTTON_2", "BUTTON_4", "SELECT", "START", "DPAD_UP", "DPAD_DOWN", "DPAD_LEFT", "DPAD_RIGHT",
    "BUTTON_1", "BUTTON_3", "LEFT_TOP_SHOULDER", "RIGHT_TOP_SHOULDER", "LEFT_BOTTOM_SHOULDER",
    "RIGHT_BOTTOM_SHOULDER", "LEFT_STICK", "RIGHT_STICK", "LEFT_STICK_X:+1", "LEFT_STICK_X:-1",
    "LEFT_STICK_Y:+1", "LEFT_STICK_Y:-1", "RIGHT_STICK_X:+1", "RIGHT_STICK_X:-1", "RIGHT_STICK_Y:+1",
    "RIGHT_STICK_Y:-1", "HOTKEY_1", "HOTKEY_2", "HOTKEY_3", "ANALOG_BOOST", "SPACE", "ANALOG_SLOW"][i] || `IDX_${i}`;
}

/** Standard-gamepad -> our button ids, tuned per console family. */
export function standardMap(system) {
  const id = system?.id;
  const base = {
    0: "b", 1: "a", 2: "y", 3: "x", 4: "l", 5: "r", 6: "l2", 7: "r2",
    8: "select", 9: "start", 10: "l3", 11: "r3", 12: "up", 13: "down", 14: "left", 15: "right",
  };
  if (id === "nes" || id === "gb" || id === "gbc") return { ...base, 0: "b", 1: "a", 2: "b", 3: "a", 8: "select", 9: "start", dpad: true };
  if (id === "snes") return { ...base, dpad: true };
  if (id === "n64") return { ...base, 0: "b", 1: "a", 2: "z", 3: "start", 4: "l", 5: "r", 9: "start", dpad: true };
  if (id === "segaMD") return { ...base, 0: "b", 1: "c", 2: "a", 3: "y", 8: "mode", 9: "start", dpad: true };
  if (id === "psx" || id === "psp") return { ...base, 0: "cross", 1: "circle", 2: "square", 3: "triangle", 9: "start", 8: "select", dpad: true };
  if (id === "arcade") return { ...base, 0: "1", 1: "2", 2: "4", 3: "3", 8: "coin", 9: "start", dpad: true };
  if (id === "atari2600") return { ...base, 0: "fire", 1: "fire", 2: "fire", 3: "fire", 9: "reset", 8: "select", dpad: true };
  return { ...base, dpad: !!base };
}
