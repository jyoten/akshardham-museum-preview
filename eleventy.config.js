// Builds the site from src/ into _site/: English at /, Gujarati at /gu/, Hindi at /hi/.
// Text lives in topic files (src/content/topics/<document>/<topic>.json) and pages are assembled
// from page layouts (src/content/pages/<page>.json). See CONTENT-MODEL.md.
import fs from "node:fs";
import { createHash } from "node:crypto";
import { HtmlBasePlugin } from "@11ty/eleventy";
import path from "node:path";
import * as text from "./lib/text.js";
import { createSite, LANGS } from "./lib/site.js";
import nunjucks from "nunjucks";

const CONTENT = "src/content";
// Hosting under a sub-path (e.g. GitHub Pages project site): SITE_PREFIX=/akshardham-museum-preview
const PREFIX = (process.env.SITE_PREFIX || "").replace(/\/$/, "");
// Review builds: not indexed, no admin, a "preview" note on every page
const REVIEW = process.env.SITE_REVIEW === "1";
// Previews of a proposed change (scripts/build-preview.mjs): SITE_PREVIEW_PR=<number> changes the note.
const PREVIEW_OF = /^\d+$/.test(process.env.SITE_PREVIEW_PR || "") ? process.env.SITE_PREVIEW_PR : "";
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

export default function (eleventyConfig) {
  eleventyConfig.addPlugin(HtmlBasePlugin);
  eleventyConfig.addGlobalData("site", { prefix: PREFIX, review: REVIEW || !!PREVIEW_OF, previewOf: PREVIEW_OF });
  eleventyConfig.addGlobalData("adminCsp", { policy: adminCsp(), decapVersion: DECAP_VERSION, decapIntegrity: DECAP_INTEGRITY });
  const site = createSite({ content: loadContent(), text, prefix: PREFIX });
  const { lurl } = site;
  eleventyConfig.on("eleventy.before", () => site.setContent(loadContent()));
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

  // lurl, topic, link, label, ui, paras, uiStrings, linkStyle, eras: see lib/site.js
  for (const [name, fn] of Object.entries(site.filters)) eleventyConfig.addFilter(name, fn);

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
  if (!REVIEW) {
    eleventyConfig.addPassthroughCopy({
      "src/admin/config.yml": "admin/config.yml",
      "src/admin/manual-init.js": "admin/manual-init.js",
      "src/admin/editor.js": "admin/editor.js",
      "src/admin/topic-diff.js": "admin/topic-diff.js",
      "src/admin/preview.css": "admin/preview.css",
      // The previews render pages exactly as the build does: same text rules, same content rules, same templates.
      "lib/text-core.js": "admin/lib/text-core.js",
      "lib/site.js": "admin/lib/site.js",
      "node_modules/nunjucks/browser/nunjucks-slim.min.js": "admin/vendor/nunjucks-slim.min.js",
      "node_modules/markdown-it/dist/markdown-it.min.js": "admin/vendor/markdown-it.min.js",
    });
    // The site's templates, precompiled for the browser, and the published content they show.
    eleventyConfig.on("eleventy.after", ({ dir }) => {
      const inc = path.join("src", "_includes");
      const files = [];
      const walk = (d) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (/\.(njk|html)$/.test(f)) files.push(p); } };
      walk(inc);
      const js = files.sort().map((f) => nunjucks.precompileString(fs.readFileSync(f, "utf8"), { name: path.relative(inc, f).split(path.sep).join("/") })).join("\n");
      fs.mkdirSync(path.join(dir.output, "admin"), { recursive: true });
      fs.writeFileSync(path.join(dir.output, "admin", "preview-templates.js"), js);
      const c = loadContent();
      const data = { ...c, languages: readJson("src/_data/languages.json"), langs: readJson("src/_data/langs.json") };
      fs.writeFileSync(path.join(dir.output, "admin", "site-data.json"), JSON.stringify(data));
    });
  }
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
