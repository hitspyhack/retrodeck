/**
 * Decks: the hardware ladder.
 *
 *   #/decks        every system with the model you have equipped
 *   #/deck/<sys>   that console: model picker, shell art, skins, pad, config
 *
 * A "model" is not cosmetic - it selects the shell geometry, the default skin,
 * the pad layout and the screen box, so choosing a Game Boy Pocket instead of a
 * DMG changes the palette list, the aspect and the button cluster you get.
 */
import { store } from "../core/store.js";
import { SYSTEM_BY_ID } from "../data/systems.js";
import { MODELS, modelsFor, modelSummary, defaultModelFor } from "../data/models.js";
import { SKINS } from "../data/skins.js";
import { PADS } from "../data/layouts.js";
import { buildShell, screenStyle } from "../core/shell.js";
import { INDEX_COUNTS, sysName, sysColor, cartridgeSheet, readyGames, buttonsLine } from "./parts.js";
import { h, mount, sectionTitle, toast, esc as escAttr } from "../ui.js";
import { configForm, padPreview, skinCountFor } from "./config.js";

export async function renderDecks(root, ctx) {
  const systems = ctx.systems;
  mount(
    root,
    h("section", {},
      h("h1", {}, "Hardware"),
      h("p.muted.small", {},
        `${systems.length} consoles and portables, ${MODELS.length} real revisions, ${Object.keys(PADS).length} controller layouts. ` +
        "Pick the machine; the deck decides the buttons, the screen shape and the colours."),
      h("div.chips", {},
        h("button.chip.is-on", { onclick: () => ctx.go("/library?only=ready") }, "Ready to play", h("b", {}, String(readyGames().length))))),
    h("div.sysGrid", {},
      ...systems.map((s) => {
        const eq = ctx.equipped(s.id);
        return h("button.sysTile", {
          style: { "--swatch": s.color },
          onclick: () => ctx.go(`/deck/${s.id}`),
        },
          h("b", {}, s.name),
          h("span", {}, `${s.vendor} · ${s.year} · ${s.bits}-bit`),
          h("em", {}, eq.model ? eq.model.name : "no model"),
          h("span.small.muted", {}, `${INDEX_COUNTS[s.id] || 0} titles · ${eq.skinId ? SKINS[eq.skinId]?.name || eq.skinId : "default skin"}`));
      })),
  );
}

export async function renderDeck(root, ctx, sysId) {
  const sys = SYSTEM_BY_ID[sysId];
  if (!sys) {
    mount(root, h("div.notice.notice--bad", {},
      h("b", {}, `Unknown system "${sysId}".`),
      h("button.btn.btn--sm", { onclick: () => ctx.go("/decks") }, "All hardware")));
    return;
  }
  const shellHost = h("div.deck__shell");
  const set = (patch) => {
    store.setSystem(sysId, patch);
    if (patch.model) store.set("play.lastSystem", sysId);
    render();
  };

  function render() {
    const cfg = store.systemConfig(sysId);
    const eq = ctx.equipped(sysId);
    const m = eq.model || defaultModelFor(sysId);
    const skinId = cfg.skin || m?.skins?.[0] || null;
    ctx.applySkin(skinId, m?.skinAccent || sys.color);

    const shell = m ? buildShell(m) : null;
    mount(shellHost, shell ? shellNode(shell, m, cfg, sys) : h("div.empty", {}, h("h3", {}, "No shell art for this model")));

    const modelPanel = h("div.deck__panel", { style: { display: "grid", gap: "10px" } },
      sectionTitle("Model", h("span.small.mono.muted", {}, m?.tpl || "")),
      h("div.chips", {}, ...modelsFor(sysId).map((mm) =>
        h(`button.chip${mm.id === m?.id ? ".is-on" : ""}`, { onclick: () => set({ model: mm.id }) }, mm.name))),

      shellHost,
      m ? h("div.rows", {}, ...summaryRows(m)) : null);

    const padId = cfg.pad || m?.pad || sys.pad;
    const controlsPanel = h("div.deck__panel", { style: { display: "grid", gap: "10px" } },
      sectionTitle("Controls", h("span.small.muted", {}, PADS[padId]?.name || padId)),
      padPreview(padId),
      h("p.small.muted", { html: `Buttons: ${buttonsLine(sysId)}` }),
      h("div.rows", {},
        h("div.row", {},
          h("span.row__label", {}, "Layouts for this console",
            h("small.muted", {}, "each one moves the buttons to where the real hardware put them")),
          h("b.mono", {}, String((sys.pads || []).length || 1))),
        h("div.row", {},
          h("span.row__label", {}, "Keyboard"),
          h("b.mono", {}, "arrows + Z X")),
        h("div.row", {},
          h("span.row__label", {}, "USB / Bluetooth gamepad", h("small.muted", {}, "standard mapping, polled by the pad layer")),
          h("b.mono", {}, "plug in")),
        h("div.row", {},
          h("span.row__label", {}, "Haptics", h("small.muted", {}, "vibrate on hit where the browser allows it")),
          h("b.mono", {}, store.get("play.haptics", true) ? "on" : "off"))),
      h("div", { style: { display: "flex", gap: "8px", flexWrap: "wrap" } },
        h("button.btn.btn--sm", { onclick: () => ctx.go("/settings") }, "Tune the pad"),
        h("button.btn.btn--sm.btn--ghost", {
          onclick: () => toast("This pad comes from js/data/layouts.js - change a layout there and reload to see it", "info", 5000),
        }, "Where this comes from")));

    const skinsPanel = h("div.deck__panel", { style: { display: "grid", gap: "10px" } },
      sectionTitle("Skins", h("span.small.mono.muted", {}, `${m?.skins?.length || skinCountFor(sysId)} for this model · ${Object.keys(SKINS).length} total`)),
      h("p.small.muted", {}, "A skin is 22 colour variables: the shell art and the on-screen pad read them, so the whole deck changes finish at once. No images, nothing to download."),
      h("div.skins", {}, ...skinRow(sysId, m, cfg, set, ctx)));

    const configPanel = h("div.deck__panel", { style: { display: "grid", gap: "10px" } },
      sectionTitle("Defaults for this console",
        h("button.btn.btn--sm.btn--ghost", {
          onclick: () => {
            store.state.system[sysId] = {};
            store.emit(`system.${sysId}`, {});
            store.save();
            render();
            toast("System overrides cleared", "good");
          },
        }, "Clear")),
      configForm({
        sysId,
        modelId: m?.id || null,
        cfg: { ...store.resolvedFor("", sysId), model: cfg.model || m?.id || null },
        set,
        scope: "system",
      }));

    mount(root,
      head(sys, m, ctx),
      h("div.deck", {},
        h("div.deck__grid", {}, modelPanel, controlsPanel),
        skinsPanel,
        configPanel,
        gamesStrip(sysId, ctx)));
  }
  render();
}

function head(sys, model, ctx) {
  return h("section", {},
    h("div", { style: { display: "flex", gap: "10px", alignItems: "baseline", flexWrap: "wrap" } },
      h("h1", {}, sys.name),
      h("span.stat", {}, `${sys.vendor} · ${sys.year}`),
      h("span.stat", {}, `${sys.bits}-bit`),
      model ? h("span.stat", {}, model.name) : null),
    h("p.muted.small", {}, sys.note || ""),
    // A console this runtime has no core for says so on its own page, before you
    // go looking for a disc image to import.
    sys.noCore ? h("div.notice", {}, h("span", {}, sys.noCore)) : null,
    sys.aka?.length ? h("p.small.muted", {}, "Also known as: ", sys.aka.join(", ")) : null,
    h("div", { style: { display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "8px" } },
      h("button.btn.btn--sm.btn--ghost", { onclick: () => ctx.go("/decks") }, "◂ All hardware"),
      h("button.btn.btn--sm", { onclick: () => ctx.go(`/library/${sys.id}`) }, `Games (${INDEX_COUNTS[sys.id] || 0})`),
      h("button.btn.btn--sm.btn--primary", { onclick: () => cartridgeSheet(null) }, "+ Add a cartridge")));
}

function summaryRows(m) {
  const sum = modelSummary(m) || {};
  const entries = Object.entries(sum).filter(([, v]) => v != null && v !== "");
  const rows = entries.map(([k, v]) =>
    h("div.row", {},
      h("span.row__label", {}, labelise(k)),
      h("b.mono.small", { style: { textAlign: "right", maxWidth: "62%" } }, Array.isArray(v) ? v.join(", ") : String(v))));
  if (m.extras?.length) rows.push(h("div.row", {}, h("span.row__label", {}, "Extras"), h("b.mono.small", { style: { textAlign: "right" } }, m.extras.join(", "))));
  return rows;
}
const labelise = (s) => String(s).replace(/[_-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

/** The shell with the screen box cut out of it, ready to receive a game. */
function shellNode(shell, model, cfg, sys) {
  const box = shell.screen;
  const geo = screenStyle(box, shell.box?.[0] ?? 100, shell.box?.[1] ?? 100);
  const inner = h("div.shell__screen", {
    style: { ...geo, aspectRatio: `${box.w} / ${box.h}` },
    "data-crt": (cfg.shader || "none") === "none" ? "off" : "on",
  }, h("div", {
    style: {
      position: "absolute", inset: 0, display: "grid", placeItems: "center",
      background: "repeating-linear-gradient(180deg,#0b1018 0 3px,#080c12 3px 6px)",
      color: "var(--ink-3)", font: "500 clamp(9px,1.6vw,13px)/1.4 var(--mono)", textAlign: "center", padding: "6px",
    },
    html: `<span>${escAttr(model.name)}<br><span style="opacity:.7">${escAttr(cfg.aspect || (sys?.ar ? sys.ar.join(":") : "auto"))} · ${escAttr(model.screen?.res || "")}</span></span>`,
  }));
  if (shell.secondScreen) {
    const g2 = screenStyle(shell.secondScreen, shell.box?.[0] ?? 100, shell.box?.[1] ?? 100);
    inner.append(h("div.shell__second", { style: { ...g2, aspectRatio: `${shell.secondScreen.w} / ${shell.secondScreen.h}` } }));
  }
  return h("div.shell", { "data-glass": "on" },
    h("div", { html: shell.svg }),
    inner);
}

function skinRow(sysId, model, cfg, set, ctx) {
  const ids = model?.skins?.length ? model.skins : Object.keys(SKINS);
  const active = cfg.skin || model?.skins?.[0];
  return ids.map((id) => {
    const sk = SKINS[id];
    if (!sk) return null;
    return h(`button.skin${active === id ? ".is-on" : ""}`, {
      type: "button",
      title: sk.name || id,
      style: {
        "--shell": sk.shell, "--shellHi": sk.shellHi || sk.shell, "--shell2": sk.shell2 || sk.shell,
        "--btnA": sk.btnA || sk.btn, "--btnB": sk.btnB || sk.btn, "--dpad": sk.dpad || sk.btn,
      },
      onclick: () => {
        set({ skin: id });
        ctx.applySkin(id, model?.skinAccent || SYSTEM_BY_ID[sysId].color);
        toast(`${sk.name || id} equipped`, "good", 1600);
      },
    },
      h("i", {}),
      h("u", {}, h("b", { style: { background: sk.btnA || sk.btn } }), h("b", { style: { background: sk.btnB || sk.btn } }), h("b", { style: { background: sk.dpad || sk.btn } })),
      h("span", {}, (sk.name || id).split(" (")[0]));
  }).filter(Boolean);
}

/** Ready-to-play games on this console, so the deck view can launch directly. */
function gamesStrip(sysId, ctx) {
  const list = readyGames().filter((g) => g.system === sysId).slice(0, 12);
  if (!list.length) return null;
  return h("div.deck__panel", { style: { display: "grid", gap: "10px" } },
    sectionTitle("Ready to play here", h("button.btn.btn--sm.btn--ghost", { onclick: () => ctx.go(`/library/${sysId}`) }, "All games ▸")),
    h("div.cards", {}, ...list.map((g) => {
      return h("button.card", {
        onclick: () => {
          location.hash = g.builtin ? `#/play/${g.builtin}` : `#/play/rom:${store.gameConfig(g.id).romHash}?game=${encodeURIComponent(g.id)}`;
        },
      },
        h("span.card__body", { style: { padding: "10px 8px" } },
          h("b.card__title", {}, g.title),
          h("span.card__meta", {}, h("i", {}, g.builtin ? "built-in" : "in vault"))));
    })));
}
