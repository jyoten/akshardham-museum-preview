// One-off (kept for reference): takes the HTML out of the content files so editors only see text.
//   - <mark class="todo">[…]</mark> -> [ … ] (highlighted at build time instead, see lib/text.js)
//   - &amp; -> &
//   - in descriptions: <p> paragraphs, <br> and links -> Markdown
// node scripts/convert-text-to-markdown.mjs
import fs from "node:fs";
import path from "node:path";

const T = "src/content/topics";
const problems = [];
const common = (s) => s.replace(/<mark class="todo">([^<]*)<\/mark>/g, "$1").replace(/&amp;/g, "&");
function plain(s, where) {
  const out = common(s);
  if (/<[a-z/]/i.test(out)) problems.push(`${where}: ${out}`);
  return out;
}
function rich(s, where) {
  let out = common(s)
    .replace(/<a href="#" class="todo-link" data-todo="([^"]*)">([^<]*)<\/a>/g, (m, note, text) => `[${text}](todo:${encodeURIComponent(note).replace(/%28/g, "(").replace(/%29/g, ")")})`)
    .replace(/<a href="([^"]*)"(?: style="[^"]*")?>([^<]*)<\/a>/g, "[$2]($1)")
    .replace(/<br>/g, "\\\n");
  if (/^<p>/.test(out)) out = out.replace(/<\/p>\n?<p>/g, "\n\n").replace(/^<p>|<\/p>$/g, "");
  if (/<[a-z/]/i.test(out)) problems.push(`${where}: ${out}`);
  return out;
}
function walk(t, where) {
  for (const f of ["title", "subheading"]) if (typeof t[f] === "string") t[f] = plain(t[f], `${where}.${f}`);
  if (typeof t.description === "string") t.description = rich(t.description, `${where}.description`);
  for (const m of t.media || []) { if (typeof m.alt === "string") m.alt = plain(m.alt, where + ".alt"); if (typeof m.caption === "string") m.caption = plain(m.caption, where + ".caption"); }
  if (t.action && typeof t.action.label === "string") t.action.label = plain(t.action.label, where + ".label");
  for (const c of t.topics || []) walk(c, `${where}/${c.id}`);
}
for (const d of fs.readdirSync(T)) for (const f of fs.readdirSync(path.join(T, d))) {
  const file = path.join(T, d, f), j = JSON.parse(fs.readFileSync(file, "utf8"));
  for (const l of Object.keys(j)) walk(j[l], `${d}/${f} (${l})`);
  fs.writeFileSync(file, JSON.stringify(j, null, 2) + "\n");
}
const lf = "src/content/strings/labels.json", labels = JSON.parse(fs.readFileSync(lf, "utf8"));
for (const l of Object.keys(labels)) for (const k of Object.keys(labels[l])) labels[l][k] = plain(labels[l][k], `labels ${k} (${l})`);
fs.writeFileSync(lf, JSON.stringify(labels, null, 2) + "\n");
if (problems.length) { console.error("Still HTML in:\n" + problems.join("\n")); process.exit(1); }
console.log("converted");
