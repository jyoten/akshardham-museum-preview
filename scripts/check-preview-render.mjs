// Checks that the editor's previews draw pages exactly as the build does: renders every page in every language
// from the precompiled templates (admin/preview-templates.js) and the published content (admin/site-data.json),
// the way src/admin/editor.js does, and compares the result with the built page.
//   npm run build && node scripts/check-preview-render.mjs [_site]
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import nunjucks from "nunjucks";
import * as text from "../lib/text.js";
import { createSite, LANGS } from "../lib/site.js";

const out = process.argv[2] || "_site";
const win = {};
vm.runInNewContext(fs.readFileSync(path.join(out, "admin/preview-templates.js"), "utf8"), { window: win });
const data = JSON.parse(fs.readFileSync(path.join(out, "admin/site-data.json"), "utf8"));
const site = createSite({ content: data, text });
const env = new nunjucks.Environment(new nunjucks.PrecompiledLoader(win.nunjucksPrecompiled), { autoescape: true });
for (const [name, fn] of Object.entries(site.filters)) env.addFilter(name, fn);

const norm = (s) => s.replace(/\s+/g, " ").replace(/> </g, "><").trim();
const START = `<div style="font-family:'Instrument Sans'`;
let ok = 0;
const bad = [];
for (const pg of data.pages) {
  for (const lang of LANGS) {
    const url = site.lurl(pg.path, lang);
    const file = path.join(out, url.endsWith(".html") ? url : url + "index.html");
    const built = fs.readFileSync(file, "utf8");
    const expected = built.slice(built.indexOf(START), built.indexOf("</footer>") + 9);
    const html = env.render("preview/page.njk", { pg, lang, path: pg.path, navKey: pg.nav, headerStyle: pg.headerStyle, site: { prefix: "", review: false }, languages: data.languages, langs: data.langs, preview: false });
    const got = html.slice(html.indexOf(START), html.indexOf("</footer>") + 9);
    if (norm(got) === norm(expected)) ok++; else bad.push(url);
  }
}
if (bad.length) { console.error("Preview differs from the built page:\n  " + bad.join("\n  ")); process.exit(1); }
console.log(`Editor previews match the build: ${ok} pages.`);
