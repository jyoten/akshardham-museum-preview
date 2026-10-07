// Builds the preview of a proposed change (an editor's pull request) into <site>/previews/pr-<n>/.
//
//   node scripts/build-preview.mjs --pr 12 --ref <commit> [--site _site] [--base HEAD]
//
// Safe by design: the preview is built with this checkout's own code (the main branch). Only the change's
// content and images (src/content, src/images) are taken from the pull request, and they are checked first;
// no code from the pull request runs.
//
// Small by design: the folder holds only the pages that look different (in each language that changed) and any
// new or changed images. CSS, scripts, fonts and other images come from the main site; links to pages that
// didn't change go to the live site. Every preview page says "Preview of change #N, not live" and is noindex.
// It also writes manifest.json (what changed, for the pull-request comment) and keeps the full build in
// .previews/pr-<n>/ for screenshots.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const arg = (name, dflt) => { const i = process.argv.indexOf("--" + name); return i > 0 ? process.argv[i + 1] : dflt; };
const PR = arg("pr");
const REF = arg("ref");
const BASE = arg("base", "HEAD");
const SITE = path.resolve(arg("site", "_site"));
const PREFIX = (process.env.SITE_PREFIX || "").replace(/\/$/, "");
if (!/^\d+$/.test(PR || "") || !REF) { console.error("usage: node scripts/build-preview.mjs --pr <number> --ref <commit> [--site _site]"); process.exit(1); }

const ROOT = process.cwd();
const git = (args, cwd = ROOT) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
const DATA = ["src/content", "src/images"];
const work = fs.mkdtempSync(path.join(os.tmpdir(), `preview-pr-${PR}-`));
const keep = path.join(ROOT, ".previews", `pr-${PR}`);
const outDir = path.join(SITE, "previews", `pr-${PR}`);

try {
  // 1. This checkout's code, with the change's content and images.
  git(["worktree", "add", "--detach", work, BASE]);
  fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(work, "node_modules"), "dir");
  git(["checkout", REF, "--", ...DATA], work);
  for (const f of git(["diff", "--name-only", "--diff-filter=D", BASE, REF, "--", ...DATA]).split("\n").filter(Boolean)) fs.rmSync(path.join(work, f), { force: true });

  // 2. Check it like any other change; a change that fails the check gets no preview.
  const manifest = { pr: +PR, ref: REF, prefix: PREFIX, pages: [], images: [] };
  try {
    execFileSync("node", ["scripts/check-content.js"], { cwd: work, encoding: "utf8", stdio: "pipe" });
  } catch (e) {
    manifest.error = "The content check failed, so there is no preview yet.\n" + String(e.stdout || "") + String(e.stderr || "");
  }
  if (manifest.error) finish(manifest);
  else build(manifest);
} finally {
  try { git(["worktree", "remove", "--force", work]); } catch {}
}

function build(manifest) {

  // 3. Build it like the review site, with the preview note.
  const built = path.join(work, "_site");
  execFileSync("npx", ["@11ty/eleventy", "--quiet", `--output=${built}`], { cwd: work, stdio: "inherit", env: { ...process.env, SITE_PREFIX: PREFIX, SITE_REVIEW: "1", SITE_PREVIEW_PR: PR } });

  // 4. Which pages look different from the main site (ignoring the note at the top).
  const banner = /<div class="notice notice-info review-note"[\s\S]*?<\/div><\/div>/;
  const norm = (s) => s.replace(banner, "").replace(/\s+/g, " ");
  const pages = [];
  const walk = (d, rel = "") => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f), r = rel ? `${rel}/${f}` : f; if (fs.statSync(p).isDirectory()) { if (!["admin", "previews"].includes(r)) walk(p, r); } else if (f.endsWith(".html")) pages.push(r); } };
  walk(built);
  const names = Object.fromEntries(fs.readdirSync(path.join(work, "src/content/pages")).map((f) => { const p = JSON.parse(fs.readFileSync(path.join(work, "src/content/pages", f), "utf8")); return [p.path, p.name]; }));
  for (const rel of pages) {
    const main = path.join(SITE, rel);
    if (fs.existsSync(main) && norm(fs.readFileSync(main, "utf8")) === norm(fs.readFileSync(path.join(built, rel), "utf8"))) continue;
    const m = /^(gu|hi)\//.exec(rel), lang = m ? m[1] : "en";
    const p = "/" + rel.replace(/^(gu|hi)\//, "").replace(/index\.html$/, "");
    manifest.pages.push({ file: rel, lang, path: p, name: names[p] || p });
  }

  // 5. New or changed images, and the preview folder: only those pages and images.
  manifest.images = git(["diff", "--name-only", "--diff-filter=AM", BASE, REF, "--", "src/images"]).split("\n").filter(Boolean).map((f) => f.replace(/^src\//, ""));
  fs.rmSync(outDir, { recursive: true, force: true });
  const here = `${PREFIX}/previews/pr-${PR}`;
  const pageUrl = (rel) => "/" + rel.replace(/index\.html$/, "");
  for (const img of manifest.images) {
    fs.mkdirSync(path.dirname(path.join(outDir, img)), { recursive: true });
    fs.copyFileSync(path.join(built, img), path.join(outDir, img));
  }
  // Links between previewed pages stay in the preview; everything else goes to the main site.
  const previewed = new Map(manifest.pages.map((p) => [(PREFIX + pageUrl(p.file)).replace(/\/$/, ""), here + pageUrl(p.file)]));
  const relink = (html) => html.replace(/href="([^"#]*)(#[^"]*)?"/g, (m, url, hash) => {
    const to = previewed.get(url.replace(/\/$/, ""));
    return to ? `href="${to}${hash || ""}"` : m;
  });
  for (const pg of manifest.pages) {
    let html = relink(fs.readFileSync(path.join(built, pg.file), "utf8"));
    for (const img of manifest.images) html = html.split(`"${PREFIX}/${img}"`).join(`"${here}/${img}"`);
    fs.mkdirSync(path.dirname(path.join(outDir, pg.file)), { recursive: true });
    fs.writeFileSync(path.join(outDir, pg.file), html);
    pg.url = here + pageUrl(pg.file);
  }
  finish(manifest, built);
}

function finish(manifest, built) {
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  const items = manifest.pages.map((p) => `<li><a href="${p.url}">${p.name}</a> (${p.lang})</li>`).join("");
  fs.writeFileSync(path.join(outDir, "changes.html"), `<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex, nofollow"><title>Preview of change #${manifest.pr}</title><h1>Preview of change #${manifest.pr}, not live</h1>${manifest.error ? `<pre>${manifest.error.replace(/</g, "&lt;")}</pre>` : `<ul>${items || "<li>No page looks different.</li>"}</ul>`}`);
  // The full build, kept outside the site for the before/after screenshots.
  fs.rmSync(keep, { recursive: true, force: true });
  fs.mkdirSync(keep, { recursive: true });
  if (built) fs.cpSync(built, path.join(keep, "site"), { recursive: true });
  fs.writeFileSync(path.join(keep, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(`preview of #${manifest.pr}: ${manifest.error ? "check failed" : `${manifest.pages.length} page(s), ${manifest.images.length} image(s)`} -> ${path.relative(ROOT, outDir)}`);
}
