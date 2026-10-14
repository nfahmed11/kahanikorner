#!/usr/bin/env node
/*
 * Clean-URL route test for Firebase Hosting (cleanUrls + directory-index redirects).
 *
 * Usage:
 *   firebase emulators:start --only hosting        # in one terminal
 *   node tools/test-clean-urls.mjs [baseUrl] [--report out.md]
 *
 * baseUrl defaults to http://127.0.0.1:5002. Works against a preview channel URL too.
 *
 * For every deployed .html file it checks:
 *   - the clean URL returns 200 with that file's content (no redirect)
 *   - the legacy .html URL 301s straight to the clean URL, keeping the query string
 *   - directory index pages: /dir and /dir/index.html both 301 to /dir/
 *   - every local href/src in the page resolves (from the clean URL) to a 200 with no redirect
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2);
const reportIdx = args.indexOf("--report");
const reportPath = reportIdx >= 0 ? args[reportIdx + 1] : null;
const BASE = (args.find((a, i) => !a.startsWith("--") && i !== reportIdx + 1) || "http://127.0.0.1:5002").replace(/\/$/, "");

// Mirrors hosting.ignore in firebase.json
const SKIP = new Set(["functions", "tools", "node_modules"]);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name.startsWith(".") || SKIP.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith(".html")) out.push("/" + relative(ROOT, p));
  }
  return out.sort();
}

function cleanUrlFor(file) {
  if (file === "/index.html") return "/";
  if (file.endsWith("/index.html")) return file.slice(0, -"index.html".length);
  return file.slice(0, -".html".length);
}

async function get(path) {
  const res = await fetch(BASE + path, { redirect: "manual" });
  const body = res.status === 200 ? await res.text() : (await res.arrayBuffer(), "");
  const loc = res.headers.get("location");
  return { status: res.status, location: loc ? new URL(loc, BASE + path).href.replace(BASE, "") : null, body };
}

const results = [];
const linkProblems = [];
const checkedRefs = new Map();

function record(file, check, ok, detail) {
  results.push({ file, check, ok, detail });
}

async function checkRef(url) {
  if (!checkedRefs.has(url)) checkedRefs.set(url, get(url).then((r) => r));
  return checkedRefs.get(url);
}

const REF_RE = /\b(?:href|src)\s*[=:]\s*["']([^"'`]+)["']/g;

function localRefs(html, pageUrl) {
  const refs = new Set();
  for (const m of html.matchAll(REF_RE)) {
    const raw = m[1].trim();
    if (!raw || raw.startsWith("#") || raw.includes("${") || /^(?:[a-z]+:|\/\/)/i.test(raw)) continue;
    const u = new URL(raw, BASE + pageUrl);
    if (u.origin !== BASE) continue;
    refs.add(u.pathname);
  }
  return [...refs];
}

const files = walk(ROOT);
const QS = "?kk_test=1&issue=1026otc";

for (const file of files) {
  const clean = cleanUrlFor(file);
  const expected = readFileSync(join(ROOT, file), "utf8");

  const c = await get(clean);
  record(file, "clean 200", c.status === 200 && c.body === expected, `${clean} → ${c.status}${c.location ? " " + c.location : ""}`);

  const legacy = await get(file + QS);
  const wantLoc = clean + QS;
  record(file, "legacy 301", legacy.status === 301 && legacy.location === wantLoc, `${file}${QS} → ${legacy.status} ${legacy.location ?? ""}`);

  if (legacy.location) {
    const hop2 = await get(legacy.location);
    record(file, "single hop", hop2.status === 200, `${legacy.location} → ${hop2.status}`);
  }

  if (clean.endsWith("/") && clean !== "/") {
    const bare = await get(clean.slice(0, -1) + "?q=1");
    record(file, "bare dir 301", bare.status === 301 && bare.location === clean + "?q=1", `${clean.slice(0, -1)}?q=1 → ${bare.status} ${bare.location ?? ""}`);
  }

  if (c.status === 200) {
    for (const ref of localRefs(c.body, clean)) {
      const r = await checkRef(ref);
      if (r.status !== 200) linkProblems.push({ file, ref, status: r.status, location: r.location });
    }
  }
}

const nf = await get("/this-page-does-not-exist-kk");
record("(none)", "404", nf.status === 404, `/this-page-does-not-exist-kk → ${nf.status}`);

const failed = results.filter((r) => !r.ok);
const lines = [];
lines.push(`# Clean URL route test — ${BASE}`, "");
lines.push(`HTML files: ${files.length} · checks: ${results.length} · failed: ${failed.length} · local refs checked: ${checkedRefs.size} · ref problems: ${linkProblems.length}`, "");
lines.push("| File | Clean URL | Check | Result | Detail |", "|---|---|---|---|---|");
for (const r of results) lines.push(`| ${r.file} | ${r.file === "(none)" ? "" : cleanUrlFor(r.file)} | ${r.check} | ${r.ok ? "PASS" : "**FAIL**"} | ${r.detail} |`);
lines.push("", "## Local href/src that did not return 200", "");
if (!linkProblems.length) lines.push("None.");
else {
  lines.push("| Page | Reference | Status | Location |", "|---|---|---|---|");
  for (const p of linkProblems) lines.push(`| ${p.file} | ${p.ref} | ${p.status} | ${p.location ?? ""} |`);
}
const md = lines.join("\n") + "\n";
if (reportPath) writeFileSync(reportPath, md);

console.log(`HTML files: ${files.length}  checks: ${results.length}  failed: ${failed.length}  refs: ${checkedRefs.size}  ref problems: ${linkProblems.length}`);
for (const r of failed) console.log(`FAIL ${r.check.padEnd(12)} ${r.detail}`);
for (const p of linkProblems) console.log(`REF  ${p.status} ${p.file} → ${p.ref}${p.location ? " → " + p.location : ""}`);
process.exit(failed.length ? 1 : 0);
