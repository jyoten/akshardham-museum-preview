// Checks the content files before they are merged: npm run check-content (also run on every pull request).
// - topics: valid, IDs unique, WebNext limits (sub heading 100, description 2000 characters)
// - text: no HTML in the files (editors write plain text and Markdown); the HTML it becomes
//   (lib/text.js) may only use simple formatting tags and safe links
// - pages: every component's style and topic exists
// - images: only JPEG/PNG/WebP/AVIF, at most 2 MB, all in src/images/
import fs from "node:fs";
import path from "node:path";
import { plainText, richText } from "../lib/text.js";

const CONTENT = "src/content";
const IMAGES = "src/images";
const LANGS = ["en", "gu", "hi"];
const MAX_IMAGE = 2 * 1024 * 1024;
const IMAGE_TYPES = { ".jpg": [0xff, 0xd8, 0xff], ".jpeg": [0xff, 0xd8, 0xff], ".png": [0x89, 0x50, 0x4e, 0x47], ".webp": null, ".avif": null };
const TAGS = new Set(["p", "a", "mark", "br", "strong", "em", "span"]);
const ATTRS = new Set(["href", "class", "style", "data-todo", "aria-hidden", "lang"]);
const LIMITS = { subheading: 100, description: 2000 };
const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const errors = [];
const err = (where, msg) => errors.push(`${where}: ${msg}`);
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch (e) { err(f, "not valid JSON (" + e.message + ")"); return null; } };

function checkHtml(where, s) {
  if (typeof s !== "string") return;
  for (const m of s.matchAll(/<\/?([a-zA-Z][a-zA-Z0-9-]*)([^>]*)>/g)) {
    const tag = m[1].toLowerCase();
    if (!TAGS.has(tag)) { err(where, `tag <${tag}> isn't allowed (allowed: ${[...TAGS].join(", ")})`); continue; }
    for (const a of m[2].matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*("[^"]*"|'[^']*'|[^\s>]+))?/g)) {
      const name = a[1].toLowerCase(), val = (a[2] || "").replace(/^["']|["']$/g, "");
      if (!ATTRS.has(name)) err(where, `attribute ${name}= isn't allowed on <${tag}>`);
      if (name === "href" && !/^(\/|#|https:\/\/|mailto:|tel:)/.test(val)) err(where, `link "${val}" must start with /, #, https://, mailto:, tel: or todo:`);
      if (name === "style" && /url\(|expression|@import/i.test(val)) err(where, "style can't load anything");
    }
  }
  if (/javascript:|<script|<iframe|\son[a-z]+\s*=/i.test(s)) err(where, "contains script");
}
// Stored text must not contain HTML; then check the HTML it is turned into.
function checkText(where, s, render) {
  if (typeof s !== "string") return;
  if (/<\/?[a-zA-Z!]/.test(s)) err(where, "contains HTML; use plain text (and the editor's bold, italic and link buttons in descriptions)");
  checkHtml(where, render(s));
}
function checkLink(where, link) {
  if (link === undefined || link === "") return;
  if (!/^(\/|#|https:\/\/|mailto:|tel:|todo:)/.test(link)) err(where, `link "${link}" must start with /, #, https://, mailto:, tel: or todo:`);
}
function checkMediaSrc(where, src) {
  if (!src) return;
  if (!src.startsWith("/images/")) return err(where, `image "${src}" must be an uploaded file under /images/`);
  if (!fs.existsSync(path.join(IMAGES, src.slice(8)))) err(where, `image "${src}" doesn't exist in ${IMAGES}/`);
}

function checkTopic(t, where, lang, isEn) {
  if (!t || typeof t !== "object") return err(where, "not a topic");
  if (isEn || t.id !== undefined) { if (!ID.test(t.id || "")) err(where, `id "${t.id}" must be lower-case words joined by hyphens`); }
  for (const f of ["title", "subheading", "description"]) {
    if (t[f] === undefined) continue;
    if (typeof t[f] !== "string") { err(where, `${f} must be text`); continue; }
    checkText(`${where}.${f} (${lang})`, t[f], f === "description" ? richText : plainText);
    if (LIMITS[f] && t[f].length > LIMITS[f]) err(where, `${f} (${lang}) is ${t[f].length} characters; at most ${LIMITS[f]}`);
  }
  (t.media || []).forEach((m, i) => {
    checkText(`${where}.media[${i}].alt (${lang})`, m.alt, plainText); checkText(`${where}.media[${i}].caption (${lang})`, m.caption, plainText);
    if (isEn) { checkMediaSrc(`${where}.media[${i}]`, m.src); if (m.type && !["image", "video"].includes(m.type)) err(where, `media type "${m.type}"`); }
  });
  if (t.action) { checkText(`${where}.action.label (${lang})`, t.action.label, plainText); if (isEn) checkLink(`${where}.action`, t.action.link); }
  const ids = new Set();
  for (const c of t.topics || []) {
    if (ids.has(c.id)) err(where, `two child topics with id "${c.id}"`);
    ids.add(c.id);
    checkTopic(c, `${where}/${c.id}`, lang, isEn);
  }
}

// Topics
const topics = new Set();
for (const d of fs.readdirSync(path.join(CONTENT, "topics"))) {
  const dir = path.join(CONTENT, "topics", d);
  if (!fs.statSync(dir).isDirectory()) continue;
  if (!ID.test(d)) err(dir, "document folder names are lower-case words joined by hyphens");
  for (const f of fs.readdirSync(dir)) {
    const file = path.join(dir, f);
    if (!f.endsWith(".json")) { err(file, "only .json topic files belong here"); continue; }
    const t = readJson(file);
    if (!t) continue;
    if (!t.en) { err(file, "has no English (en) topic"); continue; }
    if (t.en.id !== f.slice(0, -5)) err(file, `id "${t.en.id}" should match the file name`);
    for (const k of Object.keys(t)) if (!LANGS.includes(k)) err(file, `unknown language "${k}"`);
    for (const l of LANGS) if (t[l]) checkTopic(t[l], `${d}/${f.slice(0, -5)}`, l, l === "en");
    topics.add(`${d}/${f.slice(0, -5)}`);
  }
}

// Pages
const styles = new Set(fs.readdirSync("src/_includes/components").map((f) => f.replace(/\.njk$/, "")));
const paths = new Set();
for (const f of fs.readdirSync(path.join(CONTENT, "pages"))) {
  const file = path.join(CONTENT, "pages", f);
  const p = readJson(file);
  if (!p) continue;
  if (typeof p.path !== "string" || !p.path.startsWith("/")) err(file, "path must start with /");
  if (paths.has(p.path)) err(file, `another page already has the path ${p.path}`);
  paths.add(p.path);
  if (!topics.has(p.meta)) err(file, `meta topic "${p.meta}" doesn't exist`);
  (p.components || []).forEach((c, i) => {
    if (!styles.has(c.style)) err(file, `component ${i + 1}: no style "${c.style}" in src/_includes/components`);
    if (c.topic && !topics.has(c.topic)) err(file, `component ${i + 1}: no topic "${c.topic}"`);
  });
}

// Strings
for (const f of ["labels.json", "ui.json"]) {
  const s = readJson(path.join(CONTENT, "strings", f));
  if (!s) continue;
  for (const l of LANGS) for (const [k, v] of Object.entries(s[l] || {})) {
    if (!(k in s.en)) err(`strings/${f}`, `"${k}" (${l}) has no English`);
    if (f === "labels.json") checkText(`strings/${f} ${k} (${l})`, v, plainText); else checkHtml(`strings/${f} ${k} (${l})`, v);
  }
}

// Images
for (const f of fs.readdirSync(IMAGES)) {
  const file = path.join(IMAGES, f);
  if (fs.statSync(file).isDirectory()) { err(file, `no sub-folders; uploads go straight into ${IMAGES}/`); continue; }
  const ext = path.extname(f).toLowerCase();
  if (!(ext in IMAGE_TYPES)) { err(file, `type ${ext || "(none)"} isn't allowed (JPEG, PNG, WebP or AVIF)`); continue; }
  const size = fs.statSync(file).size;
  if (size > MAX_IMAGE) err(file, `${(size / 1048576).toFixed(1)} MB; at most 2 MB`);
  const magic = IMAGE_TYPES[ext], head = fs.readFileSync(file).subarray(0, 12);
  if (magic && !magic.every((b, i) => head[i] === b)) err(file, `isn't really a ${ext} file`);
  if (ext === ".webp" && head.toString("latin1", 8, 12) !== "WEBP") err(file, "isn't really a .webp file");
  if (ext === ".avif" && head.toString("latin1", 4, 8) !== "ftyp") err(file, "isn't really an .avif file");
}

if (errors.length) {
  errors.forEach((e) => console.error("✗ " + e));
  console.error(`\n${errors.length} problem${errors.length > 1 ? "s" : ""}.`);
  process.exit(1);
}
console.log(`Content OK: ${topics.size} topics, ${paths.size} pages, ${fs.readdirSync(IMAGES).length} images.`);
