/**
 * RetroDeck - ROM identification.
 *
 * Two jobs:
 *   1. work out which system a file belongs to from its *header*, not its
 *      extension (people rename things constantly, and .zip tells you nothing),
 *   2. pull the in-header title so the library can name the cart for you.
 *
 * Also: FNV-1a hashing used as the vault key + to seed cover art, and light
 * archive detection so a wrong-extension .zip is not fed to a mapper as raw.
 */

const ascii = (b, o, n) => {
  let s = "";
  for (let i = 0; i < n; i++) {
    const c = b[o + i];
    if (c === undefined || c === 0) break;
    s += c >= 32 && c < 127 ? String.fromCharCode(c) : "";
  }
  return s.trim();
};
const be16 = (b, o) => (b[o] << 8) | b[o + 1];
const le16 = (b, o) => b[o] | (b[o + 1] << 8);
const be32 = (b, o) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;

/** FNV-1a, 32-bit -> hex. Used as a dedupe key, not as a security primitive. */
export function fnv1a(bytes, hex = 16) {
  let h = 0x811c9dc5;
  const step = Math.max(1, Math.floor(bytes.length / 262144)); // sample big files
  for (let i = 0; i < bytes.length; i += step) {
    h ^= bytes[i];
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  h ^= bytes.length;
  h = Math.imul(h, 0x01000193) >>> 0;
  return h.toString(16).padStart(8, "0").repeat(Math.ceil(hex / 8)).slice(0, hex);
}

export async function hashRom(bytes) {
  if (typeof crypto !== "undefined" && crypto.subtle?.digest) {
    try {
      const d = new Uint8Array(await crypto.subtle.digest("SHA-1", bytes));
      return [...d].map((x) => x.toString(16).padStart(2, "0")).join("").slice(0, 24);
    } catch {
      /* fall through */
    }
  }
  return fnv1a(bytes, 24);
}

/* ------------------------------------------------------------------ magic */
const NES_LOGO = [0x4e, 0x45, 0x53, 0x1a];
const GB_LOGO = [
  0xce, 0xed, 0x66, 0x66, 0xcc, 0x0d, 0x00, 0x0b, 0x03, 0x73, 0x00, 0x83, 0x00, 0x0c, 0x00, 0x0d,
];
const GBA_LOGO_TAIL = [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x30, 0x97];

function has(b, o, seq) {
  if (o + seq.length > b.length) return false;
  return seq.every((v, i) => b[o + i] === v);
}
function at(b, off, str) {
  return ascii(b, off, str.length) === str;
}

/**
 * @returns {{system:string|null, format:string, title:string|null,
 *            confidence:number, note:string, region?:string}}
 */
export function sniffRom(b, fileName = "") {
  const ext = (fileName.match(/\.([a-z0-9]+)$/i)?.[1] || "").toLowerCase();
  const out = { system: null, format: "raw", title: null, confidence: 0, note: "" };
  if (!b || !b.length) return { ...out, format: "empty", note: "empty file" };

  /* containers ------------------------------------------------------- */
  if (b[0] === 0x50 && b[1] === 0x4b && (b[2] === 0x03 || b[2] === 0x05)) out.format = "zip";
  else if (b[0] === 0x37 && b[1] === 0x7a && b[2] === 0xaf) out.format = "7z";
  else if (b[0] === 0x1f && b[1] === 0x8b) out.format = "gz";

  /* iNES / NES ------------------------------------------------------- */
  if (has(b, 0, NES_LOGO)) {
    out.system = "nes";
    out.confidence = 0.99;
    const mapper = ((b[6] >> 4) | (b[7] & 0xf0));
    const tv = (b[8] & 1) === 1 ? "pal" : "ntsc";
    const prg16 = b[2], chr8 = b[3] ? b[3] * 8 : 0; // 8K banks
    out.note = `iNES · mapper ${mapper} · ${prg16 * 16}KB PRG / ${chr8}KB CHR · ${tv}`;
    out.region = tv;
    if (b[7] & 8) out.note += " · VS. System hardware";
    if (b[6] & 8) out.note += " · battery save";
    return out;
  }
  if (at(b, 0, "NES 2.0") || at(b, 0, "Discrete")) {
    out.system = "nes";
    out.confidence = 0.6;
    out.note = "NES-family header variant";
    return out;
  }

  /* Game Boy / GBC / GBA -------------------------------------------- */
  const gbTitle = ascii(b, 0x134, 16);
  if (has(b, 0x104, GB_LOGO)) {
    const cartType = b[0x147];
    const headerOk = b[0x14d] === gbChecksum(b);
    if (cartType === 0x0c || at(b, 0xb2, "AGB")) {
      out.system = "gba";
      out.confidence = 0.95;
      out.title = ascii(b, 0xa0, 12) || gbTitle;
      out.note = `GBA cart · code ${ascii(b, 0xac, 4)} · header checksum ${headerOk ? "ok" : "off"}`;
    } else if (cartType === 0x80 || cartType === 0xc8) {
      out.system = "gbc";
      out.confidence = 0.94;
      out.title = gbTitle;
      out.note = "GBC-enhanced (SGB flags present)" + (cartType === 0xc8 ? " + rumble" : "");
    } else {
      out.system = "gb";
      out.confidence = 0.92;
      out.title = gbTitle;
      const sgb = b[0x143] === 0x03 || b[0x146] === 0x03;
      out.note = "DMG" + (sgb ? " · Super Game Boy enhanced" : "") + (b[0x147] === 0x03 ? " · MBC3 battery+RTC" : "");
    }
    return out;
  }
  if (ascii(b, 0xac, 4).match(/^AGB[A-Z]$/) || (gbTitle.length > 2 && b[0x147] === 0x0c)) {
    out.system = "gba";
    out.confidence = 0.7;
    out.title = ascii(b, 0xa0, 12) || gbTitle;
    out.note = "GBA cartridge header (Nintendo logo not verified)";
    return out;
  }

  /* SNES / SFC ------------------------------------------------------- */
  for (const [off, label] of [
    [0x7fc0, "lo"],
    [0xffc0, "hi"],
    [0x40ffc0, "hirom+exfat"],
    [0x47fc0, "exlorom"],
  ]) {
    const mapMode = b[off + 5] & 0x7f;
    const checksum = be16(b, off + 0x1e);
    const romSize = b[off + 0x17];
    const country = b[off + 0x15];
    const title = ascii(b, off, 21);
    const plausible =
      title.length >= 3 && checksum !== 0 && checksum !== 0xffff && [0, 1, 3, 5, 0x45, 0x41, 0x50].includes(mapMode & 0x5f);
    if (plausible) {
      out.system = "snes";
      out.confidence = 0.86;
      out.title = title;
      const region = country >= 0x50 && country <= 0x5f ? "pal" : country === 0 ? "ntsc" : "ntsc";
      out.region = region;
      out.note = `SNES ${label} map ${mapMode} · ${1 << (romSize || 0)}K words · ${region}`;
      return out;
    }
  }

  /* Sega families ---------------------------------------------------- */
  if (at(b, 0x100, "SEGA MEGA DRIVE") || at(b, 0x100, "SEGA GENESIS")) {
    out.system = "segaMD";
    out.confidence = 0.95;
    out.title = ascii(b, 0x120, 48);
    out.note = "Mega Drive/Genesis · " + (ascii(b, 0x150, 16) || "no serial");
    return out;
  }
  if (at(b, 0x100, "SEGA GA")) {
    out.system = "segaGG";
    out.confidence = 0.93;
    out.title = ascii(b, 0x120, 48);
    out.note = "Game Gear";
    return out;
  }
  if (at(b, 0x8000, "TMR Sega") || at(b, 0x8000, "Tetrish") || (b.length === 0x8000 || b.length === 0x4000 || b.length === 0x10000 || b.length === 0x20000) && ascii(b, 0x8000, 8) === "Sega Opa") {
    out.system = "segaMS";
    out.confidence = 0.5;
    out.note = "Master System ROM size signature";
    return out;
  }
  if (at(b, 0, "SEGADISCS") || at(b, 0x100, "SEGA CD")) {
    out.system = "segaCD";
    out.confidence = 0.8;
    out.note = "Mega-CD program header";
    return out;
  }
  if (at(b, 0x300, "SEGA 32X") || at(b, 0, "32X/SHVC")) {
    out.system = "sega32x";
    out.confidence = 0.9;
    out.title = ascii(b, 0x320, 40);
    out.note = "32X cart (needs Mega Drive 1 BIOS in some cores)";
    return out;
  }
  if (at(b, 0x100, "SEGA SATURN") || has(b, 0x100, [0x53, 0x45, 0x47, 0x41, 0x20, 0x53, 0x41])) {
    out.system = "segaSaturn";
    out.confidence = 0.9;
    out.title = ascii(b, 0x120, 48);
    out.note = "Saturn disc program header";
    return out;
  }

  /* Nintendo 64 ------------------------------------------------------ */
  const m64 = be32(b, 0);
  if (m64 === 0x80371240) (out.system = "n64"), (out.note = "N64 z64 (big endian)");
  else if (m64 === 0x40123780) (out.system = "n64"), (out.note = "N64 v64 (byteswapped)");
  else if (m64 === 0x78693780 || m64 === 0x80371640) (out.system = "n64"), (out.note = "N64 u64 (word-swapped)");
  if (out.system === "n64") {
    out.confidence = 0.98;
    out.title = ascii(b, 0x20, 20);
    out.note += ` · ${ascii(b, 0x3b, 4)} · ${le16(b, 0x3e)} chars? ${b[0x3a] === 0x55 ? "JP" : b[0x3a] === 0x45 ? "EU" : "US"}`;
    return out;
  }

  /* PlayStation ------------------------------------------------------ */
  if (has(b, 0, [0x50, 0x53, 0x46, 0x49]) || ascii(b, 0, 4) === "PSFI") {
    out.system = "psx";
    out.confidence = 0.95;
    out.note = "PSX executable (PSF)";
    return out;
  }
  if (b.length >= 0x9530 && ascii(b, 0x9520, 11).match(/PLAYSTATION|Sony Computer/)) {
    out.system = "psx";
    out.confidence = 0.9;
    out.title = ascii(b, 0x80a8, 8);
    out.note = "PSX CD (system.cnf found)";
    return out;
  }
  if (b.length >= 0x400 && ascii(b, 0, 4) === "\x00\x00\x02\x00") {
    out.system = "psx";
    out.confidence = 0.6;
    out.note = "looks like a raw PSX .exe/96-mode binary";
    return out;
  }
  if (at(b, 0, "MPF") || at(b, 0, "MDF") || (b.length === 0x950 && ascii(b, 8, 4) === "CHD")) {
    out.system = null;
    out.format = "chd";
    out.note = "CHD compressed image - most cores need the .cue/.bin sibling or a CHD-capable core";
    return out;
  }
  if (b[0] === 0x43 && b[1] === 0x48 && b[2] === 0x44 && b[3] === 0x00) {
    out.system = null;
    out.format = "chd";
    out.note = "CHD 'CD" + String.fromCharCode(b[4]) + "'";
    return out;
  }

  /* DS --------------------------------------------------------------- */
  if (b.length >= 0x0c0 + 4) {
    const dev = b[0x0c];
    if ([0x04, 0x05, 0x06, 0x07, 0x08].includes(dev) && ascii(b, 0x0c0, 4) === "00041014") {
      out.system = "nds";
      out.confidence = 0.97;
      out.title = ascii(b, 0x0c, 12);
      out.note = `NDS/DSi ROM · game code ${ascii(b, 0x0c, 4)} · maker ${le16(b, 0x10) ? "0x" + be16(b, 0x10).toString(16) : "?"}`;
      return out;
    }
  }

  /* PC Engine / TG-16 ----------------------------------------------- */
  if (ascii(b, 0x1080, 28).includes("PC Engine") || ascii(b, 0x1080, 28).includes("TELE-GAME")) {
    out.system = "pce";
    out.confidence = 0.9;
    out.title = ascii(b, 0x1080, 28);
    out.note = "HuCard";
    return out;
  }
  if (ascii(b, 0, 28).includes("SUPER CD-ROM2") || ascii(b, 0, 28).includes("PC Engine CD")) {
    out.system = "pce";
    out.confidence = 0.7;
    out.note = "PC Engine CD boot sector";
    return out;
  }

  /* Atari / others -------------------------------------------------- */
  if (ascii(b, 0, 3) === "LYN") {
    out.system = "atari7800";
    out.confidence = 0.9;
    out.note = "Atari Lynx cartridge ('LYN')";
    out.title = ascii(b, 0x81, 16);
    return out;
  }
  if (at(b, 0, "Atari 7800") || at(b, 0, "atari7800")) {
    out.system = "atari7800";
    out.confidence = 0.9;
    out.note = "7800 header (2KB banked)";
    return out;
  }
  if ([128, 256, 512, 1024, 2048, 4096, 8192, 16384].includes(b.length) && !out.format.includes("zip")) {
    out.system = "atari2600";
    out.confidence = 0.45;
    const bank = { 2048: "2K", 4096: "4K", 8192: "8K (F8)", 16384: "16K (F6)" }[b.length];
    out.note = `size ${b.length} bytes → likely 2600 ${bank || ""} bankswitch`;
    return out;
  }
  if (b.length === 683 || b.length === 691) {
    out.system = "c64";
    out.confidence = 0.99;
    out.note = " Commodore tape (.tap)";
    return out;
  }
  if ([170696, 174848, 396800, 263072, 266240].includes(b.length) && (b[0x02] === 0x01 || b[0x02] === 0x23)) {
    out.system = "c64";
    out.confidence = 0.85;
    out.note = `${b.length === 174848 ? ".d64 with BAM" : ".d64"} · 1541/1571 track image`;
    return out;
  }
  if (ascii(b, 0, 4) === "BPGO" || ascii(b, 0, 3) === "NGP" || (b.length <= 0x40000 && b[0x21] === 0x0e && ascii(b, 0x2, 6).length > 2)) {
    out.system = "ngp";
    out.confidence = 0.3;
    out.note = "possible Neo Geo Pocket cart";
    return out;
  }
  if (has(b, 0x00, [0x00, 0x24, 0xf0, 0xff]) && ascii(b, 0x16, 10).length > 3) {
    out.system = "ws";
    out.confidence = 0.5;
    out.title = ascii(b, 0x16, 32);
    out.note = "WonderSwan cart";
    return out;
  }

  /* extension fallback ---------------------------------------------- */
  const byExt = {
    nes: "nes", fds: "nes", unf: "nes",
    sfc: "snes", smc: "snes", fig: "snes", swc: "snes",
    gb: "gb", dmg: "gb", sgb: "gb",
    gbc: "gbc", gba: "gba", agb: "gba",
    n64: "n64", z64: "n64", v64: "n64", u64: "n64", ndd: "n64",
    nds: "nds",
    md: "segaMD", gen: "segaMD", smd: "segaMD",
    sms: "segaMS", gg: "segaGG",
    "32x": "sega32x", bin: "segaMD", cue: "psx", chd: null, iso: "psx", pbp: "psx",
    pce: "pce", sgx: "pce",
    a26: "atari2600", "2600": "atari2600", lnx: "atari7800", a78: "atari7800",
    ngp: "ngp", ngc: "ngp", ws: "ws", wsc: "ws",
    d64: "c64", t64: "c64", g64: "c64", prg: "c64", tap: "c64", crt: "c64",
    vb: "vb", vboy: "vb",
    dosbox: "dos", conf: "dos", svm: "dos",
  };
  if (byExt[ext]) {
    out.system = byExt[ext];
    out.confidence = 0.5;
    out.note = out.note || `no header match - assumed from .${ext}`;
    return out;
  }
  if (out.format === "zip" || out.format === "7z") {
    out.system = null;
    out.confidence = 0.2;
    out.note =
      (out.note ? out.note + " · " : "") +
      "compressed archive - EmulatorJS will unpack it; system inferred from the inner file";
  }
  return out;
}

function gbChecksum(b) {
  let s = 0;
  for (let i = 0x134; i <= 0x14c; i++) s = (s - b[i] - 1) & 0xff;
  return s;
}

/**
 * Best-effort name cleanup: strip region/revision cruft so the library
 * shows "Pokémon Emerald" not "POKEMON EMER (E) [!][t+Burner]".
 */
/**
 * Best-effort name cleanup: strip region/revision cruft so the library
 * shows "Pokémon Emerald" not "POKEMON EMER (E) [!][t+Burner]".
 */
export function cleanTitle(raw) {
  if (!raw) return "";
  let s = String(raw)
    // No-Intro / GoodTools bracket tags: [!], [t+Burner], [pSHark], [bA]
    .replace(/\[[^\]]*\]/g, " ")
    // (U), (USA), (Europe), (France) (En,Fr,De) ...
    .replace(/\((?:[A-Za-z]{1,3}(?:,[A-Za-z]{1,3})*|Europe|USA|U\.S\.A\.|Japan|World|Brazil|Korea|Netherlands|Scandinavia|Spain|France|Germany|Italy|Australia)\)/gi, " ")
    // (1994), (Rev 1), (Rev A), (v1.1)
    .replace(/\((?:\d{4}|Rev[ .]?[0-9A-Za-z]+|v[0-9.]+)\)/gi, " ")
    // trailing dump-status marks
    .replace(/[!#~+]+$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  // ALL-CAPS headers read better as Title Case, but keep known acronyms
  if (/^[A-Z0-9 :.'",\-()!?]+$/.test(s) && s.length > 4) {
    s = s
      .toLowerCase()
      .replace(/\b[a-z]/g, (c) => c.toUpperCase())
      .replace(/\b(Snes|Nes|Gbc|Gba|N64|Dx|Xii|Ii|Iii|Iv|Vi|Vii|Viii|Ix|Xi)\b/g, (m) => m.toUpperCase())
      .replace(/\bOf\b/g, "of")
      .replace(/\bThe\b(?= )/g, "the");
  }
  return s.trim();
}

/** Region guess for cores that care (SNES/MD/PSX). */
export function guessRegion(b, system) {
  if (system === "snes") {
    for (const off of [0x7fd5, 0xffd5, 0x40ffd5]) {
      const c = b[off];
      if (c >= 0x50 && c <= 0x5f) return "pal";
      if (c === 0) return "ntsc";
    }
  }
  if (system === "nes" && b[8] & 1) return "pal";
  if (system === "segaMD") {
    const s = ascii(b, 0x150, 16);
    const m = s.match(/^(\d{2})T-/);
    if (m) {
      const n = Number(m[1]);
      if (n >= 50 && n <= 59) return "eu";
      if (n >= 11 && n <= 13) return "us";
      return "jp";
    }
  }
  if (system === "psx") {
    const s = ascii(b, 0x80a8, 8) + ascii(b, 0x80b0, 8);
    if (/E$|EUR|EUROPE/i.test(s)) return "eu";
    if (/P$|USA|AMERICA/i.test(s)) return "us";
    if (/J$|JAPAN/i.test(s)) return "jp";
  }
  return "auto";
}
