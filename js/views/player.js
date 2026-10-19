/**
 * The player: one screen, two engines.
 *
 *   #/play/builtin:chomp          - RetroDeck's own canvas host
 *   #/play/rom:<hash>?game=<id>   - EmulatorJS inside the isolated iframe
 *
 * Both get the same hardware furniture: the shell of the console model you
 * equipped, its skin colours, the matching button layout, the toolbar with
 * save states / screenshot / fast forward, and the pad. Built-in games and
 * cartridges are wired to the same Deck instance, which is the point of the
 * whole project: a Game Boy pad is a Game Boy pad whether the code running on
 * the other side of it is a 1989 ROM or a 400-line maze game.
 */
import { store, fmtBytes, fmtDate } from "../core/store.js";
import { SYSTEM_BY_ID } from "../data/systems.js";
import { MODEL_BY_ID, MODELS_BY_SYSTEM, defaultModelFor } from "../data/models.js";
import { PADS } from "../data/layouts.js";
import { buildShell, screenStyle } from "../core/shell.js";
import { Deck, ejsControls, defaultMapping } from "../core/pad.js";
import { EmuPlayer, probeEmulator, localVendorPresent } from "../core/emulator.js";
import { GameHost } from "../games/engine.js";
import { gameFor } from "../games/index.js";
import { vault } from "../core/idb.js";
import { h, mount, sheet, toast, range, toggle, keepScreenOn, lockOrientation, fullscreen, confirmSheet, download, onKey } from "../ui.js";
import { gameById, sysName, loadBundledRom } from "./parts.js";

export class PlayerView {
  constructor(o) {
    this.o = o;
    this.el = null;
    this.deck = null;
    this.emu = null;
    this.host = null;
    this.built = false;
    this.game = null;
    this.rom = null;
    this.sysId = null;
    this.model = null;
    this.padId = null;
    this.alive = true;
    this._cleanup = [];
    this.wasPaused = false;
  }

  /* ------------------------------------------------------------- assemble */
  async mount() {
    const { ref, query } = this.o;
    const [kind, arg] = String(ref || "").split(":");
    if (kind === "builtin" || gameFor(ref)) {
      const id = kind === "builtin" ? ref : `builtin:${ref}`;
      const def = gameFor(id) || gameFor(id.replace("builtin:", ""));
      if (!def) return this.fail(`Unknown built-in title "${ref}".`);
      this.built = true;
      this.gameDef = def;
      this.game = gameById(id) || { id, title: def.title, system: def.system, builtin: def.id };
      this.sysId = def.system;
    } else if (kind === "rom") {
      const hash = (arg || "").split("?")[0];
      const rec = await vault.romFor(hash);
      if (!rec) return this.fail("That cartridge is not in this browser's vault any more.");
      this.rom = { bytes: rec.bytes, name: rec.fileName || rec.name, hash };
      this.game = gameById(query.game) || { id: query.game || `rom:${hash}`, title: rec.name || "Cartridge", system: rec.system };
      this.sysId = store.gameConfig(this.game.id).system || rec.system || query.system || "nes";
    } else if (kind === "bundled") {
      // a homebrew file the build found in homebrew/<system>/ - served by us,
      // so it never touches the vault and needs no import step
      const g = gameById(arg);
      if (!g) return this.fail(`Nothing in the catalogue is keyed "${arg}".`);
      if (!g.rom) return this.fail(`${g.title} has no file in homebrew/ on this server - run npm run build after adding it.`);
      try {
        const file = await loadBundledRom(g);
        this.rom = { bytes: file.bytes, name: file.name, hash: `bundled:${g.id}` };
      } catch (err) {
        return this.fail(`Could not read ${g.rom} from this server: ${(err && err.message) || err}`);
      }
      this.game = g;
      this.sysId = g.system;
    } else {
      return this.fail(`I do not know how to play "${ref}".`);
    }

    const sys = SYSTEM_BY_ID[this.sysId] || SYSTEM_BY_ID.nes;
    this.sys = sys;
    const cfgSys = store.systemConfig(sys.id);
    const cfgGame = store.gameConfig(this.game.id);
    this.cfg = { ...store.resolvedFor(this.game.id, sys.id), ...cfgGame };
    this.modelId =
      cfgGame.model ||
      cfgSys.model ||
      (MODELS_BY_SYSTEM[sys.id]?.includes(store.get("play.lastModel", "")) ? store.get("play.lastModel") : null) ||
      defaultModelFor(sys.id)?.id ||
      null;
    this.model = MODEL_BY_ID[this.modelId] || defaultModelFor(sys.id) || null;
    this.padId = cfgGame.pad || cfgSys.pad || this.model?.pad || sys.pad;

    store.set("play.lastSystem", sys.id);
    if (this.modelId) store.set("play.lastModel", this.modelId);
    store.recordPlay(this.game.id, { system: sys.id, title: this.game.title });

    // skin: the shell art and the pad both read these variables
    const { skinVars } = await import("../data/skins.js");
    const vars = skinVars(cfgGame.skin || cfgSys.skin || this.model?.skins?.[0] || null);
    if (this.model?.skinAccent) vars["--accent"] = this.model.skinAccent;
    else if (sys.color) vars["--accent"] = sys.color;
    this.skinVars = vars;

    this.buildDom();
    this.applySkin(true);
    // The engine starts in the background. Awaiting it here would lock the
    // whole app while a core downloads - or while it never answers at all -
    // and navigation would be dead until it settled.
    this.engineReady = this.wireEngine(query).catch((err) => {
      console.warn("[retrodeck] engine failed to start", err);
      if (this.alive) this.emuError({ code: "launch", msg: String(err?.message || err) });
    });
    this.wireChrome();
  }

  fail(msg) {
    mount(this.o.root, h("div.player", {}, h("div.player__load", {},
      h("h2", {}, "Cannot start"),
      h("p.small.muted", {}, msg),
      h("button.btn.btn--primary", { onclick: () => (location.hash = "#/") }, "Back to the deck"))));
    this.o.root.classList.add("is-open");
  }

  buildDom() {
    const shell = this.model ? buildShell(this.model) : null;
    this.shell = shell;
    const screenBox = shell?.screen || { x: 4, y: 6, w: 92, h: 60 };
    const vw = shell?.box?.[0] ?? 100;
    const vh = shell?.box?.[1] ?? 100;
    const geo = screenStyle(screenBox, vw, vh);

    this.screenHost = h("div.shell__screen", {
      id: "screen",
      style: { ...geo, aspectRatio: `${screenBox.w} / ${screenBox.h}` },
      "data-crt": this.cfg.shader && this.cfg.shader !== "none" ? "on" : "off",
    }, h("div.player__load", { id: "load" },
      h("div.bar", {}, h("i", {})),
      h("b", {}, this.built ? "Starting the built-in engine" : "Fetching the core"),
      h("span.small.muted", {}, this.built ? "" : `${dataBaseLine(this.sys)} - if this hangs you are offline: Settings ▸ Emulator ▸ Source, or run \`npm run vendor\`.`)));

    const second = shell?.secondScreen
      ? h("div.shell__second", { style: { ...screenStyle(shell.secondScreen, vw, vh), aspectRatio: `${shell.secondScreen.w} / ${shell.secondScreen.h}` } })
      : null;

    this.padHost = h("div.player__pad");
    const toolbar = h("div.player__bar", {},
      h("button.icon", { "aria-label": "Quit to the deck", title: "Quit (Esc)", onclick: () => this.quit() }, "✕"),
      h("div.player__title", {},
        h("b", {}, this.game.title || "Game"),
        h("span", {}, `${sysName(this.sys.id)} · ${this.model?.name || "generic deck"} · ${PADS[this.padId]?.name || this.padId}`)),
      h("button.icon", { title: "Save state (F2)", "aria-label": "Save state", onclick: () => this.saveState() }, "💾"),
      h("button.icon", { title: "Load state (F4)", "aria-label": "Load state", onclick: () => this.loadState() }, "⤓"),
      h("button.icon", { title: "States and screenshots", "aria-label": "States", onclick: () => this.statesSheet() }, "☰"),
      h("button.icon", { title: "Fast forward (hold Space)", "aria-label": "Fast forward", onclick: (e) => this.toggleFF(e.currentTarget) }, "»"),
      h("button.icon", { title: "Screenshot", "aria-label": "Screenshot", onclick: () => this.shot() }, "📷"),
      h("button.icon", { title: "Pad and screen options", "aria-label": "Options", onclick: () => this.optionsSheet() }, "⚙"),
      h("button.icon", { title: "Theatre mode - hide the shell", "aria-label": "Theatre", onclick: (e) => this.toggleTheater(e.currentTarget) }, "⛶"));

    this.el = h("div.player", {
      dataset: { padzone: store.get("play.padZone", "edges"), theater: "0" },
      role: "application",
      "aria-label": `${this.game.title} on ${sysName(this.sys.id)}`,
    },
      toolbar,
      h("div.player__stage", {},
        h("div.shell", { "data-glass": store.get("play.glass", "on") },
          shell ? h("div", { html: shell.svg }) : null,
          this.screenHost,
          second),
        h("div", { style: { position: "absolute", inset: "auto 8px 8px auto", zIndex: 4 }, id: "fpsline" }),
        this.padHost),
    );
    this.toolbar = toolbar;
    mount(this.o.root, this.el);
    this.o.root.classList.add("is-open");
    document.body.classList.add("is-playing");
    this.layoutPad();
  }

  layoutPad() {
    const show = store.get("play.showPad", true);
    const float = store.get("play.padFloat", true);
    if (!show) {
      mount(this.padHost, "");
      this.deck?.destroy();
      return;
    }
    this.padHost.className = float ? "padHost padHost--float" : "padHost padHost--docked";
    this.el.classList.toggle("is-landscape", float && window.matchMedia("(orientation: landscape)").matches);
    if (this.deck) return;
    this.deck = new Deck({
      mount: this.padHost,
      system: this.sys,
      padId: this.padId,
      mapping: { ...defaultMapping(this.sys), ...(this.cfg.controls || {}) },
      bridge: this.built ? "native" : store.get("emulator.inputBridge", "keyboard"),
      onNative: (id, down) => this.built && this.host?.button(id, down),
      onAction: (name, payload) => this.padAction(name, payload),
      inputTarget: () => this.emu?.inputTargetDoc() || document,
      rpc: this.built ? null : (idx, down) => this.emu?.rpcButton(idx, down),
      scale: store.get("play.padScale", 1),
      opacity: store.get("play.padOpacity", 0.9),
    });
    this.deck.build();
  }

  padAction(name, payload) {
    if (name === "action") {
      if (payload.action === "menu") this.emu?.openMenu();
      if (payload.action === "save") this.saveState();
      if (payload.action === "load") this.loadState();
      if (payload.action === "reset") this.emu?.reset();
      if (payload.action === "quit") this.quit();
    }
    if (name === "switch" && payload.id === "turbo") this.deck?.setTurbo?.("a", payload.on);
  }

  /* ------------------------------------------------------------- engines */
  async wireEngine(query) {
    if (this.built) {
      const canvas = h("canvas.game-canvas", { id: "game" });
      const load = this.screenHost.querySelector("#load");
      this.screenHost.insertBefore(canvas, load);
      const def = this.gameDef;
      this.host = new GameHost({
        canvas,
        game: def,
        deck: this.deck || null,
        cfg: { autoFire: true, ...this.cfg },
        onEvent: (n, p) => this.onBuiltEvent(n, p),
      });
      this.host.start();
      load?.remove();
      if (query?.slot) toast("Built-in titles store their best score in this browser; slot states apply to cartridge games", "info", 4200);
      return;
    }
    const host = this.screenHost;
    // Fast pre-flight: if neither the CDN nor a local vendor copy answers in a
    // couple of seconds, say so now instead of staring at a spinner for 25.
    if (store.get("emulator.source", "cdn") !== "local") {
      const probe = await probeEmulator({ timeout: 2500 });
      if (!probe.ok) {
        if (!(await localVendorPresent())) {
          this.emuError({
            code: "no-runtime",
            msg: `Nothing answered at ${probe.url}${probe.error ? ` (${probe.error})` : ""}, and there is no vendor/ copy on this server.`,
          });
          return;
        }
        this.cfg = { ...this.cfg, source: "local" };
      }
    }
    this.emu = new EmuPlayer({
      host,
      game: { ...this.game, ext: (this.rom.name || "").split(".").pop(), hash: this.rom.hash },
      rom: this.rom,
      systemId: this.sys.id,
      modelId: this.modelId,
      config: {
        ...this.cfg,
        controls: { ...defaultMapping(this.sys), ...(this.cfg.controls || {}) },
        aspect: this.cfg.aspect || (this.sys.ar ? `${this.sys.ar[0]}:${this.sys.ar[1]}` : "auto"),
      },
    });
    this.emu.on((ev) => this.onEmuEvent(ev));
    const ok = await this.emu.start();
    if (!ok && this.alive) this.screenHost.querySelector("#load b")?.replaceWith(h("b", {}, "The core did not start"));
    if (query?.slot != null && ok) setTimeout(() => this.emu.loadState(Number(query.slot)), 1200);
  }

  onBuiltEvent(name, payload) {
    if (name === "crash") {
      toast(`The built-in engine hit an error: ${payload.msg}`, "bad", 6000);
      this.stopAll();
    }
    if (name === "gameover") toast(`Game over · ${payload.msg || ""}`, "info", 2600);
    if (name === "level") this.flash(`WAVE ${payload.level}`);
    if (name === "lines" || name === "boss") this.flash(name === "boss" ? "CAPITAL SHIP DOWN" : `${payload.n || ""} LINES`);
  }

  onEmuEvent(ev) {
    const load = this.screenHost.querySelector("#load");
    switch (ev.type) {
      case "ready":
      case "started":
        load?.remove();
        if (ev.type === "started") this.flash("READY");
        break;
      case "state-saved":
        this.flash(`STATE ${ev.slot}`);
        toast(`Save state ${ev.slot} written to this device`, "good");
        break;
      case "state-loaded":
        this.flash(`LOADED ${ev.slot}`);
        break;
      case "sram":
        toast(`Battery save captured (${fmtBytes(ev.size)})`, "good", 2200);
        break;
      case "warn":
        toast(ev.msg, "warn", 5200);
        break;
      case "error":
        this.emuError(ev);
        break;
      case "exit":
        this.quit();
        break;
      default:
        break;
    }
  }

  emuError(ev) {
    const load = this.screenHost.querySelector("#load");
    const body = h("div", { style: { display: "grid", gap: "10px", maxWidth: "420px" } },
      h("b", {}, ev.code === "core-timeout" ? "The emulator never answered" : "The core could not load"),
      h("p.small.muted", {}, ev.msg || "unknown error"),
      h("div.notice", {}, h("span", {}, "Three ways out: pick another core for this deck, play one of the six built-in titles (they need nothing from the network), or mirror EmulatorJS into ", h("code", {}, "vendor/"), " with ", h("code", {}, "npm run vendor"), " and reload.")),
      h("p.small.muted", {}, `It asked for `, h("code", {}, `cores/${ev.core || this.cfg.core || this.sys.ejsCore}`), ` - a mirror without that core answers 404, and the shelf config lists the ones the deck can boot.`),
      h("div.notice__row", {},
        h("button.btn.btn--sm.btn--primary", { onclick: () => (location.hash = "#/play/builtin:chomp") }, "Play Maze Chomp"),
        h("button.btn.btn--sm", { onclick: () => this.retry() }, "Try again"),
        h("button.btn.btn--sm", { onclick: () => (location.hash = `#/deck/${this.sys.id}`) }, "Other cores"),
        h("button.btn.btn--sm.btn--ghost", { onclick: () => (location.hash = "#/settings") }, "Emulator settings")));
    if (load) mount(load, body);
    else this.screenHost.append(h("div.player__load", {}, body));
  }

  async retry() {
    this.screenHost.append(h("div.player__load", { id: "load" }, h("div.bar", {}, h("i", {})), h("b", {}, "Retrying…")));
    await this.emu?.stop();
    this.emu = null;
    await this.wireEngine(this.o.query).catch(() => {});
  }

  flash(text) {
    const line = this.el.querySelector("#fpsline");
    if (!line) return;
    mount(line, h("span.stat", {}, text));
    setTimeout(() => {
      if (line.firstChild?.textContent === text) mount(line, "");
    }, 900);
  }

  /* -------------------------------------------------------------- chrome */
  wireChrome() {
    if (store.get("play.fullscreenOnPlay", true)) fullscreen(this.el, true);
    keepScreenOn(store.get("play.keepScreenOn", true));
    lockOrientation(store.get("play.orientationLock", "auto"));
    const mq = window.matchMedia("(orientation: landscape)");
    const onMq = () => this.layoutPad();
    mq.addEventListener?.("change", onMq);
    this._cleanup.push(() => mq.removeEventListener?.("change", onMq));
    if (this.deck) this.deck.setBridge(store.get("emulator.inputBridge", "keyboard"));
    this._cleanup.push(
      onKey({
        escape: () => this.quit(),
        f2: () => this.saveState(),
        f4: () => this.loadState(),
        f3: () => this.shot(),
        p: () => this.built && this.host.pause(),
        " ": (e) => {
          if (!this.emu) return;
          this.emu.fastForward(true);
          const up = () => {
            this.emu.fastForward(false);
            window.removeEventListener("keyup", up);
          };
          window.addEventListener("keyup", up);
          e.preventDefault?.();
        },
      }),
    );
    let lastTap = 0;
    const tap = (e) => {
      if (!store.get("play.doubleTapForMenu", true) || !this.emu) return;
      const t = Date.now();
      if (t - lastTap < 330 && e.target.closest?.("#screen")) this.emu.openMenu();
      lastTap = t;
    };
    this.el.addEventListener("dblclick", tap);
    this._cleanup.push(() => this.el.removeEventListener("dblclick", tap));
  }

  applySkin(on) {
    const el = document.documentElement;
    if (on) for (const [k, v] of Object.entries(this.skinVars)) el.style.setProperty(k, v);
    else for (const k of Object.keys(this.skinVars)) el.style.removeProperty(k);
  }

  /* -------------------------------------------------------------- states */
  get gameKey() {
    return this.built ? `builtin:${this.gameDef.id}` : this.game.id;
  }

  async saveState() {
    if (this.emu) {
      const slot = await this.nextSlot();
      this.emu.slot = slot;
      this.emu.saveState(slot);
      return;
    }
    // built-ins: no core to snapshot, so keep the picture and the score
    const { dataUrl, bytes } = await this.canvasPng();
    const meta = { title: this.game.title, score: this.host?.score ?? 0, kind: "builtin-snapshot" };
    await vault.saveState(this.gameKey, 0, bytes || new Uint8Array(0), dataUrl || null, meta);
    toast("Snapshot kept (built-in games cannot be restored mid-run, but the score and best are saved)", "info", 5200);
    this.flash("SNAP");
  }

  async nextSlot() {
    const list = (await vault.statesFor(this.gameKey).catch(() => [])) || [];
    const used = new Set(list.map((s) => s.slot));
    for (let i = 0; i < 10; i++) if (!used.has(i)) return i;
    return 0;
  }

  async loadState() {
    if (this.emu) {
      const list = (await vault.statesFor(this.gameKey).catch(() => [])) || [];
      if (!list.length) return toast("No save states for this game yet - press the save icon first", "warn", 3800);
      const newest = list.slice().sort((a, b) => (b.at || 0) - (a.at || 0))[0];
      this.emu.loadState(newest.slot);
      toast(`Loading slot ${newest.slot} (${fmtDate(newest.at)})`, "good");
      return;
    }
    toast("Built-in titles save their best score automatically; there is nothing to rewind to", "info", 3600);
  }

  async shot() {
    const png = this.built ? (await this.canvasPng()).bytes : await this.emu?.screenshot();
    if (!png) return toast("The core has not produced a frame yet", "warn");
    const name = `${(this.game.title || "retrodeck").replace(/[^\w.-]+/g, "-").toLowerCase()}-${Date.now()}.png`;
    download(name, new Blob([png], { type: "image/png" }));
    toast("Screenshot saved to your downloads", "good");
  }

  /** PNG of the last frame, as a data URL (for the sheet) and bytes (for storage). */
  canvasPng() {
    const canvas = this.screenHost.querySelector("canvas");
    if (!canvas) return { dataUrl: null, bytes: null };
    let dataUrl = null;
    try {
      dataUrl = canvas.toDataURL("image/png");
    } catch (err) {
      console.warn("[retrodeck] screenshot failed", err);
      return { dataUrl: null, bytes: null };
    }
    const bytes = new TextEncoder().encode(dataUrl);
    return { dataUrl, bytes };
  }

  async statesSheet() {
    const list = (await vault.statesFor(this.gameKey).catch(() => [])) || [];
    const body = h("div", { style: { display: "grid", gap: "10px" } },
      list.length
        ? h("div.list", {}, ...list
            .slice()
            .sort((a, b) => (b.at || 0) - (a.at || 0))
            .map((st) => h("div.li", {},
              st.shot ? h("img", { src: shotSrc(st.shot), alt: "state screenshot", style: { width: "72px", height: "54px", objectFit: "cover", borderRadius: "4px" } }) : null,
              h("div.li__main", {},
                h("b", {}, `Slot ${st.slot}`),
                h("span", {}, `${fmtDate(st.at)} · ${fmtBytes(st.bytes?.length || 0)}`)),
              h("div", { style: { display: "flex", gap: "6px" } },
                h("button.btn.btn--sm", { onclick: () => { s.close(); this.emu?.loadState(st.slot); } }, "Load"),
                h("button.btn.btn--sm.btn--ghost", {
                  onclick: async () => { await vault.deleteState(this.gameKey, st.slot); toast("Deleted", "good"); s.close(); this.statesSheet(); },
                }, "✕")))))
        : h("div.notice", {}, h("span", {}, this.built
            ? "Built-in titles keep their best score in localStorage and can be snapshotted with the save button - full save states apply to cartridge games."
            : "No states yet. Press 💾 (or F2) while the game is running.")),
      h("div.notice__row", {},
        h("button.btn.btn--sm", { onclick: () => { this.saveState(); setTimeout(() => { s.close(); this.statesSheet(); }, 700); } }, "Save now"),
        h("button.btn.btn--sm.btn--ghost", { onclick: () => this.shot() }, "Screenshot")));
    const s = sheet(`${this.game.title} · states`, body, { wide: true });
  }

  /* ------------------------------------------------------------- options */
  optionsSheet() {
    const set = (k, v) => {
      store.set(k, v);
      if ((k === "play.padScale" || k === "play.padOpacity") && this.deck) this.deck.update({ [k.split(".")[1]]: v });
      if (k === "play.showPad" || k === "play.padFloat" || k === "play.padZone") {
        this.deck?.destroy();
        this.deck = null;
        this.el.dataset.padzone = store.get("play.padZone", "edges");
        this.layoutPad();
      }
      if (k === "emulator.inputBridge" && !this.built) this.deck?.setBridge(v);
      // the shell reads its glass state from a data attribute, so this is a
      // two-line live edit rather than a rebuild of the hardware art
      if (k === "play.glass") this.el.querySelector(".shell")?.setAttribute("data-glass", v);
    };
    const body = h("div", { style: { display: "grid", gap: "8px" } },
      range("Pad size", store.get("play.padScale", 1), 0.6, 1.6, 0.05, (v) => set("play.padScale", v), (v) => `${Math.round(v * 100)}%`),
      range("Pad opacity", store.get("play.padOpacity", 0.9), 0.25, 1, 0.05, (v) => set("play.padOpacity", v), (v) => `${Math.round(v * 100)}%`),
      toggle("Show the on-screen pad", store.get("play.showPad", true), (v) => set("play.showPad", v)),
      toggle("Float the pad over the picture", store.get("play.padFloat", true), (v) => set("play.padFloat", v)),
      toggle("Haptics", store.get("play.haptics", true), (v) => set("play.haptics", v)),
      toggle("Screen glass overlay", store.get("play.glass", "on") !== "off", (v) => set("play.glass", v ? "on" : "off")),
      this.built
        ? h("div.notice", {}, h("span", {}, `Built-in game · ${this.gameDef.w}×${this.gameDef.h} canvas, 60 Hz fixed step, ${PADS[this.padId]?.name || this.padId}.`))
        : h("div.rows", {},
            h("div.row", {},
              h("span.row__label", {}, "Core"),
              h(
                "b.mono.small",
                {},
                this.emu?.coreName || this.cfg.core || (this.sys.ejsCore === "auto" ? "detected from the file" : this.sys.ejsCore)
              )),
            h("div.row", {},
              h("span.row__label", {}, "Shader"),
              h("b.mono.small", {}, this.cfg.shader || "none")),
            h("div.row", {},
              h("span.row__label", {}, "Volume"),
              range("Volume", Math.round((this.cfg.volume ?? 0.7) * 100), 0, 100, 1, (v) => {
                this.cfg.volume = v / 100;
                this.emu?.setVolume(v / 100);
              }, (v) => `${v}%`)),
            h("div.row", {},
              h("span.row__label", {}, "Emulator menu"),
              h("button.btn.btn--sm", { onclick: () => this.emu?.openMenu() }, "Open"))),
      h("div.notice__row", {},
        h("button.btn.btn--sm.btn--ghost", { onclick: () => (this.built ? this.host?.restart() : this.emu?.reset()) }, "Reset game"),
        this.built ? null : h("button.btn.btn--sm.btn--ghost", { onclick: () => { location.hash = "#/settings"; } }, "Emulator settings"),
        h("button.btn.btn--sm.btn--ghost", { onclick: () => this.toggleTheater(null) }, "Hide shell")));
    sheet("Deck options", body, { wide: true });
  }

  toggleTheater(btn) {
    const on = this.el.dataset.theater === "1" ? "0" : "1";
    this.el.dataset.theater = on;
    btn?.classList.toggle("is-on", on === "1");
  }

  toggleFF(btn) {
    if (this.built) {
      toast("No fast forward in the built-in engine - the games already run at 60 Hz", "info", 2600);
      return;
    }
    const on = !btn.classList.contains("is-on");
    btn.classList.toggle("is-on", on);
    this.emu?.fastForward(on);
  }

  /* ------------------------------------------------------------- teardown */
  autoPause() {
    if (this.built && this.host && this.alive && !this.paused) {
      this.host.pause(true);
      this.paused = true;
      this.wasPaused = true;
    }
  }
  resumeIfPaused() {
    if (this.built && this.host && this.wasPaused) {
      this.host.pause(false);
      this.wasPaused = false;
      this.paused = false;
    }
  }
  togglePause() {
    if (this.built) {
      this.paused = !this.paused;
      this.host?.pause(this.paused);
    }
  }

  async quit() {
    if (store.get("emulator.exitConfirm", false) || (this.cfg.confirmExit && !this.built)) {
      const ok = await confirmSheet("Leave the game?", "Anything unsaved stays as it is - the core is torn down when you go back.", "Leave");
      if (!ok) return;
    }
    location.hash = this.built ? "#/" : `#/deck/${this.sys.id}`;
  }

  stopAll() {
    this.alive = false;
    for (const fn of this._cleanup) {
      try { fn(); } catch { /* already gone */ }
    }
    this._cleanup = [];
    this.host?.stop();
    this.deck?.destroy();
    this.deck = null;
    this.host = null;
  }

  async destroy() {
    if (!this.el) return;
    this.alive = false;
    this.stopAll();
    const emu = this.emu;
    this.emu = null;
    // never let a half-started core keep the app from navigating away
    await Promise.race([
      Promise.allSettled([this.engineReady, emu?.stop()]).then(() => null),
      new Promise((r) => setTimeout(r, 500)),
    ]);
    this.applySkin(false);
    keepScreenOn(false);
    lockOrientation(null);
    fullscreen(null, false);
    document.body.classList.remove("is-playing");
    mount(this.o.root, "");
    this.o.root.classList.remove("is-open");
    this.el.remove();
    this.el = null;
    // let the console model's accent linger for the library screens? no: reset
    import("../app.js").then((m) => m.applySkin(null, null)).catch(() => {});
  }
}

/** Shots arrive either as a data URL or as raw base64, depending on the core. */
function shotSrc(shot) {
  const s = typeof shot === "string" ? shot : "";
  if (!s) return "";
  return s.startsWith("data:") ? s : `data:image/png;base64,${s}`;
}

function dataBaseLine(sys) {
  try {
    return `payload: ${store.get("emulator.source", "cdn") === "local" ? "./vendor/data/" : "cdn.emulatorjs.org"}/${sys?.ejsCore ? `${sys.ejsCore} core` : ""}`;
  } catch {
    return "payload: default";
  }
}

/** The emulator needs the controls map even before the core asks for it. */
export function controlsFor(sys, cfg) {
  return ejsControls(sys, { ...defaultMapping(sys), ...(cfg?.controls || {}) });
}
