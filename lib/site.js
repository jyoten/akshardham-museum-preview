// The site's content rules, shared by the build (eleventy.config.js) and the editor's previews (src/admin/editor.js):
// languages and links, topics in a language with English fallback, and the template filters.
// No imports: pass in the content and the text functions (lib/text-core.js).

export const LANGS = ["en", "gu", "hi"];
const ASSET = /^\/(css|js|fonts|images|data|admin|favicon|apple-touch)/;
const has = (s) => typeof s === "string" && s.trim() !== "";

export function createSite({ content, text, prefix = "" }) {
  // "/visit" -> "/gu/visit" for Gujarati, unchanged for English
  const lurl = (p, lang) => {
    if (typeof p !== "string" || !p.startsWith("/") || ASSET.test(p) || lang === "en") return p;
    return `/${lang}${p}`;
  };
  // Links inside translated text follow the language too.
  const fixLinks = (s, lang) => (lang === "en" || typeof s !== "string" ? s : s.replace(/href="(\/[^"]*)"/g, (m, p) => `href="${lurl(p, lang)}"`));
  // Content is plain text and Markdown (see lib/text-core.js); "raw" keeps it as written, for the timeline script.
  const RENDER = {
    html: { title: text.plainText, subheading: text.plainText, description: text.richText, caption: text.plainText, label: text.plainText, alt: text.escAttr },
    raw: { title: String, subheading: String, description: String, caption: String, label: String, alt: String },
  };

  // A topic in one language: the English topic, with each text field replaced by the
  // language's variation where it has one. Structure (children, media, links) comes from English;
  // child topics are matched by id and media by position.
  function localize(en, v, lang, mode = "html") {
    v = v || {};
    const R = RENDER[mode];
    const pick = (own, enVal, f) => fixLinks(R[f](has(own) ? own : enVal), lang);
    const out = { id: en.id };
    for (const f of ["title", "subheading", "description"]) if (en[f] !== undefined || has(v[f])) out[f] = pick(v[f], en[f], f);
    if (en.media) {
      out.media = en.media.map((m, i) => {
        const vm = (v.media && v.media[i]) || {};
        const r = { ...m, alt: pick(vm.alt, m.alt || "", "alt") };
        if (m.caption !== undefined) r.caption = pick(vm.caption, m.caption, "caption");
        return r;
      });
    }
    if (en.action) out.action = { link: en.action.link, label: en.action.label === undefined && !(v.action && has(v.action.label)) ? undefined : pick(v.action && v.action.label, en.action.label || "", "label") };
    out.topics = (en.topics || []).map((c) => localize(c, (v.topics || []).find((x) => x && x.id === c.id), lang, mode));
    return out;
  }

  let cache = {};
  const filters = {
    lurl,
    // {% set t = "home/hero" | topic(lang) %}
    topic(ref, lang) {
      const key = ref + "|" + lang;
      if (cache[key]) return cache[key];
      const file = content.topics[ref];
      if (!file) throw new Error(`No topic "${ref}" (looked for src/content/topics/${ref}.json)`);
      return (cache[key] = localize(file.en, file[lang], lang));
    },
    // An action link: "/visit" (localized), "#", "https://…", or "todo:<note>" for a link with no page yet.
    link(link, lang) {
      if (typeof link === "string" && link.startsWith("todo:")) return { href: "#", todo: link.slice(5) };
      return { href: lurl(link || "", lang) };
    },
    // Interface labels (aria-labels, form controls), falling back to English.
    label(name, lang) {
      const en = content.labels.en[name];
      if (en === undefined) throw new Error(`No label "${name}" in src/content/strings/labels.json`);
      return fixLinks(text.escAttr(has(content.labels[lang] && content.labels[lang][name]) ? content.labels[lang][name] : en), lang);
    },
    ui(name, lang) {
      return fixLinks(has(content.ui[lang] && content.ui[lang][name]) ? content.ui[lang][name] : content.ui.en[name], lang);
    },
    // Rich text into styled paragraphs: "<p>a</p>\n<p>b</p>" or plain "a" -> <p style="…">…</p>
    paras(html, style) {
      const open = `<p style="${style}">`;
      return /<p>/.test(html) ? html.replace(/<p>/g, open) : open + html + "</p>";
    },
    // Strings the page scripts use (cookie banner, opening hours, notices).
    uiStrings(lang) {
      const ui = {};
      for (const [k, v] of Object.entries(content.ui.en)) ui[k] = has(content.ui[lang] && content.ui[lang][k]) ? content.ui[lang][k] : v;
      return JSON.stringify(ui).replace(/</g, "\\u003c");
    },
    // Adds a colour to the links in a piece of text (a few places style their links).
    linkStyle(html, style) {
      return String(html).replace(/<a href="([^"]*)">/g, `<a href="$1" style="${style}">`);
    },
    // Timeline eras for js/timeline.js, built from the era topics; links follow the language.
    eras(ref, lang) {
      const file = content.topics[ref];
      const eras = localize(file.en, file[lang], lang, "raw");
      const pre = (u) => (typeof u === "string" && u.startsWith("/") ? prefix + u : u);
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
    },
  };
  return { lurl, localize, filters, setContent(c) { content = c; cache = {}; } };
}

// Which pages show a topic: { "visit/hero": ["visit"], "global/site": [every page id], … }
// Topics in the "global" document are in the header and footer of every page.
export function usage(pages, topicRefs = []) {
  const used = {};
  for (const p of pages) for (const c of p.components || []) if (c.topic) (used[c.topic] ||= []).includes(p.id) || used[c.topic].push(p.id);
  for (const ref of topicRefs) if (ref.startsWith("global/")) used[ref] = pages.map((p) => p.id);
  return used;
}
