// Lists the text that has no Gujarati or Hindi translation yet (those spots show English).
// npm run translations
import fs from "node:fs";
import path from "node:path";
const read = (lang) => Object.fromEntries(fs.readdirSync(`src/content/${lang}`).map((f) => [f, JSON.parse(fs.readFileSync(path.join("src/content", lang, f), "utf8"))]));
const en = read("en");
for (const lang of ["gu", "hi"]) {
  const tr = read(lang);
  let total = 0, missing = 0;
  const byFile = [];
  for (const [file, strings] of Object.entries(en)) {
    const keys = Object.keys(strings).filter((k) => typeof strings[k] === "string");
    const gaps = keys.filter((k) => !(tr[file] && typeof tr[file][k] === "string" && tr[file][k].trim()));
    total += keys.length; missing += gaps.length;
    if (gaps.length) byFile.push(`  ${file.padEnd(18)} ${gaps.length}/${keys.length} untranslated` + (process.argv.includes("--keys") ? `: ${gaps.join(", ")}` : ""));
  }
  console.log(`${lang}: ${total - missing} of ${total} strings translated`);
  byFile.forEach((l) => console.log(l));
}
console.log("\nAdd --keys to list every untranslated key.");
