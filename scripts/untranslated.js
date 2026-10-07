// Lists the text that has no Gujarati or Hindi translation yet (those spots show English).
// npm run translations            (add --keys to list every untranslated field)
import fs from "node:fs";
import path from "node:path";

const CONTENT = "src/content";
const has = (s) => typeof s === "string" && s.trim() !== "";
const readJson = (f) => JSON.parse(fs.readFileSync(f, "utf8"));

// Every translatable field of a topic, as [path, English text, translated text].
function fields(en, v, at, out) {
  v = v || {};
  for (const f of ["title", "subheading", "description"]) if (has(en[f])) out.push([`${at}.${f}`, en[f], v[f]]);
  (en.media || []).forEach((m, i) => {
    const vm = (v.media && v.media[i]) || {};
    for (const f of ["alt", "caption"]) if (has(m[f])) out.push([`${at}.media[${i}].${f}`, m[f], vm[f]]);
  });
  if (en.action && has(en.action.label)) out.push([`${at}.action.label`, en.action.label, v.action && v.action.label]);
  for (const c of en.topics || []) fields(c, (v.topics || []).find((x) => x.id === c.id), `${at}/${c.id}`, out);
  return out;
}

const groups = {};
for (const d of fs.readdirSync(path.join(CONTENT, "topics"))) {
  const dir = path.join(CONTENT, "topics", d);
  if (!fs.statSync(dir).isDirectory()) continue;
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    const t = readJson(path.join(dir, f));
    for (const lang of ["gu", "hi"]) ((groups[lang] ||= {})[d] ||= []).push(...fields(t.en, t[lang], f.slice(0, -5), []));
  }
}
for (const file of ["labels", "ui"]) {
  const s = readJson(path.join(CONTENT, "strings", `${file}.json`));
  for (const lang of ["gu", "hi"]) ((groups[lang] ||= {})[`strings/${file}`] = Object.entries(s.en).map(([k, v]) => [k, v, s[lang] && s[lang][k]]));
}

for (const lang of ["gu", "hi"]) {
  let total = 0, missing = 0;
  const lines = [];
  for (const [d, list] of Object.entries(groups[lang])) {
    const gaps = list.filter(([, , tr]) => !has(tr));
    total += list.length; missing += gaps.length;
    if (gaps.length) lines.push(`  ${d.padEnd(32)} ${gaps.length}/${list.length} untranslated` + (process.argv.includes("--keys") ? `: ${gaps.map((g) => g[0]).join(", ")}` : ""));
  }
  console.log(`${lang}: ${total - missing} of ${total} strings translated`);
  lines.forEach((l) => console.log(l));
}
console.log("\nAdd --keys to list every untranslated field.");
