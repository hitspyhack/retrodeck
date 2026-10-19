/**
 * RetroDeck - local vault (IndexedDB).
 *
 * Stores ROM/BIOS bytes, save states, SRAM and screenshots *in this browser
 * only*. There is no server anywhere in this project: the vault never syncs,
 * never uploads, and clearing site data destroys it (the UI says so, loudly).
 *
 * object stores
 *   roms     keyPath hash      {hash,name,system,size,added,bytes,note,source}
 *   bios     keyPath system    {system,name,size,added,bytes}
 *   states   keyPath key       {key=gameId#slot,gameId,slot,name,created,bytes,shot}
 *   sram     keyPath key       {key=gameId,   name,updated,bytes}
 *   meta     key               free-form {key,value}
 */

const DB_NAME = "retrodeck";
const DB_VERSION = 1;

export const STORES = ["roms", "bios", "states", "sram", "meta"];

let dbp = null;
let memoryMode = false;
const memory = { roms: new Map(), bios: new Map(), states: new Map(), sram: new Map(), meta: new Map() };

function openDB() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      memoryMode = true;
      return reject(new Error("IndexedDB unavailable - running in volatile memory"));
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = req.result;
      if (!db.objectStoreNames.contains("roms")) {
        const s = db.createObjectStore("roms", { keyPath: "hash" });
        s.createIndex("system", "system");
        s.createIndex("added", "added");
      }
      if (!db.objectStoreNames.contains("bios")) db.createObjectStore("bios", { keyPath: "system" });
      if (!db.objectStoreNames.contains("states")) db.createObjectStore("states", { keyPath: "key" });
      if (!db.objectStoreNames.contains("sram")) db.createObjectStore("sram", { keyPath: "key" });
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "k" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      memoryMode = true;
      reject(req.error || new Error("IndexedDB blocked"));
    };
    req.onblocked = () => reject(new Error("IndexedDB blocked by another tab"));
  }).catch((err) => {
    memoryMode = true;
    console.warn("[retrodeck] vault falling back to memory:", err.message);
    return null;
  });
  return dbp;
}

function tx(store, mode, fn) {
  return openDB().then((db) => {
    if (!db || memoryMode) {
      const m = memory[store];
      return fn ? fn(m) : undefined;
    }
    return new Promise((resolve, reject) => {
      const t = db.transaction(store, mode);
      let out;
      try {
        out = fn(t.objectStore(store), t);
      } catch (err) {
        return reject(err);
      }
      t.oncomplete = () => resolve(out?.__promise ? out.value : out);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error("transaction aborted"));
    });
  });
}

/** Wrap an IDBRequest so we can await it inside a transaction callback. */
function grab(req) {
  const box = { __promise: true, value: undefined };
  req.onsuccess = () => (box.value = req.result);
  req.onerror = () => (box.value = undefined);
  return box;
}

const put = (os, val) => os.put(val);

/**
 * Resolve true when IndexedDB is not usable (private mode, old WebKit, the
 * sandboxed file:// preview). Callers must await this once, because the flag is
 * only decided after the first open attempt.
 */
async function useMemory() {
  if (memoryMode) return true;
  try {
    const db = await openDB();
    return !db;
  } catch {
    return true;
  }
}

/**
 * Rows whose timestamp the UI both sorts and labels. Records written by older
 * builds called it `created` or `updated`, so the read path settles on `at`
 * once, here, instead of every view guessing.
 */
const STAMPED = new Set(["states", "sram"]);
const withStamp = (r) => (r && typeof r === "object" ? { ...r, at: r.at ?? r.created ?? r.updated ?? 0 } : r);

export const vault = {
  get volatile() {
    return memoryMode;
  },

  /**
   * Every record in a store. In memory mode the Map is the source of truth, and
   * it must be read directly - tx() hands callbacks an IDBObjectStore, which a
   * Map is not, so routing this through tx() would throw on getAll.
   */
  async list(storeName) {
    const rows = (await useMemory())
      ? [...memory[storeName].values()]
      : ((await tx(storeName, "readonly", (os) => grab(os.getAll()))) || []);
    return STAMPED.has(storeName) ? rows.map(withStamp) : rows;
  },

  async get(storeName, key) {
    if (memoryMode) return memory[storeName].get(key);
    const db = await openDB();
    if (!db) return memory[storeName].get(key);
    return new Promise((resolve) => {
      const r = db.transaction(storeName, "readonly").objectStore(storeName).get(key);
      r.onsuccess = () => resolve(r.result ?? null);
      r.onerror = () => resolve(null);
    });
  },

  async set(storeName, val) {
    if (memoryMode) {
      const k = val.key ?? val.hash ?? val.k;
      memory[storeName].set(k, val);
      return val;
    }
    const db = await openDB();
    if (!db) return memory[storeName].set(val.key ?? val.hash ?? val.k, val), val;
    return new Promise((resolve, reject) => {
      const t = db.transaction(storeName, "readwrite");
      put(t.objectStore(storeName), val);
      t.oncomplete = () => resolve(val);
      t.onerror = () => reject(t.error);
    });
  },

  async del(storeName, key) {
    if (memoryMode) return memory[storeName].delete(key);
    const db = await openDB();
    if (!db) return memory[storeName].delete(key);
    return new Promise((resolve, reject) => {
      const t = db.transaction(storeName, "readwrite");
      t.objectStore(storeName).delete(key);
      t.oncomplete = () => resolve(true);
      t.onerror = () => reject(t.error);
    });
  },

  async clear(storeName) {
    if (memoryMode) return memory[storeName].clear();
    const db = await openDB();
    if (!db) return memory[storeName].clear();
    return new Promise((resolve, reject) => {
      const t = db.transaction(storeName, "readwrite");
      t.objectStore(storeName).clear();
      t.oncomplete = () => resolve(true);
      t.onerror = () => reject(t.error);
    });
  },

  /* ------------------------------------------------------------ roms */
  async addRom(file, meta = {}) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { hashRom, sniffRom } = await import("./detect.js");
    const hash = await hashRom(bytes);
    const existing = await vault.get("roms", hash);
    if (existing && !meta.force) return { ...existing, duplicate: true };
    const sniff = sniffRom(bytes, file.name);
    const rec = {
      hash,
      name: meta.name || file.name.replace(/\.[^.]+$/, ""),
      fileName: file.name,
      size: bytes.length,
      added: Date.now(),
      system: meta.system || sniff.system || "unknown",
      detected: sniff.system || null,
      titleFromHeader: sniff.title || null,
      note: meta.note || sniff.note || "",
      source: meta.source || "local",
      bytes,
    };
    await vault.set("roms", rec);
    return rec;
  },

  async removeRom(hash) {
    await vault.del("roms", hash);
    return true;
  },

  async romFor(hash) {
    return vault.get("roms", hash);
  },

  async romUrl(hash) {
    const rec = await vault.get("roms", hash);
    if (!rec?.bytes) return null;
    const blob = new Blob([rec.bytes], { type: "application/octet-stream" });
    return { url: URL.createObjectURL(blob), size: rec.size, name: rec.name, record: rec };
  },

  async romsBySystem(system) {
    const all = await vault.list("roms");
    return (all || []).filter((r) => !system || r.system === system).sort((a, b) => b.added - a.added);
  },

  /* ------------------------------------------------------------ bios */
  async setBios(system, file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    return vault.set("bios", {
      system,
      name: file.name,
      size: bytes.length,
      added: Date.now(),
      bytes,
    });
  },
  async biosFor(system) {
    return vault.get("bios", system);
  },
  async dropBios(system) {
    return vault.del("bios", system);
  },

  /* ------------------------------------------------------- states / SRAM */
  async saveState(gameId, slot, bytes, shot, extra = {}) {
    const now = Date.now();
    return vault.set("states", {
      key: `${gameId}#${slot}`,
      gameId,
      slot,
      created: now,
      // `at` is what the UIs sort and label by
      at: now,
      bytes,
      shot: shot || null,
      ...extra,
    });
  },
  async statesFor(gameId) {
    const all = (await vault.list("states")) || [];
    return all
      .filter((s) => s.gameId === gameId)
      .sort((a, b) => Number(a.slot) - Number(b.slot) || (b.at || 0) - (a.at || 0));
  },
  async deleteState(gameId, slot) {
    return vault.del("states", `${gameId}#${slot}`);
  },
  async saveSram(gameId, bytes, name, shot) {
    const now = Date.now();
    return vault.set("sram", { key: gameId, name, created: now, at: now, bytes, shot: shot || null });
  },
  async sramFor(gameId) {
    return vault.get("sram", gameId);
  },
  async deleteSram(gameId) {
    return vault.del("sram", gameId);
  },

  /* ------------------------------------------------------------- quota */
  async usage() {
    if (typeof navigator === "undefined" || !navigator.storage?.estimate) return null;
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    return { usage, quota, pct: quota ? usage / quota : 0 };
  },

  async requestPersistence() {
    if (typeof navigator === "undefined" || !navigator.storage?.persist) return false;
    if (await navigator.storage.persisted?.()) return true;
    return navigator.storage.persist();
  },

  async setMeta(k, v) {
    return vault.set("meta", { k, value: v });
  },
  async getMeta(k) {
    const r = await vault.get("meta", k);
    return r?.value;
  },
};
