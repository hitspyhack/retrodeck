/**
 * The configuration form used by both layers of the settings ladder:
 * per-system defaults (Decks view) and per-game overrides (game sheet).
 *
 * store.resolvedFor() merges  defaults -> system -> game, so the form shows the
 * value that is actually in effect and writes only to the layer you asked for.
 * That is why a Game Boy can default to a 3.5:4 aspect with the DMG palette
 * while one stubborn cartridge keeps its own core override.
 */
import { SYSTEM_BY_ID } from "../data/systems.js";
import { MODEL_BY_ID, modelsFor } from "../data/models.js";
import { SKINS, skinVars } from "../data/skins.js";
import { PADS, padsFor, padButtonIds } from "../data/layouts.js";
import { defaultMapping } from "../core/pad.js";
import { store } from "../core/store.js";
import { h, mount, toggle, range, select, sectionTitle, toast, textRow } from "../ui.js";
import { cheatsFor, formatCheats, parseCheats, setCheats } from "../core/cheats.js";

const SAVE_LOC = [
  ["browser", "Browser (keeps states in RetroDeck)"],
  ["download", "Download to my files"],
  ["both", "Both"],
];

/**
 * Cheat codes for the game being configured (or for the whole deck, at the system
 * layer, which is where a "every game on this console" list would live). The
 * runtime shows these in its own menu with a checkbox each, so this editor only
 * has to hold text: `Infinite lives | 0100FF00` per line.
 */
function cheatRow(sysId, scope) {
  const key = scope === "game" ? `game:${sysId}` : `sys:${sysId}`;
  let editing = false;
  const row = textRow("Cheat codes", "", async (v) => {
    if (editing) return;
    const saved = await setCheats(key, parseCheats(v));
    toast(saved.length ? `${saved.length} cheat(s) saved - they appear in the core's own menu` : "cheats cleared", "good", 3200);
  }, {
    hint: "one per line: name | code (Game Genie, PAR - the core decides)",
  });
  // Filled in once the vault answers, because a form that pretends a game has no
  // cheats until the read finishes is how you overwrite a real list with nothing.
  cheatsFor(key).then((rows) => {
    if (!rows.length) return;
    const input = row.querySelector("input");
    if (!input) return;
    editing = true;
    input.value = formatCheats(rows);
    editing = false;
  });
  return row;
}

export function configForm({ sysId, modelId, cfg = {}, set, scope = "system" }) {
  const sys = SYSTEM_BY_ID[sysId];
  const model = modelId ? MODEL_BY_ID[modelId] : null;
  const wrap = h("div", { style: { display: "grid", gap: "12px" } });

  mount(
    wrap,
    h("div.rows", {},
      select("Console model", cfg.model || model?.id || "", [
        ["", `Let RetroDeck choose (${defaultModelLabel(sysId)})`],
        ...modelsFor(sysId).map((m) => [m.id, `${m.name} · ${m.year || ""}`]),
      ], (v) => set({ model: v || null }), "drives shell art, screen box, pad and skin"),
      sys?.features?.cheats === false ? null : cheatRow(sysId, scope),
      // A deck with no core upstream shows the reason rather than an empty
      // dropdown: picking from nothing is what a form should never do.
      (sys?.cores || []).length
        ? select("Emulator core", cfg.core || sys?.ejsCore || "", [
          ...(sys?.cores || []).map((c) => [c.id, c.label]),
        ], (v) => set({ core: v }), "same console, different accuracy")
        : h("div.row", {},
          h("span.row__label", {}, "Emulator core", h("small.muted", {}, "nothing this deck can boot")),
          h("p.small.muted", {}, sys?.noCore || "This runtime publishes no core for this console.")),
      select("Controller layout", cfg.pad || model?.pad || sys?.pad || "", padsFor(sys).map((p) => [p, `${PADS[p].name}${PADS[p].aka ? ` - ${PADS[p].aka}` : ""}`]),
        (v) => set({ pad: v }), "which buttons you get on screen"),
      sys?.bios ? h("div.row", {},
        h("span.row__label", {}, "BIOS image", h("small.muted", {}, sys.bios.label || "required by the core")),
        h("button.btn.btn--sm", { onclick: () => import("../views/vault.js").then((m) => m.biosSheet(sysId)) },
          store.get(`bios.${sysId}.name`, null) ? "Change" : "Add")) : null,
    ),

    h("div.rows", {},
      select("Screen shader", cfg.shader || "none", [
        ["none", "None (raw pixels)"],
        ...(sys?.shaders || []).filter((x) => x !== "none").map((x) => [x, labelise(x)]),
      ], (v) => set({ shader: v })),
      sys?.palettes?.length
        ? select("Palette", cfg.palette || "", [["", "Core default"], ...sys.palettes.map((p) => [p.id, p.name])],
            (v) => set({ palette: v || null }), "what a 1989 LCD did to your colours")
        : null,
      select("Aspect ratio", cfg.aspect || (sys?.ar ? `${sys.ar[0]}:${sys.ar[1]}` : "auto"), [
        ["auto", "Auto"],
        ["1:1", "1:1 (pixel-perfect squares)"],
        ["4:3", "4:3"],
        ["16:9", "16:9"],
        ["8:7", "8:7 (Apple II-ish)"],
      ], (v) => set({ aspect: v })),
      select("Scaling", cfg.upscale || "integer", [
        ["integer", "Integer scale (sharp)"],
        ["smooth", "Stretch to fit (smooth)"],
      ], (v) => set({ upscale: v })),
      toggle("Confirm before quitting mid-game", cfg.confirmExit ?? store.get("emulator.exitConfirm", false), (v) => set({ confirmExit: v }),
        "the back arrow asks instead of dropping the core"),
    ),

    h("div.rows", {},
      toggle("Rewind", cfg.rewind ?? store.get("emulator.rewind", false), (v) => set({ rewind: v }), "keeps a rolling buffer, costs battery"),
      toggle("Fast forward toggle", cfg.fastForward ?? store.get("emulator.fastForward", false), (v) => set({ fastForward: v }), "hold the FF button in the toolbar"),
      select("Save states", cfg.saveStateLocation || store.get("emulator.saveStateLocation", "browser"), SAVE_LOC,
        (v) => set({ saveStateLocation: v })),
      range("Volume", Math.round((cfg.volume ?? store.get("emulator.volume", 0.7)) * 100), 0, 100, 1, (v) => set({ volume: v / 100 }), (v) => `${v}%`),
    ),

    h("div", {},
      sectionTitle("Buttons & keys",
        h("button.btn.btn--sm.btn--ghost", { onclick: () => resetKeys() }, "Reset to console defaults")),
      keyGrid(sys, cfg.controls || {}, (patch) => set({ controls: { ...(cfg.controls || {}), ...patch } })),
      h("p.small.muted", {},
        "The on-screen pad and these keys drive the same input. Keys are sent to the core as real keyboard events, so Remap in the emulator menu and here stay in agreement.",
      )),
  );
  return wrap;

  function resetKeys() {
    set({ controls: {} });
    toast("Keys back to the console defaults", "good");
  }
}

function defaultModelLabel(sysId) {
  const list = modelsFor(sysId);
  return list.length ? list[0].name : "auto";
}

const labelise = (s) => String(s).replace(/[_-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

/** Which skins a system's models ship with, flattened - for the label line. */
/**
 * Keyboard map for one console. `controls` is the map that the deck and the
 * emulator core both end up using, so editing it here edits the real thing;
 * `onPatch` writes to whichever layer the caller owns (system or game).
 *
 * Values are KeyboardEvent.code strings ("KeyZ", "ArrowUp"), which is what
 * pad.js, ejsControls() and the frame's synthetic events all speak.
 */
export function keyGrid(sys, controls = {}, onPatch = () => {}) {
  const system = typeof sys === "string" ? SYSTEM_BY_ID[sys] : sys;
  const sysId = system?.id;
  const cfg = store.systemConfig(sysId);
  const padId = cfg.pad || system?.pad;
  const pad = PADS[padId];
  const ids = pad && pad.widgets?.length ? padButtonIds(padId) : (system?.buttons || []).map((b) => b.id);
  const defaults = defaultMapping(system);
  const map = { ...defaults, ...(controls || {}) };
  const labelFor = (id) => (system?.buttons || []).find((b) => b.id === id)?.label || String(id).replace(/[-_]/g, " ");

  let capturing = null;
  const cells = new Map();

  function stopCapture() {
    if (!capturing) return;
    const cell = cells.get(capturing);
    if (cell) {
      cell.classList.remove("is-listening");
      cell.textContent = prettyKey(map[capturing] || defaults[capturing]);
    }
    capturing = null;
    document.body.classList.remove("is-capturing");
    window.removeEventListener("keydown", onKey, true);
  }

  function onKey(ev) {
    if (!capturing) return;
    ev.preventDefault();
    ev.stopPropagation();
    const code = ev.code || (ev.key ? `Key${String(ev.key).toUpperCase()}` : "");
    const id = capturing;
    stopCapture();
    if (ev.key === "Escape") return toast("Unchanged", "", 1200);
    if (ev.key === "Backspace" || ev.key === "Delete") {
      map[id] = null;
      onPatch({ [id]: null });
      return toast(`${labelFor(id)} cleared - falls back to ${prettyKey(defaults[id])}`, "", 2000);
    }
    map[id] = code;
    onPatch({ [id]: code });
    const cell = cells.get(id);
    if (cell) cell.textContent = prettyKey(code);
    toast(`${labelFor(id)} -> ${prettyKey(code)}`, "good", 1600);
  }

  function startCapture(id) {
    stopCapture();
    capturing = id;
    const cell = cells.get(id);
    if (cell) {
      cell.classList.add("is-listening");
      cell.textContent = "press a key";
    }
    document.body.classList.add("is-capturing");
    window.addEventListener("keydown", onKey, true);
  }

  const rows = h("div.rows", {});
  for (const id of ids) {
    const bound = map[id] || defaults[id];
    const cell = h("kbd.kbd", {
      class: map[id] ? "" : "is-default",
      title: map[id] ? "custom" : "console default",
    }, prettyKey(bound));
    cells.set(id, cell);
    rows.appendChild(
      h("div.row", {},
        h("span.row__label", {}, labelFor(id), h("small.muted", {}, id)),
        cell,
        h("div", { style: { display: "flex", gap: "6px" } },
          h("button.btn.btn--sm", { onclick: () => (capturing === id ? stopCapture() : startCapture(id)) }, "Rebind"),
          h("button.btn.btn--sm.btn--ghost", {
            onclick: () => {
              map[id] = null;
              onPatch({ [id]: null });
              cell.textContent = prettyKey(defaults[id]);
              cell.classList.add("is-default");
            },
          }, "Clear")))
    );
  }

  return h("div", {},
    h("p.small.muted", { style: { margin: "0 0 8px" } },
      `Layout "${pad?.name || padId}". Rebind writes to this ${sysId ? sysNameOf(sysId) : "system"} only - press Backspace in a listening box to hand the key back to the default.`,
    ),
    rows);
}

function sysNameOf(id) {
  return SYSTEM_BY_ID[id]?.name || id;
}

/** "KeyZ" -> "Z", "ArrowUp" -> "Up", "Digit1" -> "1", "Space" -> "Space". */
export function prettyKey(code) {
  if (!code) return "unbound";
  const m = /^Key([A-Z])$/.exec(code);
  if (m) return m[1];
  const d = /^Digit(\d)$/.exec(code);
  if (d) return d[1];
  const n = /^Numpad(\w+)$/.exec(code);
  if (n) return `Num ${n[1]}`;
  return (
    {
      ArrowUp: "Up", ArrowDown: "Down", ArrowLeft: "Left", ArrowRight: "Right",
      Space: "Space", Enter: "Enter", Escape: "Esc", Backspace: "Bksp", Tab: "Tab",
      ShiftLeft: "L-Shift", ShiftRight: "R-Shift", ControlLeft: "L-Ctrl", ControlRight: "R-Ctrl",
      AltLeft: "L-Alt", AltRight: "R-Alt", MetaLeft: "L-Cmd", MetaRight: "R-Cmd",
      Comma: ",", Period: ".", Slash: "/", Semicolon: ";", Quote: "'", Backquote: "`",
      Minus: "-", Equal: "=", Backslash: "\\|", BracketLeft: "[", BracketRight: "]",
    }[code] || (code.length <= 2 ? code.toUpperCase() : code.replace(/([a-z])([A-Z])/g, "$1 $2"))
  );
}

/**
 * Schematic of a control layout:
 the 100x46 unit space drawn as outlines, so a
 * player can see what they are picking before they touch it.
 */
export function padPreview(padId) {
  const pad = PADS[padId];
  if (!pad) return h("div.small.muted", {}, "custom layout");
  const units = pad.units || { w: 100, h: 46 };
  const style = {
    fill: "var(--shell-btn, #888)",
    "fill-opacity": "0.22",
    stroke: "currentColor",
    "stroke-opacity": "0.55",
    "stroke-width": "0.4",
  };
  const shapes = [];
  for (const w of pad.widgets) {
    if (w.t === "circle") {
      shapes.push(h("circle", { cx: w.x + (w.w || w.r * 2) / 2, cy: w.y + (w.h || w.r * 2) / 2, r: w.r || (w.w || 4) / 2, style }));
    } else {
      shapes.push(h("rect", { x: w.x, y: w.y, width: w.w, height: w.h, rx: w.t === "vdir" ? 0.8 : Math.min(w.w, w.h) * 0.28, style }));
    }
    if (w.type === "cluster") {
      for (let i = 0; i < (w.n || 4); i++) {
        shapes.push(h("circle", { cx: w.x + 1.6 + i * ((w.w - 3.2) / Math.max(1, (w.n || 4) - 1)), cy: w.y + w.h / 2, r: 0.85, style }));
      }
    }
    if (w.type === "dpad" && pad.dpadStyle === "cross") {
      shapes.push(h("rect", { x: w.x + w.w * 0.36, y: w.y + w.h * 0.08, width: w.w * 0.28, height: w.h * 0.84, rx: 0.6, style }));
      shapes.push(h("rect", { x: w.x + w.w * 0.08, y: w.y + w.h * 0.36, width: w.w * 0.84, height: w.h * 0.28, rx: 0.6, style }));
    }
  }
  return h("div.padPreview", { title: `${pad.name}${pad.aka ? ` (${pad.aka})` : ""}` },
    h("svg", {
      viewBox: `0 0 ${units.w} ${units.h}`,
      preserveAspectRatio: "xMidYMid meet",
      style: { width: "100%", height: "100%", display: "block" },
      "aria-hidden": "true",
    }, ...shapes));
}

export function skinCountFor(sysId) {
  const set = new Set();
  for (const m of modelsFor(sysId)) (m.skins || []).forEach((s) => set.add(s));
  return set.size || Object.keys(SKINS).length;
}
