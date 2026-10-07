// Before/after screenshots of every page a change affects, side by side, at desktop width.
//
//   node scripts/pr-screenshots.mjs --main _site --preview .previews/pr-12/site --manifest .previews/pr-12/manifest.json --out shots
//
// Both are full builds with the same SITE_PREFIX. Uses Playwright's Chromium (CHROME_PATH to use another Chrome).
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { chromium } from "playwright";

const arg = (name, dflt) => { const i = process.argv.indexOf("--" + name); return i > 0 ? process.argv[i + 1] : dflt; };
const manifest = JSON.parse(fs.readFileSync(arg("manifest"), "utf8"));
const OUT = arg("out", "shots");
const PREFIX = manifest.prefix || "";
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".avif": "image/avif", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".ico": "image/x-icon" };

function serve(dir) {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (PREFIX && p.startsWith(PREFIX)) p = p.slice(PREFIX.length) || "/";
    let file = path.join(dir, p);
    if (!file.startsWith(path.resolve(dir))) { res.writeHead(403).end(); return; }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
    if (!fs.existsSync(file)) { res.writeHead(404).end(); return; }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok(server)));
}

const [mainSrv, prevSrv] = await Promise.all([serve(path.resolve(arg("main"))), serve(path.resolve(arg("preview")))]);
const url = (srv, file) => `http://127.0.0.1:${srv.address().port}${PREFIX}/${file.replace(/index\.html$/, "")}`;
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: "reduce" });
const page = await ctx.newPage();
const shot = async (u) => {
  await page.goto(u, { waitUntil: "networkidle" });
  await page.addStyleTag({ content: ".consent{display:none!important}" });
  await page.evaluate(() => document.fonts.ready);
  return page.screenshot({ fullPage: true });
};
fs.mkdirSync(OUT, { recursive: true });
const LANG = { en: "English", gu: "Gujarati", hi: "Hindi" };
const done = [];
for (const p of manifest.pages) {
  const before = await shot(url(mainSrv, p.file));
  const after = await shot(url(prevSrv, p.file));
  const img = (b) => `data:image/png;base64,${b.toString("base64")}`;
  await page.setViewportSize({ width: 2600, height: 900 });
  await page.setContent(`<body style="margin:0;background:#E9E3DA;font:600 22px system-ui;display:flex;gap:40px;padding:20px">
    <figure style="margin:0"><figcaption style="padding:0 0 12px">Before (live)</figcaption><img src="${img(before)}" width="1280"></figure>
    <figure style="margin:0"><figcaption style="padding:0 0 12px">After (change #${manifest.pr})</figcaption><img src="${img(after)}" width="1280"></figure></body>`);
  await page.evaluate(() => Promise.all([...document.images].map((i) => i.decode())));
  const name = `${p.name} - ${LANG[p.lang]}`.replace(/[^\p{L}\p{N} &-]+/gu, "").replace(/\s+/g, " ").trim();
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  done.push(name);
}
await browser.close();
mainSrv.close(); prevSrv.close();
console.log(`${done.length} before/after screenshot(s) in ${OUT}/` + (done.length ? ": " + done.join(", ") : ""));
