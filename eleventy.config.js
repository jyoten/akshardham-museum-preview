// Builds the site from src/ into _site/: English at /, Gujarati at /gu/, Hindi at /hi/.
// Text lives in topic files (src/content/topics/<document>/<topic>.json) and pages are assembled
// from page layouts (src/content/pages/<page>.json). See CONTENT-MODEL.md.
import fs from "node:fs";
import { createHash } from "node:crypto";
import { HtmlBasePlugin } from "@11ty/eleventy";
import path from "node:path";

const LANGS = ["en", "gu", "hi"];
const CONTENT = "src/content";
// Hosting under a sub-path (e.g. GitHub Pages project site): SITE_PREFIX=/akshardham-museum-preview
const PREFIX = (process.env.SITE_PREFIX || "").replace(/\/$/, "");
// Review builds: not indexed, no admin, a "preview" note on every page
const REVIEW = process.env.SITE_REVIEW === "1";
const ASSET = /^\/(css|js|fonts|images|data|admin|favicon|apple-touch)/;
// `eleventy --serve` (npm run dev): the admin may also talk to the local decap-server.
const DEV = process.env.ELEVENTY_RUN_MODE === "serve";

// Decap CMS, pinned. To upgrade, change both and see SECURITY.md for how to get the hash.
const DECAP_VERSION = "3.16.3";
const DECAP_INTEGRITY = "sha384-A/Gdn928CNLufmnGWGs9RM4Q9o8bSNLeJERqBFrBjwzL7FRpoLT3MPF8Tl0+Wd2p";

// Content-Security-Policy for public pages. Inline scripts are allowed by hash only (worked out per page at build
// time); styles allow inline because the design uses style attributes. Anything from another site (analytics,
// maps, video) has to be added here first.
const publicCsp = (scriptHashes) => [
  "default-src 'self'",
  `script-src 'self' ${scriptHashes.join(" ")}`.trim(),
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "media-src 'self'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "upgrade-insecure-requests",
].join("; ");
// The admin: Decap's script from the CDN, GitHub's API, avatars and blob: previews of uploaded images.
// 'unsafe-eval' is needed because Decap checks its config with ajv, which compiles code at runtime; it is
// limited to the admin page, which runs no other scripts.
const adminCsp = () => [
  "default-src 'self'",
  `script-src 'self' 'unsafe-eval' https://cdn.jsdelivr.net/npm/decap-cms@${DECAP_VERSION}/dist/decap-cms.js`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://avatars.githubusercontent.com https://raw.githubusercontent.com",
  "font-src 'self' data:",
  `connect-src 'self' https://api.github.com${DEV ? " http://localhost:8081" : ""}`,
  "frame-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

const readJson = (f) => JSON.parse(fs.readFileSync(f, "utf8"));

function loadContent() {
  const topics = {};
  const tdir = path.join(CONTENT, "topics");
  for (const d of fs.readdirSync(tdir)) {
    if (!fs.statSync(path.join(tdir, d)).isDirectory()) continue;
    for (const f of fs.readdirSync(path.join(tdir, d)).filter((f) => f.endsWith(".json"))) {
      topics[`${d}/${f.slice(0, -5)}`] = readJson(path.join(tdir, d, f));
    }
  }
  const pdir = path.join(CONTENT, "pages");
  const pages = fs.readdirSync(pdir).filter((f) => f.endsWith(".json")).sort()
    .map((f) => ({ id: f.slice(0, -5), ...readJson(path.join(pdir, f)) }));
  return {
    topics,
    pages,
    ui: readJson(path.join(CONTENT, "strings/ui.json")),
    labels: readJson(path.join(CONTENT, "strings/labels.json")),
  };
}

// "/visit" -> "/gu/visit" for Gujarati, unchanged for English
const lurl = (p, lang) => {
  if (typeof p !== "string" || !p.startsWith("/") || ASSET.test(p) || lang === "en") return p;
  return `/${lang}${p}`;
};
// Links inside translated text follow the language too.
const fixLinks = (s, lang) => (lang === "en" || typeof s !== "string" ? s : s.replace(/href="(\/[^"]*)"/g, (m, p) => `href="${lurl(p, lang)}"`));
const has = (s) => typeof s === "string" && s.trim() !== "";
const pick = (own, en, lang) => fixLinks(has(own) ? own : en, lang);

// A topic in one language: the English topic, with each text field replaced by the
// language's variation where it has one. Structure (children, media, links) comes from English;
// child topics are matched by id and media by position.
function localize(en, v, lang) {
  v = v || {};
  const out = { id: en.id };
  for (const f of ["title", "subheading", "description"]) if (en[f] !== undefined || has(v[f])) out[f] = pick(v[f], en[f], lang);
  if (en.media) {
    out.media = en.media.map((m, i) => {
      const vm = (v.media && v.media[i]) || {};
      const r = { ...m, alt: pick(vm.alt, m.alt, lang) };
      if (m.caption !== undefined) r.caption = pick(vm.caption, m.caption, lang);
      return r;
    });
  }
  if (en.action) out.action = { link: en.action.link, label: pick(v.action && v.action.label, en.action.label, lang) };
  out.topics = (en.topics || []).map((c) => localize(c, (v.topics || []).find((x) => x.id === c.id), lang));
  return out;
}

export default function (eleventyConfig) {
  eleventyConfig.addPlugin(HtmlBasePlugin);
  eleventyConfig.addGlobalData("site", { prefix: PREFIX, review: REVIEW });
  eleventyConfig.addGlobalData("adminCsp", { policy: adminCsp(), decapVersion: DECAP_VERSION, decapIntegrity: DECAP_INTEGRITY });
  let content = loadContent();
  let cache = {};
  eleventyConfig.on("eleventy.before", () => { content = loadContent(); cache = {}; });
  eleventyConfig.addWatchTarget(CONTENT + "/");

  // One entry per page and language; src/pages.njk renders each.
  eleventyConfig.addGlobalData("pageList", () => {
    const list = [];
    for (const p of loadContent().pages) {
      for (const lang of LANGS) {
        const url = lurl(p.path, lang);
        list.push({ ...p, lang, permalink: url.endsWith(".html") ? url : url + "index.html" });
      }
    }
    return list;
  });

  eleventyConfig.addFilter("lurl", lurl);

  // {% set t = "home/hero" | topic(lang) %}
  eleventyConfig.addFilter("topic", (ref, lang) => {
    const key = ref + "|" + lang;
    if (cache[key]) return cache[key];
    const file = content.topics[ref];
    if (!file) throw new Error(`No topic "${ref}" (looked for ${CONTENT}/topics/${ref}.json)`);
    return (cache[key] = localize(file.en, file[lang], lang));
  });

  // An action link: "/visit" (localized), "#", "https://…", or "todo:<note>" for a link with no page yet.
  eleventyConfig.addFilter("link", (link, lang) => {
    if (typeof link === "string" && link.startsWith("todo:")) return { href: "#", todo: link.slice(5) };
    return { href: lurl(link || "", lang) };
  });

  // Interface labels (aria-labels, form controls), falling back to English.
  eleventyConfig.addFilter("label", (name, lang) => {
    const en = content.labels.en[name];
    if (en === undefined) throw new Error(`No label "${name}" in ${CONTENT}/strings/labels.json`);
    return pick(content.labels[lang] && content.labels[lang][name], en, lang);
  });
  eleventyConfig.addFilter("ui", (name, lang) => pick(content.ui[lang] && content.ui[lang][name], content.ui.en[name], lang));

  // Rich text into styled paragraphs: "<p>a</p>\n<p>b</p>" or plain "a" -> <p style="…">…</p>
  eleventyConfig.addFilter("paras", (html, style) => {
    const open = `<p style="${style}">`;
    return /<p>/.test(html) ? html.replace(/<p>/g, open) : open + html + "</p>";
  });

  // Strings the page scripts use (cookie banner, opening hours, notices).
  eleventyConfig.addFilter("uiStrings", (lang) => {
    const ui = {};
    for (const [k, v] of Object.entries(content.ui.en)) ui[k] = has(content.ui[lang] && content.ui[lang][k]) ? content.ui[lang][k] : v;
    return JSON.stringify(ui).replace(/</g, "\\u003c");
  });

  // Timeline eras for js/timeline.js, built from the era topics; links follow the language.
  eleventyConfig.addFilter("eras", (eras, lang) => {
    const pre = (u) => (typeof u === "string" && u.startsWith("/") ? PREFIX + u : u);
    const out = eras.topics.map((e, i) => {
      const keys = e.topics.find((c) => c.id === "key-names");
      return {
        dates: e.subheading, name: e.title, summary: e.description, keys: keys ? keys.description : "",
        see: e.topics.filter((c) => c.id !== "key-names").map((s) => {
          const img = s.media && s.media.length ? s.media[0].src : "";
          return { title: s.title, kind: s.subheading, where: s.description, img: pre(img), hasImg: !!img, href: pre(lurl(s.action.link, lang)) };
        }),
        num: String(i + 1).padStart(2, "0"),
      };
    });
    return JSON.stringify(out).replace(/</g, "\\u003c");
  });

  // Public pages: a Content-Security-Policy that allows each page's own inline script by its hash, and a referrer policy.
  eleventyConfig.addTransform("security-headers", function (content) {
    const out = this.page.outputPath || "";
    if (!out.endsWith(".html") || !content.includes("<!-- security-meta -->")) return content;
    const hashes = [];
    for (const m of content.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
      if (/\bsrc=/.test(m[1]) || /type="(application\/json|text\/plain)"/.test(m[1])) continue;
      hashes.push(`'sha256-${createHash("sha256").update(m[2], "utf8").digest("base64")}'`);
    }
    const meta = `<meta http-equiv="Content-Security-Policy" content="${publicCsp([...new Set(hashes)])}">\n<meta name="referrer" content="strict-origin-when-cross-origin">`;
    return content.replace("<!-- security-meta -->", meta);
  });

  for (const dir of ["css", "js", "fonts", "images", "data"]) {
    eleventyConfig.addPassthroughCopy({ [`src/${dir}`]: dir });
  }
  // The admin (src/admin/index.njk renders the page) is left out of review builds.
  if (!REVIEW) eleventyConfig.addPassthroughCopy({ "src/admin/config.yml": "admin/config.yml" });
  for (const f of ["favicon.svg", "favicon-32.png", "favicon.ico", "apple-touch-icon.png"]) {
    eleventyConfig.addPassthroughCopy({ [`src/${f}`]: f });
  }

  return {
    dir: { input: "src", output: "_site", includes: "_includes", data: "_data" },
    pathPrefix: PREFIX ? PREFIX + "/" : "/",
    templateFormats: ["njk"],
    htmlTemplateEngine: "njk",
  };
}
