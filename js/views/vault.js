/**
 * Vault: the files that live on this device.
 *
 * Cartridge images, BIOS images, save states and battery saves all sit in
 * IndexedDB (`retrodeck`). Nothing here talks to a network, and every list has
 * an export path so the data can leave as easily as it arrived.
 */
import { store, fmtBytes, fmtDate } from "../core/store.js";
import { vault } from "../core/idb.js";
import { SYSTEMS, SYSTEM_BY_ID } from "../data/systems.js";
import { hashRom, sniffRom, cleanTitle } from "../core/detect.js";
import { h, mount, sheet, toast, chip, pickFiles, confirmSheet, download, sectionTitle } from "../ui.js";
import { sysName, extsFor, acceptFor } from "./parts.js";

export async function renderVault(root, ctx) {
  const state = { roms: [], states: [], sram: [], usage: null, filter: "all", q: "" };
  const body = h("div", { style: { display: "grid", gap: "var(--gap-lg)" } });
  mount(
    root,
    h("section", {},
      h("h1", {}, "Cartridges & saves"),
      h("p.muted.small", {}, "Everything below is stored in this browser only - no server ever sees these bytes.")),
    body,
  );

  await reload();

  async function reload() {
    const [roms, states, sram] = await Promise.all([
      vault.list("roms").catch(() => []),
      vault.list("states").catch(() => []),
      vault.list("sram").catch(() => []),
    ]);
    const biosMeta = store.get("bios", {}) || {};
    state.roms = roms;
    state.states = states;
    state.sram = sram;
    state.usage = await vault.usage().catch(() => null);
    draw(biosMeta);
  }

  function draw(biosMeta) {
    const romBytes = state.roms.reduce((a, r) => a + (r.size || 0), 0);
    const stateBytes = state.states.reduce((a, r) => a + (r.bytes?.length || 0), 0) + state.sram.reduce((a, r) => a + (r.bytes?.length || 0), 0);
    mount(
      body,
      h("div.notice" + (vault.volatile ? ".notice--bad" : ""), {},
        vault.volatile
          ? h("b", {}, "IndexedDB is unavailable here - files live in memory and vanish on reload.")
          : h("b", {}, "This device only."),
        h("span", {}, `${state.roms.length} cartridge${state.roms.length === 1 ? "" : "s"} · ${fmtBytes(romBytes)} · ` +
          `${state.states.length} save state${state.states.length === 1 ? "" : "s"} + ${state.sram.length} battery save${state.sram.length === 1 ? "" : "s"} · ${fmtBytes(stateBytes)}`),
        h("div.notice__row", {},
          h("button.btn.btn--sm.btn--primary", { onclick: () => importFlow() }, "+ Add cartridges"),
          state.usage && !vault.volatile
            ? h("button.btn.btn--sm.btn--ghost", { onclick: async () => {
                const ok = await vault.requestPersistence?.();
                toast(ok === false ? "The browser said no - keep using the app, it usually grants it later" : "Persistence requested", ok === false ? "warn" : "good");
              } }, "Ask to keep this data")
            : null,
          state.usage ? h("span.small.mono.muted", {}, `${fmtBytes(state.usage.usage)} / ${fmtBytes(state.usage.quota)} quota`) : null)),

      romSection(),
      biosSection(biosMeta),
      savesSection(),
      dangerSection(),
    );
  }

  /* ------------------------------------------------------------- roms */
  function romSection() {
    const list = h("div.list", {});
    const box = h("section", {},
      sectionTitle("Cartridges",
        h("input.mini", {
          type: "search", placeholder: "Filter by name", value: state.q,
          oninput: (e) => { state.q = e.target.value; paint(); },
        })),
      h("div.chips", {},
        chip("All", state.filter === "all", () => { state.filter = "all"; paint(); }, { count: state.roms.length }),
        ...SYSTEMS.filter((s) => state.roms.some((r) => r.system === s.id)).map((s) =>
          chip(sysName(s.id), state.filter === s.id, () => { state.filter = s.id; paint(); }, {
            swatch: s.color,
            count: state.roms.filter((r) => r.system === s.id).length,
          }))),
      list,
    );
    paint();
    return box;

    function paint() {
      const rows = state.roms
        .filter((r) => (state.filter === "all" ? true : r.system === state.filter))
        .filter((r) => !state.q || `${r.name} ${r.fileName}`.toLowerCase().includes(state.q.toLowerCase()))
        .sort((a, b) => (b.added || 0) - (a.added || 0))
        .map((r) => romRow(r));
      if (!rows.length) {
        mount(list, h("div.li", {}, h("div.li__main", {},
          h("b", {}, state.roms.length ? "No cartridge matches that filter." : "The vault is empty."),
          h("span", {}, state.roms.length ? "" : `Drop ${extsFor(state.filter === "all" ? null : state.filter)} files anywhere on this page, or use Add cartridges.`))));
        return;
      }
      mount(list, ...rows);
    }
  }

  function romRow(r) {
    const linked = Object.entries(store.state.game || {}).filter(([, v]) => v.romHash === r.hash).map(([id]) => id);
    const mismatch = r.detected && r.system && r.detected !== r.system;
    return h("div.li", {},
      h("span.dot" + (mismatch ? ".dot--warn" : ".dot--good"), { title: mismatch ? `header says ${sysName(r.detected)}` : "header matches" }),
      h("div.li__main", {},
        h("b", {}, r.name || cleanTitle(r.fileName || "untitled")),
        h("span", {}, `${sysName(r.system)} · ${fmtBytes(r.size)} · ${fmtDate(r.added)}`),
        linked.length ? h("span", {}, `attached to ${linked.length} index entr${linked.length > 1 ? "ies" : "y"}`) : h("span", {}, "not attached to an index entry")),
      h("div", { style: { display: "flex", gap: "6px" } },
        h("button.btn.btn--sm", { onclick: () => { location.hash = `#/play/rom:${r.hash}`; } }, "▶"),
        h("button.btn.btn--sm.btn--ghost", { onclick: () => attachSheet(r) }, "Attach"),
        h("button.btn.btn--sm.btn--ghost", {
          onclick: async () => {
            const rec = await vault.romFor(r.hash);
            if (!rec?.bytes) return toast("The bytes are gone from this browser", "bad");
            download(rec.fileName || `${r.name || "rom"}.bin`, new Blob([rec.bytes], { type: "application/octet-stream" }));
          },
        }, "Save"),
        h("button.btn.btn--sm.btn--danger", {
          onclick: async () => {
            const ok = await confirmSheet("Delete this cartridge?", `${r.fileName || r.name} (${fmtBytes(r.size)}) will be removed from this browser. Save states stay unless you delete them below.`, "Delete");
            if (!ok) return;
            await vault.removeRom(r.hash);
            for (const id of linked) store.setGame(id, { romHash: null });
            toast("Deleted", "good");
            reload();
          },
        }, "✕")));
  }

  /* ------------------------------------------------------------- attach */
  function attachSheet(rom) {
    const box = h("div", { style: { display: "grid", gap: "8px" } },
      h("p.sheet__p", {}, `Pick the index entry this file belongs to. RetroDeck records the link, not a copy - the bytes stay where they are.`),
      h("div#attach-list.list", {}, h("div.li", {}, h("div.li__main", {}, h("b", {}, "loading…")))));
    const s = sheet(`Attach ${rom.name || rom.fileName}`, box, { wide: true });
    (async () => {
      const { INDEX } = await import("./parts.js");
      const pool = INDEX.filter((g) => g.system === rom.system).slice(0, 400);
      const byTitle = new Map(pool.map((g) => [g.title.toLowerCase(), g]));
      const guess = byTitle.get(cleanTitle(rom.name || "").toLowerCase());
      const rows = (guess ? [guess, ...pool.filter((g) => g !== guess)] : pool).map((g) =>
        h("button.li.li--play", {
          onclick: () => {
            store.setGame(g.id, { romHash: rom.hash, system: rom.system, fileName: rom.fileName, size: rom.size });
            store.recordPlay(g.id, { system: g.system, title: g.title });
            toast(`Attached to ${g.title}`, "good");
            s.close();
            reload();
          },
        },
          h("div.li__main", {}, h("b", {}, g.title), h("span", {}, `${g.year} · ${g.genre}${g === guess ? " · matched by file name" : ""}`)),
          h("span.stat", {}, "attach")));
      mount(box.querySelector("#attach-list"), ...(rows.length ? rows : [h("div.li", {}, h("div.li__main", {}, h("b", {}, `Nothing indexed for ${sysName(rom.system)}`)))]) );
    })();
    return s;
  }

  /* --------------------------------------------------------------- bios */
  function biosSection(meta) {
    const need = SYSTEMS.filter((s) => s.bios);
    return h("section", {},
      sectionTitle("BIOS images", h("span.small.muted", {}, `${need.length} systems ask for one`)),
      h("p.small.muted", {}, "Some cores refuse to boot without firmware you must provide yourself - we cannot ship it. Add it here and RetroDeck hands it to the core on launch."),
      h("div.rows", {}, ...need.map((s) => {
        const rec = meta[s.id];
        return h("div.row", {},
          h("span.row__label", {}, s.name, h("small.muted", {}, s.bios.label || "firmware")),
          rec ? h("b.mono.small", {}, `${rec.name} · ${fmtBytes(rec.size)}`) : h("span.small", { style: { color: "var(--warn)" } }, "not added"),
          h("div", { style: { display: "flex", gap: "6px" } },
            h("button.btn.btn--sm", { onclick: () => biosSheet(s.id, reload) }, rec ? "Replace" : "Add"),
            rec ? h("button.btn.btn--sm.btn--ghost", {
              onclick: async () => { await vault.dropBios(s.id); store.set(`bios.${s.id}`, null); toast("BIOS removed", "good"); reload(); },
            }, "✕") : null));
      })));
  }

  /* -------------------------------------------------------------- saves */
  function savesSection() {
    // vault.list() guarantees `at`, even for records from older builds
    const states = state.states.slice().sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, 40);
    const rows = [];
    for (const st of states) {
      // resume straight from a state: the player takes the slot in the query
      const hash = store.gameConfig(st.gameId).romHash;
      const ref = String(st.gameId).startsWith("builtin:") ? st.gameId : hash ? `rom:${hash}?game=${encodeURIComponent(st.gameId)}&slot=${st.slot}` : null;
      rows.push(h("div.li", {},
        h("div.li__main", {},
          h("b", {}, `${st.title || st.gameId} · slot ${st.slot}`),
          h("span", {}, `${fmtDate(st.at)} · ${fmtBytes(st.bytes?.length || 0)}`)),
        h("div", { style: { display: "flex", gap: "6px" } },
          ref ? h("button.btn.btn--sm.btn--primary", { onclick: () => (location.hash = `#/play/${ref}`) }, "Resume") : null,
          h("button.btn.btn--sm.btn--ghost", {
            onclick: () => download(`${(st.title || st.gameId).replace(/[^\w.-]+/g, "_")}.state`, new Blob([st.bytes])),
          }, "Save"),
          h("button.btn.btn--sm.btn--danger", {
            onclick: async () => { await vault.deleteState(st.gameId, st.slot); toast("State deleted", "good"); reload(); },
          }, "✕"))));
    }
    for (const sv of state.sram.slice(0, 40)) {
      rows.push(h("div.li", {},
        h("div.li__main", {},
          h("b", {}, `Battery save · ${sv.name || sv.gameId}`),
          h("span", {}, `${fmtDate(sv.at)} · ${fmtBytes(sv.bytes?.length || 0)}`)),
        h("div", { style: { display: "flex", gap: "6px" } },
          h("button.btn.btn--sm.btn--ghost", {
            onclick: () => download(`${(sv.name || sv.gameId).replace(/[^\w.-]+/g, "_")}.sav`, new Blob([sv.bytes])),
          }, "Save"),
          h("button.btn.btn--sm.btn--danger", {
            onclick: async () => { await vault.deleteSram(sv.gameId); toast("Battery save deleted", "good"); reload(); },
          }, "✕"))));
    }
    return h("section", {},
      sectionTitle("Save states & battery saves", h("span.small.mono.muted", {}, `${state.states.length} + ${state.sram.length}`)),
      rows.length ? h("div.list", {}, ...rows) : h("div.notice", {}, h("span", {}, "No saved snapshots yet. The player toolbar writes them (10 slots), and battery saves are picked up automatically from the core.")));
  }

  function dangerSection() {
    return h("section", {},
      sectionTitle("Danger zone"),
      h("div.rows", {},
        h("div.row", {},
          h("span.row__label", {}, "Re-index every cartridge", h("small.muted", {}, "re-reads headers; useful after a system list changes")),
          h("button.btn.btn--sm", { onclick: reindex }, "Re-index")),
        h("div.row", {},
          h("span.row__label", {}, "Delete all save states"),
          h("button.btn.btn--sm.btn--danger", { onclick: () => wipe("states", state.states.length) }, "Delete")),
        h("div.row", {},
          h("span.row__label", {}, "Delete everything RetroDeck stored"),
          h("button.btn.btn--sm.btn--danger", { onclick: wipeAll }, "Wipe device data"))));
  }

  async function reindex() {
    let n = 0;
    for (const r of state.roms) {
      const rec = await vault.romFor(r.hash);
      if (!rec?.bytes) continue;
      const sniff = sniffRom(rec.bytes, rec.fileName || r.fileName || "");
      await vault.set("roms", { ...r, detected: sniff.system || null, titleFromHeader: sniff.title || null, note: sniff.note || "" });
      n++;
    }
    toast(`Re-read ${n} file${n === 1 ? "" : "s"}`, "good");
    reload();
  }

  async function wipe(which, count) {
    if (!count) return toast("Nothing to delete", "info");
    const ok = await confirmSheet(`Delete ${count} save state(s)?`, "You cannot undo this.", "Delete");
    if (!ok) return;
    for (const st of state.states) await vault.deleteState(st.gameId, st.slot);
    toast("Done", "good");
    reload();
  }

  async function wipeAll() {
    const ok = await confirmSheet("Wipe the vault?", "Cartridges, BIOS images, save states and battery saves leave this browser. Your settings survive.", "Wipe everything");
    if (!ok) return;
    await Promise.all(["roms", "bios", "states", "sram"].map((s) => vault.clear(s)));
    toast("Vault emptied", "good");
    reload();
  }

  function importFlow() {
    const box = h("div", { style: { display: "grid", gap: "10px" } },
      h("div.drop", {
        ondragover: (e) => { e.preventDefault(); e.currentTarget.classList.add("is-over"); },
        ondragleave: (e) => e.currentTarget.classList.remove("is-over"),
        ondrop: (e) => { e.preventDefault(); e.currentTarget.classList.remove("is-over"); take([...(e.dataTransfer?.files || [])]); },
      },
        h("b", {}, "Drop cartridge images here"),
        h("span.small", {}, "or"),
        h("button.btn.btn--sm", { onclick: async () => take(await pickFiles({ accept: acceptFor(null), multiple: true })) }, "Browse files")),
      h("p.small.muted", {}, "Each file is read in the browser, hashed, and its header is used to work out the console. Files are never uploaded anywhere."),
      h("div#vault-result", { style: { display: "grid", gap: "6px" } }));
    const s2 = sheet("Add cartridges", box, { wide: true, onClose: reload });

    async function take(files) {
      const out = box.querySelector("#vault-result");
      if (!files.length) return;
      mount(out, ...files.map((f) => h("div.li", {}, h("div.li__main", {}, h("b", {}, f.name), h("span", {}, "reading…")))));
      const rows = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        try {
          const bytes = new Uint8Array(await f.arrayBuffer());
          const sniff = sniffRom(bytes, f.name);
          const hash = await hashRom(bytes);
          const dup = await vault.get("roms", hash);
          if (dup) {
            rows.push({ file: f.name, ok: true, note: `already in the vault as ${sysName(dup.system)}`, system: dup.system, dup: true });
            continue;
          }
          const rec = await vault.addRom(f, {});
          rows.push({ file: f.name, ok: true, system: rec.system, note: rec.note || sniff.note || "", hash: rec.hash });
        } catch (err) {
          rows.push({ file: f.name, ok: false, note: String(err?.message || err) });
        }
        mount(out, ...rows.map((r) => h("div.li", {},
          h("span.dot" + (r.ok ? ".dot--good" : ".dot--bad"), {}),
          h("div.li__main", {}, h("b", {}, r.file), h("span", {}, `${r.system ? sysName(r.system) + " · " : ""}${r.note}`)))));
      }
      const added = rows.filter((r) => r.ok && !r.dup).length;
      rows.push({ summary: `${added} added · ${rows.filter((r) => r.dup).length} duplicates · ${rows.filter((r) => !r.ok).length} unreadable` });
      mount(out,
        ...rows.filter((r) => r.summary).map((r) => h("div.notice", {}, h("b", {}, r.summary))),
        ...rows.filter((r) => !r.summary).map((r) => h("div.li", {},
          h("span.dot" + (r.ok ? ".dot--good" : ".dot--bad"), {}),
          h("div.li__main", {}, h("b", {}, r.file), h("span", {}, `${r.system ? sysName(r.system) + " · " : ""}${r.note || ""}`)))));
      reload();
      void s2;
    }
  }
}

/** BIOS picker, also reachable from a deck's config panel. */
export function biosSheet(sysId, onDone) {
  const sys = SYSTEM_BY_ID[sysId];
  const box = h("div", { style: { display: "grid", gap: "10px" } },
    h("p.sheet__p", {}, sys?.bios?.label || "Firmware image for this console."),
    h("div.notice.notice--warn", {},
      h("b", {}, "Your file, your copy."),
      h("span", {}, "BIOS firmware is still copyrighted. RetroDeck does not ship it and does not link to it; dump it from hardware you own or skip it if the core can boot without one.")),
    h("div#bios-state.rows", {}),
    h("button.btn.btn--primary", {
      onclick: async () => {
        const files = await pickFiles({ accept: ".bin,.rom,.img,.zip" });
        if (!files.length) return;
        const rec = await vault.setBios(sysId, files[0]);
        store.set(`bios.${sysId}`, { name: rec.name, size: rec.size, added: rec.added });
        toast(`${sys?.name || sysId} BIOS stored`, "good");
        draw();
        onDone?.();
      },
    }, "Choose BIOS file"));
  const s = sheet(`${sys?.name || sysId} BIOS`, box, { onClose: () => onDone?.() });
  draw();

  async function draw() {
    const rec = await vault.get("bios", sysId);
    mount(box.querySelector("#bios-state"), h("div.row", {},
      h("span.row__label", {}, "Stored", h("small.muted", {}, "in IndexedDB on this device")),
      rec ? h("b.mono.small", {}, `${rec.name || rec.fileName || "bios"} · ${fmtBytes(rec.size || 0)}`) : h("span.small", {}, "none yet")),
      ...(rec ? [h("div.row", {},
        h("span.row__label", {}, "Remove"),
        h("button.btn.btn--sm.btn--danger", {
          onclick: async () => {
            await vault.dropBios(sysId);
            store.set(`bios.${sysId}`, null);
            toast("BIOS removed", "good");
            draw();
            onDone?.();
          },
        }, "Remove"))] : []));
    void s;
  }
}
