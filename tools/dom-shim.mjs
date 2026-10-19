/**
 * A ~200-line DOM good enough to run RetroDeck's views in node.
 *
 * This is not a browser and never pretends to be: there is no layout, no
 * events that bubble for real, and selectors only support the handful of forms
 * the app actually uses (`#id`, `.class`, `tag`, `[attr]`, `tag.cls`,
 * `[data-x="y"]`, and descendant chains of those). What it does give us is the
 * ability to boot the app headlessly and prove that every view builds its
 * elements, that the pad wires up, and that a built-in game ticks - in CI, with
 * no browser and no npm install.
 */

const ID_SELECTOR = /^#([\w-]+)$/;
const CLASS_SELECTOR = /^\.([\w-]+)$/;
const ATTR_SELECTOR = /^\[([\w-]+)(?:="([^"]*)")?\]$/;
const TAG_SELECTOR = /^([a-zA-Z][\w-]*)/;

function matchesSimple(el, sel) {
  sel = sel.trim();
  if (!sel) return false;
  let rest = sel;
  let ok = true;
  const parts = rest.match(/(#[\w-]+|\.[\w-]+|\[[\w-]+(?:="[^"]*")?\]|^[a-zA-Z][\w-]*)/g) || [];
  for (const p of parts) {
    if (p.startsWith("#")) ok = ok && el.id === p.slice(1);
    else if (p.startsWith(".")) ok = ok && el.classList.contains(p.slice(1));
    else if (p.startsWith("[")) {
      const m = ATTR_SELECTOR.exec(p);
      if (!m) return false;
      const val = el.getAttribute(m[1]);
      ok = ok && val !== null && (m[2] === undefined || val === m[2]);
    } else ok = ok && el.tagName.toLowerCase() === p.toLowerCase();
  }
  return ok;
}

class ClassList {
  constructor(el) {
    this.el = el;
  }
  get set() {
    return new Set(String(this.el.className || "").split(/\s+/).filter(Boolean));
  }
  write(s) {
    this.el.className = [...s].join(" ");
  }
  add(...c) {
    const s = this.set;
    for (const x of c) s.add(x);
    this.write(s);
  }
  remove(...c) {
    const s = this.set;
    for (const x of c) s.delete(x);
    this.write(s);
  }
  toggle(c, force) {
    const s = this.set;
    const on = force === undefined ? !s.has(c) : !!force;
    if (on) s.add(c);
    else s.delete(c);
    this.write(s);
    return on;
  }
  contains(c) {
    return this.set.has(c);
  }
}

class Style {
  constructor() {
    Object.defineProperties(this, {
      _props: { value: new Map(), enumerable: false },
      setProperty: {
        value: (k, v) => {
          this._props.set(k, String(v));
        },
        enumerable: false,
      },
      removeProperty: {
        value: (k) => {
          this._props.delete(k);
        },
        enumerable: false,
      },
      getPropertyValue: { value: (k) => this._props.get(k) || "", enumerable: false },
    });
  }
}

let seq = 0;
export class El {
  constructor(tag) {
    this.nodeType = 1;
    this.tagName = String(tag || "div").toUpperCase();
    this.localName = String(tag || "div").toLowerCase();
    this.childNodes = [];
    this.attributes = new Map();
    this.style = new Style();
    this.dataset = {};
    this._listeners = new Map();
    this._uid = ++seq;
    this._text = "";
    this.classList = new ClassList(this);
    this.value = "";
    this.checked = false;
    this.disabled = false;
    this.hidden = false;
    this.files = [];
    if (this.localName === "canvas") {
      this.width = 300;
      this.height = 150;
    }
  }
  get className() {
    return this.attributes.get("class") || "";
  }
  set className(v) {
    this.attributes.set("class", String(v ?? ""));
  }
  get id() {
    return this.attributes.get("id") || "";
  }
  set id(v) {
    this.attributes.set("id", String(v ?? ""));
  }
  get parentNode() {
    return this._parent || null;
  }
  get firstChild() {
    return this.childNodes[0] || null;
  }
  get children() {
    return this.childNodes.filter((c) => c instanceof El);
  }
  get isConnected() {
    let n = this;
    while (n.parentNode) n = n.parentNode;
    return n === doc.documentElement || n === doc.body || n?._isRoot === true;
  }
  setAttribute(k, v) {
    this.attributes.set(String(k), String(v));
    if (k === "id") this.attributes.set("id", String(v));
  }
  getAttribute(k) {
    return this.attributes.has(k) ? this.attributes.get(k) : null;
  }
  removeAttribute(k) {
    this.attributes.delete(k);
  }
  hasAttribute(k) {
    return this.attributes.has(k);
  }
  append(...nodes) {
    for (const n of nodes) {
      if (n == null || n === false) continue;
      const child = typeof n === "object" && n.nodeType ? n : { nodeType: 3, _text: String(n), parentNode: null };
      child._parent = this;
      this.childNodes.push(child);
    }
  }
  appendChild(n) {
    this.append(n);
    return n;
  }
  insertBefore(n, ref) {
    const i = this.childNodes.indexOf(ref);
    n._parent = this;
    if (i < 0) this.childNodes.push(n);
    else this.childNodes.splice(i, 0, n);
    return n;
  }
  replaceWith(...nodes) {
    const p = this.parentNode;
    if (!p) return;
    const i = p.childNodes.indexOf(this);
    p.childNodes.splice(i, 1, ...nodes.map((n) => ((n._parent = p), n)));
  }
  replaceChildren(...nodes) {
    this.childNodes = [];
    this.append(...nodes);
  }
  removeChild(n) {
    const i = this.childNodes.indexOf(n);
    if (i >= 0) this.childNodes.splice(i, 1);
    return n;
  }
  remove() {
    this.parentNode?.removeChild(this);
  }
  contains(n) {
    for (let x = n; x; x = x.parentNode) if (x === this) return true;
    return false;
  }
  get textContent() {
    return this.childNodes.map((c) => c.textContent ?? c._text ?? "").join("");
  }
  set textContent(v) {
    this.childNodes = [];
    this._text = String(v ?? "");
    if (this._text) this.childNodes.push({ nodeType: 3, _text: this._text, get textContent() { return this._text; }, parentNode: this });
  }
  set innerHTML(v) {
    this.childNodes = [];
    for (const node of parseHtml(String(v), this)) this.childNodes.push(node);
  }
  get innerHTML() {
    return this._html || "";
  }
  addEventListener(type, fn) {
    if (!this._listeners.has(type)) this._listeners.set(type, new Set());
    this._listeners.get(type).add(fn);
  }
  removeEventListener(type, fn) {
    this._listeners.get(type)?.delete(fn);
  }
  dispatchEvent(ev) {
    const set = this._listeners.get(ev.type);
    if (set) for (const fn of [...set]) fn({ ...ev, target: ev.target || this, currentTarget: this, preventDefault() {}, stopPropagation() {} });
    return true;
  }
  click() {
    this.dispatchEvent({ type: "click", target: this });
  }
  focus() {}
  blur() {}
  select() {}
  matches(sel) {
    return sel.split(",").some((s) => matchesSimple(this, s));
  }
  closest(sel) {
    for (let n = this; n; n = n.parentNode) if (n.matches?.(sel)) return n;
    return null;
  }
  *walk() {
    for (const c of this.childNodes) {
      if (c instanceof El) {
        yield c;
        yield* c.walk();
      }
    }
  }
  querySelector(sel) {
    for (const part of String(sel).split(",")) {
      const chain = part.trim().split(/\s+/);
      for (const el of this.walk()) {
        if (matchesChain(el, chain)) return el;
      }
    }
    return null;
  }
  querySelectorAll(sel) {
    const out = [];
    const chain = String(sel).trim().split(/\s+/);
    for (const el of this.walk()) if (matchesChain(el, chain)) out.push(el);
    return out;
  }
  getContext() {
    if (!this._ctx) this._ctx = makeCtx(this);
    return this._ctx;
  }
  toDataURL() {
    return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==";
  }
  getBoundingClientRect() {
    return { x: 0, y: 0, top: 0, left: 0, right: this.width || 100, bottom: this.height || 40, width: this.width || 100, height: this.height || 40 };
  }
  setPointerCapture() {}
  releasePointerCapture() {}
  scrollIntoView() {}
}

function matchesChain(el, chain) {
  if (!chain.length) return false;
  if (!matchesSimple(el, chain[chain.length - 1])) return false;
  let i = chain.length - 2;
  let n = el.parentNode;
  while (i >= 0) {
    while (n && !matchesSimple(n, chain[i])) n = n.parentNode;
    if (!n) return false;
    n = n.parentNode;
    i--;
  }
  return true;
}

function makeCtx(canvas) {
  const noop = () => {};
  const grad = { addColorStop: noop };
  const target = {
    canvas,
    fillStyle: "#000",
    strokeStyle: "#000",
    font: "",
    textAlign: "left",
    globalAlpha: 1,
    lineWidth: 1,
    createLinearGradient: () => grad,
    createRadialGradient: () => grad,
    measureText: () => ({ width: 8 }),
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    save: noop, restore: noop, translate: noop, rotate: noop, scale: noop,
    beginPath: noop, closePath: noop, moveTo: noop, lineTo: noop, arc: noop, arcTo: noop,
    ellipse: noop, rect: noop, fill: noop, stroke: noop, fillRect: noop, strokeRect: noop,
    clearRect: noop, fillText: noop, strokeText: noop, clip: noop, drawImage: noop,
    setTransform: noop, transform: noop, setLineDash: noop, createPattern: () => null,
  };
  return new Proxy(target, {
    get(t, k) {
      if (k in t) return t[k];
      return noop;
    },
    set(t, k, v) {
      t[k] = v;
      return true;
    },
  });
}

/** Build the globals. Call once per process, before importing app code. */
export function installDom() {
  const doc = new El("#document");
  doc._isRoot = true;
  const documentElement = new El("html");
  const body = new El("body");
  doc.append(documentElement);
  documentElement.append(body);
  doc.documentElement = documentElement;
  doc.body = body;
  doc.head = documentElement.append(new El("head")) || documentElement.querySelector("head");
  doc.createElement = (tag) => new El(tag);
  doc.createTextNode = (t) => ({ nodeType: 3, _text: String(t), get textContent() { return this._text; }, parentNode: null });
  doc.createDocumentFragment = () => {
    const f = new El("#fragment");
    return f;
  };
  doc.querySelector = (s) => documentElement.querySelector(s);
  doc.querySelectorAll = (s) => documentElement.querySelectorAll(s);
  doc.getElementById = (id) => documentElement.querySelector(`#${id}`);
  doc.addEventListener = El.prototype.addEventListener.bind(doc);
  doc.removeEventListener = El.prototype.removeEventListener.bind(doc);
  doc.fullscreenElement = null;
  doc.exitFullscreen = async () => {
    doc.fullscreenElement = null;
  };
  doc.hidden = false;
  doc.execCommand = () => true;

  const frames = [];
  const win = {
    document: doc,
    performance,
    location: { hash: "#/", href: "http://localhost:4173/#/", origin: "http://localhost:4173", protocol: "http:" },
    history: { replaceState() {}, pushState() {} },
    addEventListener: (t, fn) => doc.addEventListener(t, fn),
    removeEventListener: (t, fn) => doc.removeEventListener(t, fn),
    dispatchEvent: (e) => doc.dispatchEvent(e),
    requestAnimationFrame: (fn) => {
      frames.push(fn);
      return frames.length;
    },
    cancelAnimationFrame: (id) => {
      frames[id - 1] = null;
    },
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }),
    getComputedStyle: () => ({ getPropertyValue: () => "" }),
    indexedDB: undefined,
    AudioContext: undefined,
    navigator: {
      vibrate: () => true,
      getGamepads: () => [],
      clipboard: { writeText: async () => {} },
      storage: { estimate: async () => ({ usage: 1024, quota: 1024 * 1024 * 512 }), persist: async () => true, persisted: async () => false },
      serviceWorker: undefined,
      userAgent: "node-dom-smoke",
      maxTouchPoints: 5,
    },
    screen: { orientation: { lock: async () => {}, unlock() {}, type: "portrait-primary", addEventListener() {} } },
    // Blob/URL stay node's own - views only touch them in a real browser, and
    // node 20 already has both.
    IntersectionObserver: class { observe() {} unobserve() {} disconnect() {} },
    ResizeObserver: class { observe() {} disconnect() {} },
    localStorage: memoryStorage(),
    document_: doc,
    Event: class { constructor(t, o = {}) { Object.assign(this, { type: t, ...o }); } preventDefault() {} stopPropagation() {} },
    KeyboardEvent: class { constructor(t, o = {}) { Object.assign(this, { type: t, ...o }); } preventDefault() {} stopPropagation() {} },
    PointerEvent: class { constructor(t, o = {}) { Object.assign(this, { type: t, ...o }); } preventDefault() {} stopPropagation() {} },
    CustomEvent: class { constructor(t, o = {}) { Object.assign(this, { type: t, detail: o.detail }); } preventDefault() {} },
    Image: class { constructor() { this.width = 1; this.height = 1; } },
    fetch: async () => {
      throw new Error("offline (smoke test blocks the network)");
    },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    queueMicrotask,
    __frames: frames,
  };
  win.window = win;
  win.self = win;
  win.globalThis = win;
  Object.assign(globalThis, win);
  globalThis.window = win;
  globalThis.document = doc;
  globalThis.navigator = win.navigator;
  globalThis.location = win.location;
  globalThis.localStorage = win.localStorage;
  globalThis.HTMLElement = El;
  globalThis.requestAnimationFrame = win.requestAnimationFrame;
  globalThis.cancelAnimationFrame = win.cancelAnimationFrame;
  globalThis.matchMedia = win.matchMedia;
  globalThis.IntersectionObserver = win.IntersectionObserver;
  globalThis.ResizeObserver = win.ResizeObserver;
  globalThis.Event = win.Event;
  globalThis.KeyboardEvent = win.KeyboardEvent;
  globalThis.PointerEvent = win.PointerEvent;
  globalThis.CustomEvent = win.CustomEvent;
  globalThis.fetch = win.fetch;
  globalThis.screen = win.screen;
  globalThis.history = win.history;
  globalThis.indexedDB = undefined;
  globalThis.__dom = { doc, win, frames };
  return win;
}

function memoryStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    clear: () => m.clear(),
    key: (i) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
  };
}

/** Drive the animation frames the app queued (each call = one 60 Hz tick). */
export function pumpFrames(n = 1, start = 0) {
  const { frames } = globalThis.__dom;
  let t = start;
  for (let i = 0; i < n; i++) {
    const due = frames.splice(0, frames.length);
    t += 1000 / 60;
    for (const fn of due) if (fn) fn(t);
  }
  return t;
}

export const doc = () => globalThis.__dom.doc;

/* ------------------------------------------------------------- mini HTML parser
 Views and pad.js hand us markup strings; we build real nodes from them so that
 querySelector can find what the code expects. Handles the subset this repo
 emits: elements, quoted and bare attributes, self-closing tags, void elements,
 entities and text. No script execution, no error recovery gymnastics. */
const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr", "path", "circle", "rect", "line", "polygon", "polyline", "use", "stop"]);
const TAG_RE = /<\/?([a-zA-Z][\w:-]*)((?:\s+[\w:.@-]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s">]+))?)*)\s*(\/?)>|([^<]+)/g;
const ATTR_RE = /([\w:.@-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s">]+)))?/g;

function decode(t) {
  return t
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

export function parseHtml(src, parent) {
  const out = [];
  const stack = [{ kids: out }];
  const top = () => stack[stack.length - 1];
  let m;
  TAG_RE.lastIndex = 0;
  while ((m = TAG_RE.exec(src))) {
    const [, tagRaw, attrsRaw, selfClose, text] = m;
    if (text != null) {
      const t = decode(text);
      if (t.trim()) {
        const node = { nodeType: 3, _text: t, get textContent() { return this._text; } };
        top().kids.push(node);
      }
      continue;
    }
    const closing = tagRaw.startsWith("/");
    const tag = tagRaw.toLowerCase();
    if (closing) {
      if (stack.length > 1) stack.pop();
      continue;
    }
    const el = new El(tag);
    el._parent = parent;
    for (const a of attrsRaw.matchAll(ATTR_RE)) {
      const name = a[1];
      const value = decode(a[2] ?? a[3] ?? a[4] ?? (a[2] === "" ? "" : "true"));
      el.attributes.set(name, value);
      if (name === "id") el.id = value;
      else if (name.startsWith("data-")) {
        const key = name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        el.dataset[key] = value;
      }
    }
    top().kids.push(el);
    if (selfClose === "/" || VOID.has(tag)) continue;
    // children land in el.childNodes, so pushing onto it nests automatically
    stack.push({ el, kids: el.childNodes });
  }
  linkParents(parent, out);
  return out;
}

function linkParents(parent, nodes) {
  for (const n of nodes) {
    n._parent = parent; // El.parentNode reads this; text nodes are plain objects
    if (!(n instanceof El)) n.parentNode = parent;
    if (n instanceof El && n.childNodes?.length) linkParents(n, n.childNodes);
  }
}
