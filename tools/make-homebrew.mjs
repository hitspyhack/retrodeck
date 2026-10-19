/**
 * Creates the `homebrew/<system>/` drop folders the build indexes.
 *
 * Each folder gets a README written from the same data the app uses - the
 * extensions that deck accepts, the core that runs it, the controller layout it
 * gets - so the instructions can never drift from the code. Re-run after adding
 * a system to `js/data/systems.js`.
 *
 *   node tools/make-homebrew.mjs [--force]
 */
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(import.meta.url), "../..");
const FORCE = process.argv.includes("--force");

const { SYSTEMS } = await import("../js/data/systems.js");
const { PADS } = await import("../js/data/layouts.js");
const { defaultModelFor, modelsFor } = await import("../js/data/models.js");
const { SKINS } = await import("../js/data/skins.js");
const { romWord } = await import("../js/views/parts.js").catch(() => ({ romWord: () => "cartridge" }));

/** the Core row: what the deck boots by default, plus the alternatives */
const coreRow = (sys) => {
  const alt = (sys.cores || []).map((c) => c.id).filter((id) => id !== sys.ejsCore);
  const head =
    sys.ejsCore === "auto"
      ? "`auto` - chosen from the file's extension"
      : `\`${sys.ejsCore || sys.cores?.[0]?.id || "built-in"}\``;
  return alt.length ? `${head}; also selectable: ${alt.map((c) => `\`${c}\``).join(", ")}` : head;
};

const word = (id) => {
  try {
    return romWord(id);
  } catch {
    return "cartridge";
  }
};

const dir = join(ROOT, "homebrew");
mkdirSync(dir, { recursive: true });

let written = 0;
const index = [];

for (const sys of SYSTEMS) {
  const out = join(dir, sys.id);
  mkdirSync(out, { recursive: true });
  const file = join(out, "README.md");
  index.push({ id: sys.id, name: sys.name, exts: sys.exts || [] });
  if (existsSync(file) && !FORCE) continue;

  const models = modelsFor(sys.id);
  const dm = defaultModelFor(sys.id);
  const pad = PADS[sys.pad];
  const skins = (dm?.skins || []).filter((s) => SKINS[s]).slice(0, 6);
  const body = `# Homebrew for ${sys.name}

Put **${sys.name}** (\`${sys.id}\`) ROMs you are allowed to redistribute in this
folder, then run:

\`\`\`sh
npm run build
\`\`\`

The build walks \`homebrew/\`, reads the file names, and adds each image to
\`data/games.json\` as \`source: "bundled"\`. It then shows up in the library, on
the home shelf, and in the **${sys.name}** deck as "ready to play" - no import
dialog, no vault step, because the file is served from this origin.

## What the deck will do with it

| | |
| --- | --- |
| Media | ${word(sys.id)} - accepted extensions: ${(sys.exts || []).map((e) => `\`.${e}\``).join(", ") || "any"} |
| Core | ${coreRow(sys)} |
| Buttons | ${pad ? `${pad.name}${pad.aka ? ` (${pad.aka})` : ""}` : sys.pad} - ${sys.buttons.length} inputs |
| Other layouts | ${(sys.pads || []).filter((p) => p !== sys.pad).map((p) => PADS[p]?.name || p).join(", ") || "none"} |
| Aspect | ${sys.ar ? `${sys.ar[0]}:${sys.ar[1]}` : "auto"}${sys.res ? ` - native ${sys.res[0]}x${sys.res[1]}` : ""} |
| Models | ${models.map((m) => m.name).join(", ") || "generic"} |
| Skins | ${skins.map((s) => SKINS[s].name).join(", ") || "default"} |
${sys.bios ? `| BIOS | ${sys.bios.label} - add it in **Cartridges ▸ BIOS images** or it will not boot |\n` : ""}${sys.features?.solar ? "| Sensor | this deck has a solar cell - a few games read it |\n" : ""}${sys.features?.frontlight ? "| Light | the DMG Light model has a front light; RetroDeck only draws it as a glow |\n" : ""}
## Naming

Use a readable name and keep the region in parentheses - the importer guesses
the title from the file name when the header has nothing useful:

\`\`\`
${sys.id === "nes" ? "Micro Mages (USA).nes" : sys.id === "gb" ? "Polar Getaway (World).gb" : sys.id === "dos" ? "my-adventure.dosbox.conf" : `my-game (${sys.exts?.[0] === "cue" ? "World" : "USA"}).${(sys.exts || ["rom"])[0]}`}
\`\`\`

Zip and 7z are fine where the table above lists them; the core unpacks them.

## Please

Only add software you wrote, or that the author released for redistribution.
RetroDeck ships no commercial ROMs and this folder is not an exception to that -
\`npm run build\` will happily index whatever is in here, so keep it legal.
`;
  writeFileSync(file, body);
  written++;
}

const root = join(dir, "README.md");
writeFileSync(
  root,
  `# homebrew/

Drop-in ROM folders, one per system RetroDeck knows (${SYSTEMS.length} of them).

\`\`\`sh
homebrew/
  nes/      <- .nes, .unf, .fds, zip
  snes/     <- .sfc, .smc, ...
  gb/       <- ...
  ...
\`\`\`

\`npm run build\` indexes every image it finds here into \`data/games.json\` as
\`source: "bundled"\`. That is how a homebrew catalog ships *with* the site: the
files live on your server, the licence stays yours, and the app needs no import
step to play them.

Nothing in this repository is a ROM. Each sub-folder has a README listing the
extensions, the core, the controller layout and the models that console gets.

Legal line, unchanged from the front page: add only what you wrote or what the
author released for redistribution.
`,
);

console.log(`${written} README file(s) written, ${SYSTEMS.length} folders present (root README always refreshed; --force to rewrite)`);
