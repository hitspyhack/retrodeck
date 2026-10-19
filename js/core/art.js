/**
 * RetroDeck - real cover artwork, from a file you supply.
 *
 * The library's default covers are generated (see js/core/cover.js) because the
 * repository ships no game artwork and links to none: box art is somebody else's
 * copyright, and hot-linking somebody's image host would also break the one
 * promise this app makes hardest - that it opens with the radio off.
 *
 * So artwork arrives the same way cartridges do, from the device, and there are
 * two ways to get it in:
 *
 *   - per game, stored in the vault (this module): the image is resized here and
 *     kept as a data URL in IndexedDB, so it renders offline forever;
 *   - per build, on the server: drop the file at covers/<system>/<slug>.jpg and
 *     `npm run build` writes a `cover` path onto the matching catalogue row,
 *     which is the right answer for homebrew art you own.
 *
 * Either way the card shows the image with the generated art behind it as a
 * fallback, so a broken path or a missing file degrades to a mosaic instead of a
 * grey hole.
 */

import { vault } from "./idb.js";

/** Longest edge of the stored copy. Card art is 120x160 on a phone; the detail
 *  sheet is about 2x that. Anything bigger is wasted IndexedDB bytes. */
const MAX_EDGE = 560;

const key = (gameId) => `art:${gameId}`;

export const ART_TYPES = "image/png,image/jpeg,image/webp,image/avif,image/gif,image/svg+xml";

/**
 * @param {string} gameId
 * @returns {Promise<{src: string, name?: string, at: number, w: number, h: number} | null>}
 */
export async function artFor(gameId) {
  if (!gameId) return null;
  try {
    const rec = await vault.getMeta(key(gameId));
    return rec && rec.src ? rec : null;
  } catch {
    return null;
  }
}

/** Every game that has stored art, as a Set of ids (the library badge filter). */
export async function artIds() {
  try {
    const rows = (await vault.list("meta")) || [];
    return new Set(rows.filter((r) => r.k?.startsWith("art:")).map((r) => r.k.slice(4)));
  } catch {
    return new Set();
  }
}

export async function clearArt(gameId) {
  try {
    await vault.setMeta(key(gameId), null);
  } catch {
    /* nothing stored, nothing to clear */
  }
}

/**
 * Resize and store one image as this game's cover.
 *
 * The resize is the point: a 1600x1200 scan at ~400 KB per title would make the
 * vault the biggest thing on the device, and every card would pay a decode. A
 * 560px copy is ~40 KB and looks identical at the size it is drawn.
 */
export async function setArtFromFile(gameId, file) {
  if (!file) throw new Error("no file");
  if (!/^image\//.test(file.type || "")) throw new Error(`${file.name} is not an image`);
  const dataUrl = await readAsDataUrl(file);
  const prepared = await shrink(dataUrl, file.type);
  const rec = {
    src: prepared.src,
    name: file.name,
    at: Date.now(),
    w: prepared.w || 0,
    h: prepared.h || 0,
    bytes: prepared.src.length,
    /** true when this environment could not re-encode, so the original is kept */
    raw: !prepared.w,
  };
  await vault.setMeta(key(gameId), rec);
  return rec;
}

async function readAsDataUrl(file) {
  if (typeof file.arrayBuffer === "function") {
    const buf = new Uint8Array(await file.arrayBuffer());
    let bin = "";
    // 8k chunks: btoa over a megabyte in one call is slow and can blow the stack
    for (let i = 0; i < buf.length; i += 8192) bin += String.fromCharCode(...buf.subarray(i, i + 8192));
    return "data:" + (file.type || "image/png") + ";base64," + btoa(bin);
  }
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result));
    fr.onerror = () => rej(fr.error || new Error("unreadable"));
    fr.readAsDataURL(file);
  });
}

/**
 * Decode, downscale if needed, re-encode. Returns the data URL plus dimensions
 * (0x0 when the environment cannot draw at all - a headless run keeps the bytes
 * it was given and skips the decode, because waiting for an image that will
 * never fire is how a test suite hangs).
 */
async function shrink(dataUrl, type) {
  const keepAlpha = type === "image/png" || type === "image/svg+xml" || type === "image/gif" || type === "image/webp";
  const canDraw = typeof document !== "undefined" && typeof document.createElement === "function"
    && typeof HTMLCanvasElement !== "undefined" && typeof HTMLCanvasElement.prototype.toDataURL === "function";
  if (!canDraw) return { src: dataUrl, w: 0, h: 0 };
  let img = null;
  try {
    if (typeof createImageBitmap === "function") img = await createImageBitmap(await (await fetch(dataUrl)).blob());
  } catch {
    img = null;
  }
  if (!img) img = await loadImage(dataUrl);
  const w0 = img.width || img.naturalWidth || 1;
  const h0 = img.height || img.naturalHeight || 1;
  const scale = Math.min(1, MAX_EDGE / Math.max(w0, h0));
  const w = Math.max(1, Math.round(w0 * scale));
  const h = Math.max(1, Math.round(h0 * scale));
  const cvs = document.createElement("canvas");
  cvs.width = w;
  cvs.height = h;
  const g = cvs.getContext("2d");
  if (!g || typeof g.drawImage !== "function") return { src: dataUrl, w, h };
  g.imageSmoothingQuality = "high";
  g.drawImage(img, 0, 0, w, h);
  const out = cvs.toDataURL(keepAlpha ? "image/png" : "image/jpeg", 0.84);
  // a re-encode that grew the file is a bad trade; keep the original
  return out.length < dataUrl.length ? { src: out, w, h } : { src: dataUrl, w, h };
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const el = new Image();
    // a decoder that neither loads nor errors (odd SVG, a browser bug) must not
    // leave the "Add artwork" button spinning forever
    const timer = setTimeout(() => reject(new Error("the image took too long to decode")), 8000);
    el.onload = () => {
      clearTimeout(timer);
      resolve(el);
    };
    el.onerror = () => {
      clearTimeout(timer);
      reject(new Error("the image could not be decoded"));
    };
    el.src = src;
  });
}
