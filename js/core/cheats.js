/**
 * Per-game cheat codes, kept in the same vault store as everything else that is
 * yours and nothing else's.
 *
 * The runtime's own cheat list is `EJS_cheats`, and the shape is *not* what the
 * documentation page suggests: emulator.min.js reads
 *
 *     Array.isArray(this.config.cheats) && cheats[i] -> [desc, code]
 *
 * i.e. an array of two-item arrays, one code per row, each becoming
 * { desc, checked:false, code, is_permanent:true } in the runtime's menu. Passing
 * {name, codes:[...]} - the documented shape - produces a menu with nothing in it.
 * That mapping lives here so there is exactly one place that knows it.
 *
 * Codes are Game Genie / Pro Action Replay text for the console in question, which
 * is why this file never validates them: an invalid code is inert, not dangerous,
 * and the deck's own core decides.
 */
import { vault } from "./idb.js";

const KEY = (gameKey) => `cheats:${gameKey}`;

/** "Infinite lives | 0100FF00" per line -> [{ desc, code }]. Blank/# lines ignored. */
export function parseCheats(text) {
  const out = [];
  for (const line of String(text || "").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#") || t.startsWith("//")) continue;
    const at = t.indexOf("|");
    const desc = (at < 0 ? t : t.slice(0, at)).trim();
    const code = at < 0 ? "" : t.slice(at + 1).trim();
    if (!desc) continue;
    out.push({ desc, code: code.replace(/\s+/g, " ") });
  }
  return out.filter((c) => c.code);
}

export function formatCheats(list) {
  return (list || []).map((c) => `${c.desc}${c.code ? ` | ${c.code}` : ""}`).join("\n");
}

/** What EJS_cheats wants: [[desc, code], ...]. */
export function ejsCheats(list) {
  return (list || []).filter((c) => c.desc && c.code).map((c) => [c.desc, c.code]);
}

export async function cheatsFor(gameKey) {
  if (!gameKey) return [];
  const rows = await vault.getMeta(KEY(gameKey)).catch(() => null);
  return Array.isArray(rows) ? rows : [];
}

export async function setCheats(gameKey, list) {
  const rows = (list || []).filter((c) => c.desc && c.code);
  if (rows.length) await vault.setMeta(KEY(gameKey), rows);
  else await vault.setMeta(KEY(gameKey), null);
  return rows;
}
