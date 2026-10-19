/**
 * RetroDeck - hardware model skins.
 *
 * A skin is nothing more than a bag of CSS custom properties, applied to
 * :root while a model is equipped. The shell renderer, the on-screen pad, the
 * screen glass and the whole UI chrome all read these variables, so one object
 * recolours the entire deck. That is why "skins" here are real, not a
 * cosmetic afterthought: the DMG is beige, the Super Famicom is off-white with
 * purple switches, the Genesis is black with a blue stripe.
 *
 * Key vocabulary (shared by shell + pad + chrome):
 *   shell, shell2, shellHi   body plastics
 *   bezel, glass             screen surround / glass tint
 *   btn, btnHi, btnText      face buttons
 *   btnA/B/X/Y/C             per-button tints where the hardware has them
 *   dpad, dpadHi             stick/cross
 *   accent, label, led       silkscreen + logo colours
 *   grille                   speaker holes / vents
 *   ui                       page accent colour
 */

export const SKINS = {
  /* --------------------------------------------------------- Nintendo */
  "dmg-gray": {
    name: "Game Boy Gray (DMG-01)",
    shell: "#c7c7bd", shell2: "#a8a89c", shellHi: "#dededa",
    bezel: "#8e8e85", glass: "rgba(120,140,110,0.20)",
    btn: "#4a4a52", btnHi: "#63636b", btnText: "#d6d6d0",
    btnA: "#8c2f3f", btnB: "#8c2f3f", btnX: "#4a4a52", btnY: "#4a4a52", btnC: "#4a4a52",
    dpad: "#3d3d45", dpadHi: "#55555d",
    accent: "#6a6a62", label: "#5f5f57", led: "#a02c2c", grille: "#8b8b83",
    ui: "#8bac0f",
  },
  "pocket-slate": {
    name: "Game Boy Pocket Slate",
    shell: "#8d9099", shell2: "#6f737c", shellHi: "#a7aab2",
    bezel: "#4b4e55", glass: "rgba(180,190,200,0.10)",
    btn: "#2f3238", btnHi: "#44484f", btnText: "#cfd2d8",
    dpad: "#2f3238", dpadHi: "#44484f", accent: "#c8ccd4", label: "#e6e8ec", led: "#3aa0d0",
    grille: "#5a5e66", ui: "#9fb0c0",
  },
  "gb-light-teal": {
    name: "Game Boy Light Teal",
    shell: "#4fb3b8", shell2: "#3a8f94", shellHi: "#6fcbd0",
    bezel: "#27676b", glass: "rgba(190,255,255,0.14)",
    btn: "#20565a", btnHi: "#2e6f74", btnText: "#dff7f8",
    dpad: "#20565a", dpadHi: "#2e6f74", accent: "#f2f4f0", label: "#e8fffd", led: "#c9ff6b",
    grille: "#2d7176", ui: "#4fd0d8",
  },
  "nes-black": {
    name: "NES-001 Black & Grey",
    shell: "#3c3f45", shell2: "#2a2d32", shellHi: "#585c64",
    bezel: "#202226", glass: "rgba(0,0,0,0.25)",
    btn: "#8f2f2f", btnHi: "#a94141", btnText: "#f0e8e4",
    dpad: "#2b2d31", dpadHi: "#3f424a", accent: "#b6bac2", label: "#cfd3da", led: "#c0392b",
    grille: "#26282c", ui: "#c81d25",
  },
  "nes-charcoal": {
    name: "NES-101 Top-loader",
    shell: "#5c5f66", shell2: "#45484f", shellHi: "#797d85",
    bezel: "#33363b", glass: "rgba(0,0,0,0.2)",
    btn: "#2f3238", btnHi: "#43474e", btnText: "#d8dbe0",
    dpad: "#2f3238", dpadHi: "#43474e", accent: "#a9adb5", label: "#c8ccd2", led: "#d0d0d0",
    grille: "#3d4046", ui: "#98a0aa",
  },
  "famicom-white": {
    name: "Family Computer (HVC-001)",
    shell: "#e7e3da", shell2: "#cec9be", shellHi: "#f7f4ee",
    bezel: "#b9b4a8", glass: "rgba(160,160,150,0.12)",
    btn: "#b2342f", btnHi: "#c9463f", btnText: "#fff4ee",
    dpad: "#c7c2b6", dpadHi: "#ddd8cc", accent: "#c0392b", label: "#7a7466", led: "#c0392b",
    grille: "#cdc8bc", ui: "#d84b42",
  },
  "snes-lavender": {
    name: "SNS-001 Lavender/Grey",
    shell: "#b9b6c9", shell2: "#9d9ab0", shellHi: "#cfccdb",
    bezel: "#6f6d80", glass: "rgba(90,88,110,0.14)",
    btn: "#5e5b73", btnHi: "#726f8a", btnText: "#f4f3f8",
    btnA: "#4a4760", btnB: "#4a4760", btnX: "#4a4760", btnY: "#4a4760", btnC: "#4a4760",
    dpad: "#4a4760", dpadHi: "#62607a", accent: "#7a4fd0", label: "#6a677c", led: "#8b86a0",
    grille: "#8a879b", ui: "#5b5bd6",
  },
  "sfc-purple": {
    name: "Super Famicom (SHVC-001)",
    shell: "#ded9e6", shell2: "#c2bdcf", shellHi: "#f0ecf6",
    bezel: "#8f8aa2", glass: "rgba(120,120,150,0.10)",
    btn: "#7b6fa0", btnHi: "#9387b6", btnText: "#f6f4fb",
    btnA: "#3f6fd0", btnB: "#c4353a", btnX: "#3f6fd0", btnY: "#c4353a", btnC: "#3f6fd0",
    dpad: "#4a4a5a", dpadHi: "#5e5e70", accent: "#c4353a", label: "#6f6a80", led: "#c4353a",
    grille: "#a9a4b8", ui: "#8a6fd0",
  },
  "n64-smoke": {
    name: "N64 Smoke Grey",
    shell: "#4b4e56", shell2: "#363840", shellHi: "#666a74",
    bezel: "#26282d", glass: "rgba(0,0,0,0.30)",
    btn: "#2c2e34", btnHi: "#40434b", btnText: "#dfe2e8",
    btnA: "#2c2e34", btnB: "#7a2f8f", btnX: "#2c2e34", btnY: "#2c2e34", btnC: "#2c2e34",
    dpad: "#2c2e34", dpadHi: "#40434b", accent: "#2f9e4f", label: "#b6bac4", led: "#2f9e4f",
    grille: "#33363c", ui: "#2f9e4f",
  },
  "n64-purple": {
    name: "Atomic Purple",
    shell: "#5b3d8f", shell2: "#432a6c", shellHi: "#7a58b4",
    bezel: "#2b1a48", glass: "rgba(20,0,40,0.28)",
    btn: "#1f1338", btnHi: "#33205c", btnText: "#e8dcff",
    btnA: "#1f1338", btnB: "#1f1338", btnX: "#1f1338", btnY: "#1f1338", btnC: "#1f1338",
    dpad: "#1f1338", dpadHi: "#33205c", accent: "#c9a4ff", label: "#e0d0ff", led: "#b98cff",
    grille: "#2f1c52", ui: "#a26bff",
  },
  "gba-indigo": {
    name: "GBA Indigo",
    shell: "#5d5a86", shell2: "#464368", shellHi: "#79759f",
    bezel: "#2d2b45", glass: "rgba(60,60,90,0.16)",
    btn: "#2b2942", btnHi: "#3d3b58", btnText: "#e6e4f4",
    dpad: "#2b2942", dpadHi: "#3d3b58", accent: "#8f8ac0", label: "#cfcae8", led: "#d8d8e0",
    grille: "#39365a", ui: "#6a4fb4",
  },
  "gba-glacier": {
    name: "GBA Glacier / Arctic",
    shell: "#c3d3da", shell2: "#a4b7c0", shellHi: "#e2edf1",
    bezel: "#6f8089", glass: "rgba(200,230,240,0.10)",
    btn: "#4a5a62", btnHi: "#5d6f78", btnText: "#eef6f8",
    dpad: "#3f4d54", dpadHi: "#556670", accent: "#7fa5b4", label: "#5a6b73", led: "#9ad4e8",
    grille: "#a8bcc4", ui: "#4fb3c4",
  },
  "gbc-purple": {
    name: "GBC Atomic Purple",
    shell: "#8f7fb8", shell2: "#75659e", shellHi: "#a99bd0",
    bezel: "#4c4166", glass: "rgba(120,110,160,0.16)",
    btn: "#3d3552", btnHi: "#514868", btnText: "#eae6f6",
    btnA: "#a33b52", btnB: "#a33b52", dpad: "#3d3552", dpadHi: "#514868",
    accent: "#e0d8f6", label: "#d6cdf0", led: "#cfe8ff", grille: "#6f6193", ui: "#b58ff0",
  },
  "nds-onyx": {
    name: "DS Lite Onyx",
    shell: "#2b2d33", shell2: "#1c1e22", shellHi: "#3d4048",
    bezel: "#131417", glass: "rgba(0,0,0,0.35)",
    btn: "#3f424a", btnHi: "#565a64", btnText: "#dfe2e8",
    dpad: "#3f424a", dpadHi: "#565a64", accent: "#c0c4cc", label: "#9aa0aa", led: "#4fb0e8",
    grille: "#22242a", ui: "#2f9ed6",
  },
  "vb-carbon": {
    name: "Virtual Boy Carbon Red",
    shell: "#26262a", shell2: "#171719", shellHi: "#3a3a40",
    bezel: "#0d0d10", glass: "rgba(255,40,40,0.10)",
    btn: "#8b1f2b", btnHi: "#a52e3b", btnText: "#ffe9e9",
    dpad: "#1c1c20", dpadHi: "#2e2e34", accent: "#d63b3b", label: "#8a8a92", led: "#ff3b3b",
    grille: "#1f1f24", ui: "#ff4a4a",
  },

  /* ------------------------------------------------------------- Sega */
  "md-jp": {
    name: "Mega Drive HGC-3000 (Japan)",
    shell: "#2b2c30", shell2: "#1b1c1f", shellHi: "#3f4046",
    bezel: "#141517", glass: "rgba(0,0,0,0.28)",
    btn: "#1f2024", btnHi: "#34363c", btnText: "#e6e6ea",
    btnA: "#c0392b", btnB: "#c0392b", btnC: "#c0392b", btnX: "#c0392b", btnY: "#c0392b", btnZ: "#c0392b",
    dpad: "#15161a", dpadHi: "#2a2c32", accent: "#d81f26", label: "#b8bcc4", led: "#ff4b3b",
    grille: "#191a1d", ui: "#e02030",
  },
  "genesis-blue": {
    name: "Genesis Model 1 (Mk I)",
    shell: "#1e2129", shell2: "#12141a", shellHi: "#2f3340",
    bezel: "#0b0c0f", glass: "rgba(0,0,0,0.3)",
    btn: "#16181e", btnHi: "#282b34", btnText: "#dfe3ea",
    btnA: "#d62b1c", btnB: "#d62b1c", btnC: "#d62b1c", btnX: "#d62b1c", btnY: "#d62b1c", btnZ: "#d62b1c",
    dpad: "#101218", dpadHi: "#222630", accent: "#2b6fd6", label: "#8fa0b8", led: "#e8e8e8",
    grille: "#15171c", ui: "#2b6fd6",
  },
  "md2-slim": {
    name: "Mega Drive 2 (VA2)",
    shell: "#3a3d44", shell2: "#282b31", shellHi: "#52565f",
    bezel: "#1c1e22", glass: "rgba(0,0,0,0.22)",
    btn: "#23262c", btnHi: "#383c44", btnText: "#dfe2e8",
    btnA: "#c74a3a", btnB: "#c74a3a", btnC: "#c74a3a", btnX: "#c74a3a", btnY: "#c74a3a", btnZ: "#c74a3a",
    dpad: "#1c1f24", dpadHi: "#2f333a", accent: "#3c88d0", label: "#a8adb8", led: "#c8c8c8",
    grille: "#24262b", ui: "#4c90d0",
  },
  "gg-charcoal": {
    name: "Game Gear (MK-2100)",
    shell: "#33353c", shell2: "#22242a", shellHi: "#4a4d56",
    bezel: "#151619", glass: "rgba(0,0,0,0.30)",
    btn: "#1d1f24", btnHi: "#31343b", btnText: "#e2e4ea",
    btnA: "#c33", btnB: "#c33", dpad: "#15171b", dpadHi: "#282b31",
    accent: "#e02030", label: "#9aa0aa", led: "#ff5a4a", grille: "#1a1c20", ui: "#e02030",
  },
  "gg-blue": {
    name: "Game Gear Ocean Blue",
    shell: "#2f5c9e", shell2: "#224576", shellHi: "#4777b8",
    bezel: "#152b4a", glass: "rgba(120,180,255,0.12)",
    btn: "#152b4a", btnHi: "#224576", btnText: "#dcecff",
    btnA: "#e02030", btnB: "#e02030", dpad: "#152b4a", dpadHi: "#224576",
    accent: "#a8c8f0", label: "#cfe2ff", led: "#7fd4ff", grille: "#1c3457", ui: "#4f9dff",
  },
  "saturn-white": {
    name: "Saturn HST-3020",
    shell: "#d9d9df", shell2: "#bcbcc6", shellHi: "#f0f0f4",
    bezel: "#8d8d99", glass: "rgba(140,140,160,0.10)",
    btn: "#3a3a44", btnHi: "#4e4e5a", btnText: "#ececf2",
    btnA: "#3a3a44", btnB: "#3a3a44", btnC: "#3a3a44", btnX: "#3a3a44", btnY: "#3a3a44", btnZ: "#3a3a44",
    dpad: "#2f2f38", dpadHi: "#45454f", accent: "#c0392b", label: "#7a7a86", led: "#c0392b",
    grille: "#c2c2cc", ui: "#9aa0b0",
  },
  "dc-white": {
    name: "Dreamcast (HKT-1000)",
    shell: "#e8e8ec", shell2: "#cfcfd8", shellHi: "#f8f8fc",
    bezel: "#9a9aa6", glass: "rgba(150,150,170,0.10)",
    btn: "#2f2f38", btnHi: "#45454f", btnText: "#ececf2",
    btnA: "#2f6fd0", btnB: "#d04a2f", btnX: "#2fa04f", btnY: "#d0a02f",
    dpad: "#2f2f38", dpadHi: "#45454f", accent: "#2fa04f", label: "#7a7a86", led: "#2fa04f",
    grille: "#d0d0d8", ui: "#33c96e",
  },
  "sms-black": {
    name: "Master System II",
    shell: "#2c2d31", shell2: "#1c1d20", shellHi: "#414248",
    bezel: "#121315", glass: "rgba(0,0,0,0.26)",
    btn: "#1a1b1e", btnHi: "#2d2f33", btnText: "#e2e2e6",
    btnA: "#c4353a", btnB: "#c4353a", dpad: "#141518", dpadHi: "#26282c",
    accent: "#3f6fd0", label: "#9a9ca2", led: "#c8c8c8", grille: "#17181b", ui: "#4a7ad0",
  },

  /* ------------------------------------------------------------- Sony */
  "psx-grey": {
    name: "PlayStation SCPH-1002",
    shell: "#c9c8c2", shell2: "#adaca6", shellHi: "#e0dfd9",
    bezel: "#7e7d78", glass: "rgba(120,120,118,0.10)",
    btn: "#4a4a48", btnHi: "#5e5e5c", btnText: "#e8e8e6",
    btnA: "#2f8fb0", btnB: "#c04a6a", btnX: "#7fae4f", btnY: "#9a6fc0",
    dpad: "#4a4a48", dpadHi: "#5e5e5c", accent: "#2f6fb0", label: "#6f6e6a", led: "#c0392b",
    grille: "#b0afa9", ui: "#4f9dc0",
  },
  "psone-graphite": {
    name: "PSone (SCP-100)",
    shell: "#4b4b4f", shell2: "#37373b", shellHi: "#63636a",
    bezel: "#26262a", glass: "rgba(0,0,0,0.30)",
    btn: "#2b2b2f", btnHi: "#3e3e44", btnText: "#dcdce2",
    btnA: "#3f8fb0", btnB: "#c05070", btnX: "#7aa84f", btnY: "#8f6fb8",
    dpad: "#2b2b2f", dpadHi: "#3e3e44", accent: "#8f939c", label: "#a8acb4", led: "#3f8fb0",
    grille: "#2f2f34", ui: "#6fb8d6",
  },
  "psp-ceramic": {
    name: "PSP-1000 Ceramic White",
    shell: "#e4e4e8", shell2: "#c8c8d0", shellHi: "#f6f6fa",
    bezel: "#9a9aa4", glass: "rgba(160,160,170,0.10)",
    btn: "#4d4d55", btnHi: "#63636c", btnText: "#f0f0f4",
    btnA: "#2f8fb0", btnB: "#c04a6a", btnX: "#7fae4f", btnY: "#9a6fc0",
    dpad: "#3f3f47", dpadHi: "#55555e", accent: "#7a7a86", label: "#8a8a94", led: "#4fb0e8",
    grille: "#c2c2ca", ui: "#4f74c9",
  },
  "psp-midnight": {
    name: "PSP-3000 Midnight Blue",
    shell: "#27324a", shell2: "#1a2233", shellHi: "#3a4866",
    bezel: "#10182a", glass: "rgba(0,0,20,0.32)",
    btn: "#141c2e", btnHi: "#243048", btnText: "#d6e2f8",
    btnA: "#4fc0e0", btnB: "#e06a8a", btnX: "#8fd06a", btnY: "#b08fe0",
    dpad: "#141c2e", dpadHi: "#243048", accent: "#8fa8d0", label: "#b0c0e0", led: "#4fc0e0",
    grille: "#1a2438", ui: "#4f9df0",
  },

  /* ------------------------------------------------------ Atari / NEC / SNK */
  "atari-wood": {
    name: "Atari 2600 VCS (9-switch)",
    shell: "#6b5a44", shell2: "#544634", shellHi: "#82705a",
    bezel: "#2b2b2b", glass: "rgba(40,30,20,0.20)",
    btn: "#2b2b2b", btnHi: "#3e3e3e", btnText: "#e8e2d6",
    btnA: "#c8b28a", dpad: "#2b2b2b", dpadHi: "#3e3e3e",
    accent: "#c9a15a", label: "#e0d2b8", led: "#d8d8d8", grille: "#4a4a4a", ui: "#c9a15a",
  },
  "atari-noir": {
    name: "Atari 7800",
    shell: "#2f3134", shell2: "#202224", shellHi: "#45484c",
    bezel: "#141517", glass: "rgba(0,0,0,0.28)",
    btn: "#1c1d20", btnHi: "#2f3134", btnText: "#dfe1e4",
    btnA: "#4c9a4a", dpad: "#181a1c", dpadHi: "#2b2d30",
    accent: "#4c9a4a", label: "#9a9da2", led: "#4c9a4a", grille: "#1a1c1e", ui: "#5cc05a",
  },
  "lynx-graphite": {
    name: "Atari Lynx I",
    shell: "#45484e", shell2: "#31343a", shellHi: "#5d616a",
    bezel: "#1e2024", glass: "rgba(0,0,0,0.30)",
    btn: "#2a2d33", btnHi: "#3d4046", btnText: "#e2e4e8",
    btnA: "#d63b3b", btnB: "#d6a83b", dpad: "#1e2024", dpadHi: "#31343a",
    accent: "#a8adb5", label: "#c0c4cc", led: "#e8e8e8", grille: "#26282c", ui: "#c0c8d4",
  },
  "pce-grafx": {
    name: "PC Engine Core Grafx",
    shell: "#d8d5cc", shell2: "#bab6ab", shellHi: "#eeebe4",
    bezel: "#8b8880", glass: "rgba(120,120,110,0.12)",
    btn: "#4d4a44", btnHi: "#63605a", btnText: "#f2efe9",
    btnA: "#d94f9c", btnB: "#d94f9c", dpad: "#3b3833", dpadHi: "#524e48",
    accent: "#d94f9c", label: "#7a776f", led: "#e02030", grille: "#c0bcb2", ui: "#e060b0",
  },
  "tg16-black": {
    name: "TurboGrafx-16",
    shell: "#2e2f33", shell2: "#1e1f22", shellHi: "#43454a",
    bezel: "#121315", glass: "rgba(0,0,0,0.28)",
    btn: "#1a1b1e", btnHi: "#2c2e32", btnText: "#e2e2e4",
    btnA: "#c0392b", btnB: "#c0392b", dpad: "#151618", dpadHi: "#26282b",
    accent: "#2b6fd6", label: "#9a9ca2", led: "#c0392b", grille: "#17181a", ui: "#c0392b",
  },
  "neo-aes": {
    name: "Neo Geo AES",
    shell: "#23242a", shell2: "#16171b", shellHi: "#383a42",
    bezel: "#0e0f12", glass: "rgba(0,0,0,0.32)",
    btn: "#1c1d22", btnHi: "#2f3138", btnText: "#e6e6ea",
    btnA: "#f0a202", btnB: "#f0a202", btnX: "#f0a202", btnY: "#f0a202", btnC: "#f0a202", btnD: "#f0a202",
    dpad: "#141519", dpadHi: "#26282e", accent: "#f0a202", label: "#a8aab2", led: "#f0a202",
    grille: "#1a1b1f", ui: "#f0a202",
  },
  "ngpc-red": {
    name: "Neo Geo Pocket Color (Red)",
    shell: "#b7322c", shell2: "#94251f", shellHi: "#d1483f",
    bezel: "#4d1512", glass: "rgba(0,0,0,0.22)",
    btn: "#3d1210", btnHi: "#551916", btnText: "#ffe9e6",
    btnA: "#f0a202", btnB: "#f0a202", dpad: "#2c0d0c", dpadHi: "#421413",
    accent: "#f7d9d6", label: "#fbdcd8", led: "#ffd96b", grille: "#6d1d19", ui: "#ff5b48",
  },
  "wsc-teal": {
    name: "WonderSwan Color (Teal Blue)",
    shell: "#2f6f78", shell2: "#215259", shellHi: "#448c95",
    bezel: "#12333a", glass: "rgba(0,0,0,0.24)",
    btn: "#1a3c42", btnHi: "#2a545c", btnText: "#dff2f5",
    btnA: "#e02030", btnB: "#e0a020", btnC: "#e02030", btnD: "#e0a020", btnX: "#f0f0f0", btnY: "#f0f0f0",
    dpad: "#163237", dpadHi: "#264b52", accent: "#cfe8ec", label: "#a8ccd4", led: "#7fd4ff",
    grille: "#1e464d", ui: "#3fd0e0",
  },
  "ws-black": {
    name: "WonderSwan (Black)",
    shell: "#26272b", shell2: "#1a1b1e", shellHi: "#3a3c42",
    bezel: "#101113", glass: "rgba(0,0,0,0.30)",
    btn: "#3a3c42", btnHi: "#4c4f56", btnText: "#e4e6ea",
    btnA: "#8f2f3f", btnB: "#8f2f3f", btnC: "#8f2f3f", btnD: "#8f2f3f", btnX: "#2c2e33", btnY: "#2c2e33",
    dpad: "#1e2023", dpadHi: "#313438", accent: "#9aa0aa", label: "#8b8f98", led: "#e02030",
    grille: "#1c1d21", ui: "#c0c8d4",
  },

  /* ------------------------------------------------------------- Computers */
  "c64-breadbin": {
    name: "Commodore 64 (breadbin)",
    shell: "#b5ac9a", shell2: "#9a917f", shellHi: "#cbc3b3",
    bezel: "#6b6455", glass: "rgba(90,80,60,0.16)",
    btn: "#3f3a32", btnHi: "#555044", btnText: "#e8e2d4",
    btnA: "#6f8f3f", dpad: "#3f3a32", dpadHi: "#555044",
    accent: "#8b6f4f", label: "#5f5a4e", led: "#d8d8d8", grille: "#a29a88", ui: "#4a3a7a",
  },
  "dos-beige": {
    name: "IBM AT / 486DX2 tower",
    shell: "#c9c4b4", shell2: "#aca794", shellHi: "#dedacc",
    bezel: "#7d7869", glass: "rgba(120,120,90,0.12)",
    btn: "#4c483e", btnHi: "#625d51", btnText: "#efeade",
    btnA: "#00a6a0", dpad: "#4c483e", dpadHi: "#625d51",
    accent: "#8f8a7a", label: "#6f6b5e", led: "#5ad05a", grille: "#b0aa98", ui: "#00a6a0",
  },

  /* --------------------------------------------------------- Arcade / misc */
  "cab-cyber": {
    name: "Upright cabinet (blue marquee)",
    shell: "#1b2a4a", shell2: "#121d33", shellHi: "#2a3f68",
    bezel: "#080c16", glass: "rgba(0,0,20,0.34)",
    btn: "#c0392b", btnHi: "#d8524a", btnText: "#fff0ec",
    btnA: "#e0a020", btnB: "#c0392b", btnX: "#2f8fb0", btnY: "#5ad05a",
    dpad: "#1a1a1e", dpadHi: "#2c2c32", accent: "#f0a202", label: "#e8eef8", led: "#ffe27a",
    grille: "#101828", ui: "#f0a202",
  },
  "cab-neo": {
    name: "Neo Geo MVS cabinet",
    shell: "#2a2118", shell2: "#1a140e", shellHi: "#40332a",
    bezel: "#0d0a07", glass: "rgba(20,10,0,0.3)",
    btn: "#f0a202", btnHi: "#ffbe3a", btnText: "#241a06",
    btnA: "#f0a202", btnB: "#e05030", btnX: "#3fa0d0", btnY: "#8fd04a",
    dpad: "#151009", dpadHi: "#282019", accent: "#f0a202", label: "#f5e2b8", led: "#ffd96b",
    grille: "#191309", ui: "#f0a202",
  },
  "neon-night": {
    name: "Aftermarket · Neon Night",
    shell: "#141622", shell2: "#0b0d16", shellHi: "#242840",
    bezel: "#06080f", glass: "rgba(80,0,160,0.22)",
    btn: "#ff2e88", btnHi: "#ff5ba2", btnText: "#fff0f8",
    btnA: "#00e5ff", btnB: "#ff2e88", btnX: "#c04dff", btnY: "#7cffb2", btnC: "#ffe066",
    dpad: "#00e5ff", dpadHi: "#4df2ff", accent: "#ff2e88", label: "#b8c4ff", led: "#00e5ff",
    grille: "#0d1020", ui: "#ff2e88",
  },
  "carbon-stealth": {
    name: "Aftermarket · Carbon Stealth",
    shell: "#1c1d21", shell2: "#101114", shellHi: "#2e3038",
    bezel: "#08090b", glass: "rgba(0,0,0,0.4)",
    btn: "#3a3c44", btnHi: "#50535d", btnText: "#dfe2ea",
    btnA: "#d63b3b", btnB: "#3f9ed6", btnX: "#5ad05a", btnY: "#e0c040", btnC: "#b06fe0",
    dpad: "#26282e", dpadHi: "#3a3d45", accent: "#7a8090", label: "#9aa1af", led: "#d63b3b",
    grille: "#15161a", ui: "#8fa0c0",
  },
  "translucent-purple": {
    name: "Aftermarket · Translucent Purple",
    shell: "#6b4bb0", shell2: "#523a8a", shellHi: "#8a68d6",
    bezel: "#2f2050", glass: "rgba(120,80,200,0.26)",
    btn: "#2f2050", btnHi: "#46306e", btnText: "#efe6ff",
    btnA: "#ff4fa0", btnB: "#4fd0ff", btnX: "#a8ff4f", btnY: "#ffd04f", btnC: "#ff4f4f",
    dpad: "#2f2050", dpadHi: "#46306e", accent: "#d6b8ff", label: "#e8dcff", led: "#ffd04f",
    grille: "#3f2b6e", ui: "#b48fff",
  },
  "translucent-smoke": {
    name: "Aftermarket · Translucent Smoke",
    shell: "#4a5058", shell2: "#363b42", shellHi: "#666d78",
    bezel: "#1e2126", glass: "rgba(140,160,180,0.22)",
    btn: "#20232a", btnHi: "#333740", btnText: "#dfe6f0",
    btnA: "#7ad0ff", btnB: "#ff8f8f", btnX: "#8fff9a", btnY: "#ffe08f",
    dpad: "#20232a", dpadHi: "#333740", accent: "#b0becf", label: "#cfd8e4", led: "#7ad0ff",
    grille: "#2a2e35", ui: "#7ad0ff",
  },
  "shell-white-wave": {
    name: "Aftermarket · Wave White",
    shell: "#f1f2f0", shell2: "#d9dbd8", shellHi: "#ffffff",
    bezel: "#a8aaa6", glass: "rgba(200,210,215,0.10)",
    btn: "#3b7fd4", btnHi: "#5a97e2", btnText: "#f4f8ff",
    btnA: "#3b7fd4", btnB: "#3b7fd4", btnX: "#e04f6f", btnY: "#e04f6f", btnC: "#3b7fd4",
    dpad: "#2b2e33", dpadHi: "#41454b", accent: "#3b7fd4", label: "#6b6f76", led: "#3b7fd4",
    grille: "#dcded9", ui: "#3b7fd4",
  },
  "shell-sunset": {
    name: "Aftermarket · Sunset Pop",
    shell: "#f07a3c", shell2: "#d05a24", shellHi: "#ff9a63",
    bezel: "#7a2f10", glass: "rgba(255,180,120,0.18)",
    btn: "#2e6b6b", btnHi: "#3d8686", btnText: "#e6ffff",
    btnA: "#ffe066", btnB: "#ff5f6d", btnX: "#5ff0c8", btnY: "#ffffff",
    dpad: "#2e6b6b", dpadHi: "#3d8686", accent: "#ffe066", label: "#fff3e0", led: "#ffe066",
    grille: "#b74a18", ui: "#ff8a4c",
  },
  "shell-mint": {
    name: "Aftermarket · Mint Cream",
    shell: "#bfe4d8", shell2: "#9ecabb", shellHi: "#dbf3ea",
    bezel: "#6a9a8a", glass: "rgba(180,240,220,0.14)",
    btn: "#2f5a4f", btnHi: "#3f7466", btnText: "#e8fff8",
    btnA: "#f2a0b8", btnB: "#f2a0b8", btnX: "#f6d16b", btnY: "#f6d16b",
    dpad: "#2f5a4f", dpadHi: "#3f7466", accent: "#f2a0b8", label: "#4f7a6c", led: "#f6d16b",
    grille: "#a8cebe", ui: "#5fd4a8",
  },
  "shell-sega-r": {
    name: "Aftermarket · Sega R (blue stripe)",
    shell: "#0e1420", shell2: "#070b12", shellHi: "#1c2638",
    bezel: "#04070c", glass: "rgba(0,0,0,0.4)",
    btn: "#d81f26", btnHi: "#f0363e", btnText: "#fff0f0",
    btnA: "#d81f26", btnB: "#d81f26", btnC: "#d81f26", btnX: "#2b6fd6", btnY: "#2b6fd6", btnZ: "#2b6fd6",
    dpad: "#0d1219", dpadHi: "#1d2530", accent: "#2b6fd6", label: "#c8d0e0", led: "#d81f26",
    grille: "#0a0e16", ui: "#2b6fd6",
  },
  "shell-polar": {
    name: "Aftermarket · Polar (SNES Jr)",
    shell: "#eef0f4", shell2: "#d3d7de", shellHi: "#ffffff",
    bezel: "#a4a9b4", glass: "rgba(180,190,205,0.10)",
    btn: "#6f7890", btnHi: "#858ea8", btnText: "#f6f8fc",
    btnA: "#5f6f90", btnB: "#5f6f90", btnX: "#5f6f90", btnY: "#5f6f90",
    dpad: "#5a6478", dpadHi: "#6f7a92", accent: "#8fa0c0", label: "#7a8290", led: "#c0c8d4",
    grille: "#d6dae2", ui: "#8fa0c0",
  },
  "shell-cartridge": {
    name: "Aftermarket · Recycled Board",
    shell: "#2f6b3f", shell2: "#234f2f", shellHi: "#3f8b52",
    bezel: "#122a18", glass: "rgba(0,60,0,0.30)",
    btn: "#d6c14a", btnHi: "#e8d66a", btnText: "#2a2610",
    btnA: "#d6c14a", btnB: "#d6c14a", btnX: "#d6c14a", btnY: "#d6c14a",
    dpad: "#c8b23a", dpadHi: "#dcc84a", accent: "#e8f0d0", label: "#d8e8c8", led: "#7cffb2",
    grille: "#1d3f26", ui: "#7cffb2",
  },
};

/** Aftermarket skins can be equipped on any console, in addition to stock. */
export const AFTERMARKET = [
  "neon-night",
  "carbon-stealth",
  "translucent-purple",
  "translucent-smoke",
  "shell-white-wave",
  "shell-sunset",
  "shell-mint",
  "shell-sega-r",
  "shell-polar",
  "shell-cartridge",
];

export const SKIN_IDS = Object.keys(SKINS);

export const CSS_VAR_KEYS = [
  "shell", "shell2", "shellHi", "bezel", "glass",
  "btn", "btnHi", "btnText",
  "btnA", "btnB", "btnX", "btnY", "btnC", "btnZ", "btnD",
  "dpad", "dpadHi", "accent", "label", "led", "grille", "ui",
];

export function skinVars(skinId, override = {}) {
  const base = SKINS[skinId] || SKINS["carbon-stealth"];
  const vars = {};
  for (const k of CSS_VAR_KEYS) {
    const v = override[k] ?? base[k];
    if (v) vars[`--${k}`] = v;
  }
  // fall back for the button tints so a mono pad never renders invisible
  if (!vars["--btnA"]) vars["--btnA"] = base.btn;
  if (!vars["--btnB"]) vars["--btnB"] = base.btn;
  if (!vars["--btnX"]) vars["--btnX"] = base.btn;
  if (!vars["--btnY"]) vars["--btnY"] = base.btn;
  return vars;
}
