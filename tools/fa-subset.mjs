#!/usr/bin/env node
/*
 * Kahani Korner — build a self-hosted Font Awesome subset.
 *
 *   node tools/fa-subset.mjs           # scan the site, rebuild the subset
 *   node tools/fa-subset.mjs --check   # exit 1 if the subset is out of date
 *                                      # (run before deploying after adding icons)
 *
 * Scans every .html/.js/.css file in the site for Font Awesome classes
 * (fa-house, fa-solid, …) and for CSS `content: "\fxxx"` codes, then writes:
 *   assets/fonts/fa/fa-{solid-900,regular-400,brands-400,v4compatibility}.<hash>.woff2
 *   assets/css/fa-subset.css   (drop-in replacement for the CDN all.min.css)
 *
 * The fonts are cut from the exact Font Awesome Free 6.5.1 files the site
 * used from cdnjs (verified by SHA-256 below), so every glyph is identical.
 * The build fails if any icon the site uses is missing from the subset.
 *
 * Requires fonttools:  python3 -m venv ~/.fa-venv && ~/.fa-venv/bin/pip install fonttools brotli
 * then run with:       PYFTSUBSET=~/.fa-venv/bin/pyftsubset node tools/fa-subset.mjs
 *
 * Font Awesome Free: icons CC BY 4.0, fonts SIL OFL 1.1, code MIT —
 * https://fontawesome.com/license/free. The license header is kept in the CSS.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_FONTS = path.join(ROOT, "assets/fonts/fa");
const OUT_CSS = path.join(ROOT, "assets/css/fa-subset.css");
const CHECK = process.argv.includes("--check");

const CDN = "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1";
const SOURCES = {
  "css/all.min.css": "c22cfb6520a7fdbb738632834019acf47c78b1279462c0eb4cb83bae83ecb5a7",
  "webfonts/fa-solid-900.woff2": "9fc85f3a4544ab0d570c7f8f9bbb88db8d92c359b2707580ea8b07c75673eae2",
  "webfonts/fa-regular-400.woff2": "2bccecf0bc7e96cd5ce4003abeb3ae9ee4a3d19158c4e6edfd2df32d2f0d5721",
  "webfonts/fa-brands-400.woff2": "3a8924cd5203a28628716aedb5cef0943da4c3b44e3ffcee90ab06387b41c490",
  "webfonts/fa-v4compatibility.woff2": "4d4a2d7fd1c6684845cb174fdd7fc073bd64cb741286fb247f8b76c2b7b852c4",
};
const FONTS = ["fa-solid-900", "fa-regular-400", "fa-brands-400", "fa-v4compatibility"];

// Font Awesome library copies in assets/css/ — not site usage, never scanned.
const FA_LIBRARY_CSS = /^(all|fontawesome|brands|regular|solid|svg|svg-with-js|v4-font-face|v4-shims|v5-font-face|fa-subset)(\.min)?\.css$/;
const SKIP_DIRS = new Set(["node_modules", "functions", "tools"]);

const die = (msg) => { console.error(`error: ${msg}`); process.exit(1); };
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

if (!fs.existsSync(path.join(ROOT, "firebase.json"))) die(`not the site root: ${ROOT}`);

// ---- 1. Original Font Awesome files (cached, hash-verified) --------------
const cacheDir = path.join(os.tmpdir(), "kk-fontawesome-6.5.1");
fs.mkdirSync(cacheDir, { recursive: true });
async function source(rel) {
  const file = path.join(cacheDir, path.basename(rel));
  if (!fs.existsSync(file) || sha256(fs.readFileSync(file)) !== SOURCES[rel]) {
    const res = await fetch(`${CDN}/${rel}`);
    if (!res.ok) die(`download failed (${res.status}): ${CDN}/${rel}`);
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  const got = sha256(fs.readFileSync(file));
  if (got !== SOURCES[rel]) die(`${rel} does not match the pinned SHA-256 (got ${got}) — refusing to continue`);
  return file;
}
const cssSource = fs.readFileSync(await source("css/all.min.css"), "utf8");
const fontSource = {};
for (const f of FONTS) fontSource[f] = await source(`webfonts/${f}.woff2`);

// ---- 2. Split the library CSS into top-level blocks ----------------------
const header = cssSource.match(/^\/\*![\s\S]*?\*\//)[0];
const blocks = [];
{
  const body = cssSource.slice(header.length);
  let depth = 0, start = 0;
  for (let i = 0; i < body.length; i++) {
    if (body[i] === "{") depth++;
    else if (body[i] === "}" && --depth === 0) { blocks.push(body.slice(start, i + 1).trim()); start = i + 1; }
  }
  if (depth !== 0 || body.slice(start).trim()) die("could not parse all.min.css");
}

const ICON_RULE = /^([^{@]+)\{content:"\\([0-9a-f]+)"\}$/;
const ICON_SELECTOR = /^\.fa-([a-z0-9-]+):{1,2}before$/;
const iconCode = new Map(); // icon name -> codepoint
const knownClasses = new Set(); // every fa-* class the library defines
for (const block of blocks) {
  const m = block.match(ICON_RULE);
  const sels = m ? m[1].split(",") : [];
  if (m && sels.every((s) => ICON_SELECTOR.test(s))) {
    for (const s of sels) iconCode.set(s.match(ICON_SELECTOR)[1], parseInt(m[2], 16));
  }
  for (const c of block.matchAll(/\.(fa-[a-z0-9-]+)/g)) knownClasses.add(c[1]);
}
for (const s of ["fa", "fa-solid", "fa-regular", "fa-brands", "fa-classic", "fa-sharp"]) knownClasses.add(s);

// ---- 3. Scan the site ----------------------------------------------------
const usedIcons = new Map(); // name -> first file seen
const unknown = new Map();
const cssCodes = new Map(); // codepoint -> file
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(p); continue; }
    if (!/\.(html|js|css)$/.test(e.name)) continue;
    if (e.name.endsWith(".css") && FA_LIBRARY_CSS.test(e.name)) continue;
    const text = fs.readFileSync(p, "utf8");
    const rel = path.relative(ROOT, p);
    for (const m of text.matchAll(/(?<![\w-])fa-[a-z0-9]+(?:-[a-z0-9]+)*/g)) {
      const name = m[0].slice(3);
      if (iconCode.has(name)) { if (!usedIcons.has(name)) usedIcons.set(name, rel); }
      else if (!knownClasses.has(m[0]) && !unknown.has(m[0])) unknown.set(m[0], rel);
    }
    for (const m of text.matchAll(/content:\s*["']\\([0-9a-fA-F]{4,5})["']/g)) {
      const cp = parseInt(m[1], 16);
      if (cp >= 0xe000 && cp <= 0xf8ff && !cssCodes.has(cp)) cssCodes.set(cp, rel);
    }
  }
}
walk(ROOT);

const codepoints = new Set([...[...usedIcons.keys()].map((n) => iconCode.get(n)), ...cssCodes.keys()]);
if (!codepoints.size) die("no Font Awesome icons found — refusing to write an empty subset");

// ---- 4. Subset the fonts -------------------------------------------------
const pyftsubset = process.env.PYFTSUBSET || "pyftsubset";
const python = process.env.PYFTSUBSET ? path.join(path.dirname(process.env.PYFTSUBSET), "python3") : "python3";
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kk-fa-subset-"));
const unicodes = [...codepoints].sort((a, b) => a - b).map((c) => "U+" + c.toString(16)).join(",");
const outputs = {};
try {
  for (const f of FONTS) {
    const out = path.join(tmp, `${f}.woff2`);
    execFileSync(pyftsubset, [
      fontSource[f], `--unicodes=${unicodes}`, "--flavor=woff2", `--output-file=${out}`,
      "--layout-features=*", "--glyph-names", "--notdef-outline", "--name-IDs=*",
      "--name-languages=*", "--name-legacy", "--legacy-cmap", "--symbol-cmap",
    ], { stdio: ["ignore", "ignore", "inherit"] });
    outputs[f] = out;
  }
} catch (e) {
  die(`pyftsubset failed (${e.message.split("\n")[0]}). Is fonttools installed? See the header of this file.`);
}

// Every required codepoint must exist in at least one subset font.
const cmapDump = execFileSync(python, ["-c", `
import sys
from fontTools.ttLib import TTFont
for p in sys.argv[1:]:
    print(" ".join(hex(c) for c in TTFont(p).getBestCmap()))
`, ...FONTS.map((f) => outputs[f])], { encoding: "utf8" });
const present = new Set(cmapDump.split(/\s+/).filter(Boolean).map((h) => parseInt(h, 16)));
const missing = [...codepoints].filter((c) => !present.has(c));
if (missing.length) die(`subset is missing ${missing.map((c) => "U+" + c.toString(16)).join(", ")} — refusing to write`);

// ---- 5. Build the CSS ----------------------------------------------------
const fontFile = {};
for (const f of FONTS) {
  const buf = fs.readFileSync(outputs[f]);
  fontFile[f] = `${f}.${sha256(buf).slice(0, 8)}.woff2`;
}
const keptBlocks = blocks.filter((block) => {
  const m = block.match(ICON_RULE);
  if (!m || !m[1].split(",").every((s) => ICON_SELECTOR.test(s))) return true; // non-icon rule: keep
  return codepoints.has(parseInt(m[2], 16));
}).map((block) => block.startsWith("@font-face")
  ? block.replace(/src:[^;}]+/, (src) => {
      const f = FONTS.find((name) => src.includes(`${name}.woff2`));
      if (!f) die(`unexpected @font-face src: ${src}`);
      return `src:url(/assets/fonts/fa/${fontFile[f]}) format("woff2")`;
    })
  : block);
const css = `${header}
/* Self-hosted SUBSET generated by tools/fa-subset.mjs — do not edit by hand.
   ${usedIcons.size} icons + ${cssCodes.size} CSS content codes. Re-run the script after adding icons. */
${keptBlocks.join("\n")}
`;

// ---- 6. Write (or check) -------------------------------------------------
const stale = [];
for (const f of FONTS) {
  const dest = path.join(OUT_FONTS, fontFile[f]);
  if (!fs.existsSync(dest)) stale.push(path.relative(ROOT, dest));
}
const cssCurrent = fs.existsSync(OUT_CSS) ? fs.readFileSync(OUT_CSS, "utf8") : "";
if (cssCurrent !== css) stale.push(path.relative(ROOT, OUT_CSS));

console.log(`icons used: ${usedIcons.size}  |  CSS content codes: ${cssCodes.size}  |  glyphs: ${codepoints.size}`);
for (const f of FONTS) console.log(`  ${fontFile[f].padEnd(36)} ${fs.statSync(outputs[f]).size} B`);
if (unknown.size) {
  console.log(`note: ${unknown.size} fa-* names are not Font Awesome 6.5.1 classes (they render nothing today either):`);
  for (const [name, file] of unknown) console.log(`  ${name.padEnd(28)} first seen in ${file}`);
}

if (CHECK) {
  fs.rmSync(tmp, { recursive: true, force: true });
  if (stale.length) { console.log(`OUT OF DATE: ${stale.join(", ")} — run node tools/fa-subset.mjs`); process.exit(1); }
  console.log("subset is up to date");
  process.exit(0);
}

fs.mkdirSync(OUT_FONTS, { recursive: true });
for (const f of FONTS) {
  const dest = path.join(OUT_FONTS, fontFile[f]);
  if (!fs.existsSync(dest)) fs.copyFileSync(outputs[f], dest);
}
if (cssCurrent !== css) fs.writeFileSync(OUT_CSS, css);
fs.rmSync(tmp, { recursive: true, force: true });
console.log(stale.length ? `wrote: ${stale.join(", ")}` : "already up to date — nothing written");
const unusedFonts = fs.readdirSync(OUT_FONTS).filter((n) => !Object.values(fontFile).includes(n));
if (unusedFonts.length) console.log(`older subset files no longer referenced (safe to delete once deployed): ${unusedFonts.join(", ")}`);
