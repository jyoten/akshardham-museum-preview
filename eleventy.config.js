// Builds the site from src/ into _site/: English at /, Gujarati at /gu/, Hindi at /hi/.
import fs from "node:fs";
import path from "node:path";

const LANGS = ["en", "gu", "hi"];
const ASSET = /^\/(css|js|fonts|images|data|admin|favicon|apple-touch)/;

function loadContent() {
  const out = {};
  for (const lang of LANGS) {
    out[lang] = {};
    const dir = path.join("src/content", lang);
    for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".json"))) {
      Object.assign(out[lang], JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
    }
  }
  return out;
}

export default function (eleventyConfig) {
  let content = loadContent();
  eleventyConfig.on("eleventy.before", () => { content = loadContent(); });
  eleventyConfig.addWatchTarget("src/content/");

  // "/visit" -> "/gu/visit" for Gujarati, unchanged for English
  const lurl = (p, lang) => {
    if (typeof p !== "string" || !p.startsWith("/") || ASSET.test(p) || lang === "en") return p;
    return `/${lang}${p}`;
  };
  eleventyConfig.addFilter("lurl", lurl);

  // Text for a key in a language, falling back to English when it isn't translated yet.
  eleventyConfig.addFilter("t", (key, lang) => {
    const own = content[lang] && content[lang][key];
    const val = (typeof own === "string" && own.trim()) ? own : (content.en[key] ?? `[missing: ${key}]`);
    if (lang === "en" || typeof val !== "string") return val;
    return val.replace(/href="(\/[^"]*)"/g, (m, p) => `href="${lurl(p, lang)}"`);
  });

  // Timeline eras: the language's own list if it has one, else English; links follow the language.
  eleventyConfig.addFilter("eras", (lang) => {
    const own = content[lang] && content[lang].timeline_eras;
    const eras = (Array.isArray(own) && own.length) ? own : content.en.timeline_eras;
    const fixed = eras.map((e) => ({ ...e, see: e.see.map((s) => ({ ...s, href: lurl(s.href, lang) })) }));
    return JSON.stringify(fixed).replace(/</g, "\\u003c");
  });

  // Strings the page scripts use (cookie banner, opening hours, notices).
  eleventyConfig.addFilter("uiStrings", (lang) => {
    const ui = {};
    for (const [k, v] of Object.entries(content.en)) {
      if (!k.startsWith("ui_")) continue;
      const own = content[lang] && content[lang][k];
      ui[k.slice(3)] = (typeof own === "string" && own.trim()) ? own : v;
    }
    return JSON.stringify(ui).replace(/</g, "\\u003c");
  });

  for (const dir of ["css", "js", "fonts", "images", "data", "admin"]) {
    eleventyConfig.addPassthroughCopy({ [`src/${dir}`]: dir });
  }
  for (const f of ["favicon.svg", "favicon-32.png", "favicon.ico", "apple-touch-icon.png"]) {
    eleventyConfig.addPassthroughCopy({ [`src/${f}`]: f });
  }

  return {
    dir: { input: "src", output: "_site", includes: "_includes", data: "_data" },
    templateFormats: ["njk"],
    htmlTemplateEngine: "njk",
  };
}
