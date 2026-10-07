// Writes the plain-language summary posted on an editor's pull request: which pages and languages change,
// the before/after of every changed field, links to the preview pages and to the screenshots.
//
//   node scripts/pr-summary.mjs --base origin/main --head <commit> [--manifest .previews/pr-12/manifest.json] [--out summary.md]
//
// Environment (all optional): SITE_ORIGIN (e.g. https://jyoten.github.io) to make preview links absolute;
// ARTIFACT_URL for the screenshots; PREVIEW_URL_TEMPLATE to link a host's own deploy previews instead,
// e.g. "https://pr-{pr}.museum.pages.dev{path}" ({pr}, {path}, {lang}, {sha} are filled in).
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { topicChanges, languagesOf } from "../src/admin/topic-diff.js";
import { usage } from "../lib/site.js";

const arg = (name, dflt) => { const i = process.argv.indexOf("--" + name); return i > 0 ? process.argv[i + 1] : dflt; };
const BASE = arg("base", "origin/main"), HEAD = arg("head", "HEAD");
const git = (args) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 1 << 26 });
const show = (ref, file) => { try { return JSON.parse(git(["show", `${ref}:${file}`])); } catch { return null; } };
const manifest = arg("manifest") && fs.existsSync(arg("manifest")) ? JSON.parse(fs.readFileSync(arg("manifest"), "utf8")) : null;

// Markdown-safe text from the site's content.
const md = (s) => String(s).replace(/([\\`*_~[\]<>|#])/g, "\\$1").replace(/\n/g, " ");

const changed = git(["diff", "--name-only", BASE, HEAD, "--", "src/content", "src/images"]).split("\n").filter(Boolean);
const pageFiles = git(["ls-tree", "--name-only", HEAD, "src/content/pages/"]).split("\n").filter((f) => f.endsWith(".json"));
const pages = pageFiles.map((f) => ({ id: f.split("/").pop().slice(0, -5), ...show(HEAD, f) }));
const topicRefs = git(["ls-tree", "-r", "--name-only", HEAD, "src/content/topics/"]).split("\n").filter(Boolean).map((f) => f.replace(/^src\/content\/topics\//, "").replace(/\.json$/, ""));
const used = usage(pages, topicRefs);
const byId = Object.fromEntries(pages.map((p) => [p.id, p]));
const pagesOf = (ref) => (used[ref] || []).map((id) => byId[id].name);
const shortPages = (names) => (names.length === pages.length ? "every page" : names.join(", "));

const sections = [], allChanges = [], allPages = new Set(), other = [];
for (const f of changed) {
  const m = /^src\/content\/topics\/(.+)\.json$/.exec(f);
  if (!m) { other.push(f.replace(/^src\//, "")); continue; }
  const ref = m[1];
  const before = show(BASE, f), after = show(HEAD, f);
  const changes = topicChanges(before, after);
  if (!changes.length) continue;
  allChanges.push(...changes);
  const names = pagesOf(ref);
  names.forEach((n) => allPages.add(n));
  const title = (after || before).en.title || ref;
  let out = `#### ${md(names.length ? shortPages(names) : "Not on a page")} · ${md(title)}\n`;
  if (!before) out += "_New topic._\n";
  if (!after) out += "_Topic removed._\n";
  for (const c of changes) {
    out += `\n**${md(c.label)}** · ${c.language}\n`;
    out += `- Before: ${c.before ? md(c.before) : "_(empty)_"}\n- After: ${c.after ? md(c.after) : "_(empty)_"}\n`;
    const marked = c.parts.map((p, i) => {
      if (p.type === "same") return md(p.text);
      const t = md(p.text).trim(), lead = /^\s/.test(p.text) ? " " : "", trail = /\s$/.test(p.text) ? " " : "";
      const sep = p.type === "add" && c.parts[i - 1] && c.parts[i - 1].type === "del" ? " " : "";
      return t ? sep + lead + (p.type === "del" ? `~~${t}~~` : `**${t}**`) + trail : p.text;
    });
    out += `- Changed: ${marked.join("").replace(/ {2,}/g, " ").trim()}\n`;
  }
  sections.push(out);
}

let body = "<!-- museum-editor-summary -->\n### What this change does\n\n";
if (!sections.length && !other.length) body += "No changes to the website's text.\n";
else {
  if (allPages.size) body += `**Pages:** ${md([...allPages].length === pages.length ? "every page" : [...allPages].join(", "))}  \n`;
  if (allChanges.length) body += `**Languages:** ${languagesOf(allChanges)}  \n`;
  const origin = (process.env.SITE_ORIGIN || "").replace(/\/$/, "");
  const tpl = process.env.PREVIEW_URL_TEMPLATE;
  if (manifest && manifest.error) body += `\n**Preview:** ${md(manifest.error.split("\n")[0])}\n`;
  else if (manifest && manifest.pages.length) {
    const lang = { en: "English", gu: "Gujarati", hi: "Hindi" };
    const link = (p) => (tpl ? tpl.replace("{pr}", manifest.pr).replace("{path}", (p.lang === "en" ? "" : "/" + p.lang) + p.path).replace("{lang}", p.lang).replace("{sha}", manifest.ref) : origin + p.url);
    const order = { en: 0, gu: 1, hi: 2 };
    const sorted = [...manifest.pages].sort((a, b) => a.name.localeCompare(b.name) || order[a.lang] - order[b.lang]);
    body += `\n**Preview (not live):** ${sorted.map((p) => `[${md(p.name)} (${lang[p.lang]})](${link(p)})`).join(" · ")}\n`;
  }
  if (process.env.ARTIFACT_URL) body += `**Screenshots, before and after:** [download](${process.env.ARTIFACT_URL})\n`;
  body += "\n" + sections.join("\n");
  if (other.length) body += `\n**Also changed:** ${other.map((f) => "`" + f + "`").join(", ")}\n`;
}
body += "\n<sub>Written automatically from the changed files. Struck-through words are removed, bold words are added.</sub>\n";
if (arg("out")) fs.writeFileSync(arg("out"), body); else process.stdout.write(body);
