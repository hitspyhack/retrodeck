/**
 * Tiny DOM kit shared by the views.
 *
 * No framework on purpose: the whole app is ES modules the browser can load
 * straight from disk, which is what makes it work as a PWA, from a USB stick,
 * and inside the sandboxed preview with no build step and no network.
 */

/** h("div.card", {onclick}, "text", otherNode) - the only element builder we need. */
export function h(spec, props = null, ...kids) {
  const [tagAndCls, tagId] = spec.split("#");
  const [tag, ...cls] = tagAndCls.split(".");
  const el = document.createElement(tag || "div");
  if (cls.length) el.className = cls.join(" ");
  if (tagId) el.id = tagId;
  if (props && (props.nodeType || typeof props === "string" || Array.isArray(props))) {
    kids.unshift(props);
    props = null;
  }
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = [el.className, v].filter(Boolean).join(" ");
    else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else if (k === "html") el.innerHTML = v;
    else if (k === "dataset") Object.assign(el.dataset, v);
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else if (k === "disabled" || k === "checked" || k === "selected" || k === "hidden") el[k] = !!v;
    else if (k.startsWith("aria-") || k.startsWith("data-")) el.setAttribute(k, v);
    else el.setAttribute(k, v);
  }
  add(el, kids);
  return el;
}

function add(el, kids) {
  for (const k of kids.flat(4)) {
    if (k == null || k === false) continue;
    el.append(k.nodeType ? k : document.createTextNode(String(k)));
  }
}

export const clear = (el) => {
  while (el?.firstChild) el.removeChild(el.firstChild);
  return el;
};

export const frag = (...kids) => {
  const f = document.createDocumentFragment();
  add(f, kids);
  return f;
};

export function mount(el, ...kids) {
  clear(el);
  add(el, kids);
  return el;
}

/** Delegated click handler for `[data-act]` elements. */
export function acts(root, map) {
  const handler = (ev) => {
    const t = ev.target.closest?.("[data-act]");
    if (!t || !root.contains(t)) return;
    const fn = map[t.dataset.act];
    if (!fn) return;
    ev.preventDefault();
    fn(t, ev);
  };
  root.addEventListener("click", handler);
  return () => root.removeEventListener("click", handler);
}

/* ------------------------------------------------------------------ controls */
export function toggle(label, value, onChange, hint) {
  const input = h("input", { type: "checkbox", checked: !!value, onchange: (e) => onChange(e.target.checked) });
  return h("label.row.row--switch", {},
    h("span.row__label", {}, label, hint ? h("small.muted", {}, hint) : null),
    h("span.switch", {}, input, h("i", {})));
}

export function range(label, value, min, max, step, onChange, fmt = (v) => v) {
  const out = h("output", {}, fmt(value));
  const input = h("input", {
    type: "range", min, max, step, value,
    oninput: (e) => { out.textContent = fmt(Number(e.target.value)); onChange(Number(e.target.value)); },
  });
  return h("label.row.row--range", {},
    h("span.row__label", {}, label, out), input);
}

export function select(label, value, options, onChange, hint) {
  const sel = h("select", {
    onchange: (e) => onChange(e.target.value, e.target.selectedOptions[0]?.dataset?.extra),
  }, options.map((o) => {
    const [v, text] = Array.isArray(o) ? o : [o.value, o.label];
    return h("option", { value: v, selected: String(v) === String(value), dataset: o.extra ? { extra: o.extra } : null }, text);
  }));
  return h("label.row.row--select", {},
    h("span.row__label", {}, label, hint ? h("small.muted", {}, hint) : null), sel);
}

export function textRow(label, value, onChange, { type = "text", placeholder = "", hint = "" } = {}) {
  return h("label.row.row--text", {},
    h("span.row__label", {}, label, hint ? h("small.muted", {}, hint) : null),
    h("input", { type, value: value ?? "", placeholder, onchange: (e) => onChange(e.target.value) }));
}

export function chip(label, active, onClick, extra) {
  return h(`button.chip${active ? ".is-on" : ""}`, { onclick: onClick, title: extra?.title || "" },
    extra?.swatch ? h("i.swatch", { style: { background: extra.swatch } }) : null,
    label,
    extra?.count != null ? h("b", {}, extra.count) : null);
}

export function sectionTitle(title, ...right) {
  return h("div.sectionTitle", {}, h("h2", {}, title), h("div.sectionTitle__right", {}, ...right));
}

export function empty(title, body, ...actions) {
  return h("div.empty", {},
    h("svg", { width: 56, height: 56, viewBox: "0 0 24 24", "aria-hidden": "true", html:
      '<path d="M3 7h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" fill="none" stroke="currentColor" stroke-width="1.4"/>' +
      '<path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M7 12h3m-1.5-1.5v3M15 12.5h.01M17 14.5h.01" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round"/>' }),
    h("h3", {}, title),
    body ? h("p", {}, body) : null,
    actions.length ? h("div.empty__actions", {}, ...actions) : null);
}

/* --------------------------------------------------------------- overlays */
let scrim = null;
let sheetStack = [];

/** Bottom sheet / dialog. Returns { close } - resolves when dismissed. */
export function sheet(title, content, opts = {}) {
  const box = h("div.sheet__inner", { role: "dialog", "aria-modal": "true", "aria-label": title || "dialog" },
    h("header.sheet__bar", {},
      h("h3", {}, title || ""),
      opts.actions ? h("div.sheet__actions", {}, ...opts.actions) : null,
      h("button.icon", { "aria-label": "Close", onclick: () => close() }, "✕")),
    h("div.sheet__body", {}, content));
  const el = h(`div.sheet${opts.wide ? ".sheet--wide" : ""}`, {
    role: "presentation",
    onpointerdown: (e) => e.stopPropagation(),
  }, box);
  if (!scrim) scrim = h("div.scrim", { onclick: () => scrim.querySelector(".sheet:last-child")?.__close?.() });
  el.__close = close;
  scrim.append(el);
  if (!scrim.isConnected) document.body.append(scrim);
  requestAnimationFrame(() => scrim.classList.add("is-open"));
  sheetStack.push(el);
  function close() {
    const i = sheetStack.indexOf(el);
    if (i < 0) return;
    sheetStack.splice(i, 1);
    el.remove();
    if (!sheetStack.length) {
      scrim.classList.remove("is-open");
      setTimeout(() => scrim?.remove(), 220);
    }
    opts.onClose?.();
  }
  return { el, close, body: box.querySelector(".sheet__body") };
}

let toastTimer = null;
export function toast(msg, kind = "info", ms = 3200) {
  let t = document.getElementById("toast");
  if (!t) document.body.append((t = h("div#toast", { role: "status", "aria-live": "polite" })));
  t.className = `toast is-show toast--${kind}`;
  t.textContent = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("is-show"), ms);
}

export function confirmSheet(title, body, okLabel = "Do it") {
  return new Promise((resolve) => {
    let done = false;
    const s = sheet(title, h("p.sheet__p", {}, body), {
      onClose: () => { if (!done) resolve(false); },
      actions: [
        h("button.btn", { onclick: () => { done = true; s.close(); resolve(false); } }, "Cancel"),
        h("button.btn.btn--danger", { onclick: () => { done = true; s.close(); resolve(true); } }, okLabel),
      ],
    });
  });
}

/* ------------------------------------------------------------------ misc ui */
export function onKey(map) {
  const handler = (ev) => {
    if (ev.target.matches?.("input,select,textarea")) return;
    const fn = map[ev.key.toLowerCase()];
    if (fn) { ev.preventDefault(); fn(ev); }
  };
  window.addEventListener("keydown", handler);
  return () => window.removeEventListener("keydown", handler);
}

/** File picker as a promise - used for ROM and BIOS import. */
export function pickFiles({ accept = "", multiple = false } = {}) {
  return new Promise((resolve) => {
    const input = h("input", {
      type: "file", accept, multiple, class: "visually-hidden",
      style: { position: "fixed", left: "-9999px" },
      onchange: () => {
        const files = [...(input.files || [])];
        input.remove();
        resolve(files);
      },
    });
    document.body.append(input);
    input.click();
  });
}

export async function copyText(s) {
  try {
    await navigator.clipboard.writeText(s);
    return true;
  } catch {
    const ta = h("textarea", { style: { position: "fixed", opacity: 0 } });
    ta.value = s;
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand?.("copy");
    ta.remove();
    return !!ok;
  }
}

export function download(name, data, type = "application/octet-stream") {
  const url = data instanceof Blob ? URL.createObjectURL(data) : data;
  const a = h("a", { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  if (url.startsWith("blob:")) setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Escape user text before it goes near innerHTML. */
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** requestAnimationFrame-throttled router hook helper. */
export const raf = (fn) => requestAnimationFrame(fn);

/** Keep the screen awake while playing, if the browser lets us. */
let wakeLock = null;
export async function keepScreenOn(on) {
  try {
    if (on && "wakeLock" in navigator) wakeLock = await navigator.wakeLock.request("screen");
    else if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch { /* denied - fine */ }
}

/** Screen orientation, best effort. */
export async function lockOrientation(v) {
  try {
    if (v && v !== "auto" && screen.orientation?.lock) await screen.orientation.lock(v);
    else if (screen.orientation?.unlock) screen.orientation.unlock();
  } catch { /* desktop Safari & friends */ }
}

export function fullscreen(el = document.documentElement, on = true) {
  try {
    if (on && !document.fullscreenElement) return el.requestFullscreen?.();
    if (!on && document.fullscreenElement) return document.exitFullscreen?.();
  } catch { /* not allowed */ }
}
