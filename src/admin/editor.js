// Additions to the editor (Decap CMS) for reviewers and editors:
// - "Used on" at the top of each topic: which pages show it
// - a preview pane with three views:
//     Preview          the page with this topic as it looks on the site, the section outlined
//     Changes · Text   word-by-word changes against the published version, per language and field
//     Changes · Visual Before (published) and After (this edit) side by side, rendered with the site's own
//                      templates, CSS, fonts and images
// Pages are rendered here with exactly the build's code: lib/site.js, lib/text-core.js and the site's
// Nunjucks templates (precompiled at build time into preview-templates.js). The published content comes from
// site-data.json, written at build time from the main branch.
import { createText } from "./lib/text-core.js";
import { createSite, usage } from "./lib/site.js";
import { topicChanges, LANGS as LANG_NAMES } from "./topic-diff.js";

const { CMS, h, createClass, nunjucks, markdownit } = window;
const text = createText(markdownit);
const loader = new nunjucks.PrecompiledLoader(window.nunjucksPrecompiled);
const LANG_TABS = [["en", "English"], ["gu", "ગુજરાતી"], ["hi", "हिन्दी"]];

let data = null;
const ready = fetch("site-data.json", { cache: "no-cache" }).then((r) => r.json()).then((d) => {
  d.used = usage(d.pages, Object.keys(d.topics));
  d.pageById = Object.fromEntries(d.pages.map((p) => [p.id, p]));
  data = d;
  return d;
});

const docOf = (collection) => collection.get("name").replace(/^topics-/, "");
const pagesFor = (ref) => ((data && data.used[ref]) || []).map((id) => data.pageById[id]);
function usedOnText(ref) {
  if (!data) return "…";
  const pages = pagesFor(ref);
  if (!pages.length) return "Not shown on any page yet";
  if (pages.length === data.pages.length) return "Every page";
  return pages.map((p) => p.name).join(", ");
}

// The topic as it is in the editor now: { en, gu, hi }.
function currentFile(entry) {
  const en = entry.get("data").toJS();
  delete en.used_on;
  const file = { en };
  for (const l of ["gu", "hi"]) {
    const d = entry.getIn(["i18n", l, "data"]);
    if (d) file[l] = d.toJS();
  }
  return file;
}

// A whole page as HTML, rendered like the build, with each section marked by its topic.
function renderPage(page, lang, topics) {
  const site = createSite({ content: { ...data, topics }, text });
  const env = new nunjucks.Environment(loader, { autoescape: true });
  for (const [name, fn] of Object.entries(site.filters)) env.addFilter(name, fn);
  return env.render("preview/page.njk", {
    pg: page, lang, path: page.path, navKey: page.nav, headerStyle: page.headerStyle,
    site: { prefix: "", review: false }, languages: data.languages, langs: data.langs, preview: true,
  });
}
const CSS = ["fonts", "site", "play", "compact", "consent", "status"];
function pageDocument(body, lang) {
  const links = CSS.map((n) => `<link rel="stylesheet" href="${location.origin}/css/${n}.css">`).join("");
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8">${links}
<style>.cms-changed>*{outline:4px solid #E8590C!important;outline-offset:-4px}body{margin:0}</style></head><body>${body}</body></html>`;
}

// One rendered page in a scaled-down frame, scrolled to the topic's section, which is outlined.
const PageFrame = createClass({
  componentDidMount() { this.draw(); },
  componentDidUpdate(prev) { if (prev.html !== this.props.html) this.draw(); },
  draw() {
    const frame = this.frame;
    if (!frame) return;
    frame.onload = () => {
      const doc = frame.contentDocument;
      const el = doc && doc.querySelector(`[data-topic="${this.props.topicRef}"]`);
      if (el) {
        el.classList.add("cms-changed");
        const first = el.firstElementChild;
        if (first) frame.contentWindow.scrollTo(0, Math.max(0, first.getBoundingClientRect().top + frame.contentWindow.scrollY - 24));
      }
    };
    frame.srcdoc = pageDocument(this.props.html, this.props.lang);
  },
  render() {
    const width = 1280, scale = this.props.scale || 0.5, height = this.props.height || 1400;
    return h("div", { className: "cms-frame", style: { width: width * scale + "px", height: height * scale + "px" } },
      h("iframe", { ref: (el) => (this.frame = el), title: this.props.title, style: { width: width + "px", height: height + "px", transform: `scale(${scale})` } }));
  },
});

function DiffText({ parts }) {
  return h("p", { className: "cms-diff" }, parts.map((p, i) => (p.type === "same" ? p.text : h(p.type === "add" ? "ins" : "del", { key: i }, p.text))));
}

const makePreview = (doc) => createClass({
  getInitialState() { return { view: "changes", detail: "text", lang: "en", page: null, ready: !!data, width: 900 }; },
  componentDidMount() {
    ready.then(() => this.setState({ ready: true }));
    const win = this.props.window || window;
    const measure = () => this.setState({ width: (win.document.body && win.document.body.clientWidth) || 900 });
    measure();
    win.addEventListener("resize", measure);
  },
  render() {
    if (!this.state.ready) return h("div", { className: "cms-pane" }, h("p", null, "Loading…"));
    const entry = this.props.entry;
    const id = entry.getIn(["data", "id"]);
    const ref = `${doc}/${id}`;
    const published = data.topics[ref] || null;
    const current = currentFile(entry);
    const pages = pagesFor(ref);
    const page = pages.find((p) => p.id === this.state.page) || pages[0];
    const lang = this.state.lang;
    const set = (k, v) => () => this.setState({ [k]: v });
    const tab = (k, v, label) => h("button", { type: "button", className: this.state[k] === v ? "on" : "", onClick: set(k, v) }, label);

    const head = h("div", { className: "cms-bar" },
      h("div", { className: "cms-tabs" }, tab("view", "preview", "Preview"), tab("view", "changes", "Changes")),
      this.state.view === "changes" ? h("div", { className: "cms-tabs" }, tab("detail", "text", "Text"), tab("detail", "visual", "Visual")) : null,
      (this.state.view === "preview" || this.state.detail === "visual") ? h("div", { className: "cms-tabs" }, LANG_TABS.map(([l, name]) => tab("lang", l, name))) : null,
      pages.length > 1 && (this.state.view === "preview" || this.state.detail === "visual")
        ? h("select", { value: page.id, onChange: (e) => this.setState({ page: e.target.value }), "aria-label": "Page" }, pages.map((p) => h("option", { key: p.id, value: p.id }, p.name)))
        : null);
    const where = h("p", { className: "cms-where" }, "Used on: ", usedOnText(ref));

    if (this.state.view === "changes" && this.state.detail === "text") {
      const changes = topicChanges(published, current);
      if (!published) return h("div", { className: "cms-pane" }, head, where, h("p", { className: "cms-note" }, "This is a new topic; everything in it is new."));
      if (!changes.length) return h("div", { className: "cms-pane" }, head, where, h("p", { className: "cms-none" }, "No changes"));
      const byLang = {};
      for (const c of changes) (byLang[c.lang] ||= []).push(c);
      return h("div", { className: "cms-pane" }, head, where,
        Object.entries(byLang).map(([l, list]) => h("section", { key: l, className: "cms-lang" },
          h("h3", null, LANG_NAMES[l] || "All languages"),
          list.map((c, i) => h("div", { key: i, className: "cms-change" }, h("h4", null, c.label), h(DiffText, { parts: c.parts }))))));
    }

    if (!page) return h("div", { className: "cms-pane" }, head, where, h("p", { className: "cms-note" }, "This topic isn't on any page yet, so there is nothing to show."));
    const after = renderPage(page, lang, { ...data.topics, [ref]: current });
    if (this.state.view === "preview") {
      const scale = Math.min(1, (this.state.width - 32) / 1280);
      return h("div", { className: "cms-pane" }, head, where, h(PageFrame, { html: after, lang, topicRef: ref, scale, height: 1600, title: "Preview" }));
    }
    const before = published ? renderPage(page, lang, data.topics) : null;
    const scale = Math.min(0.6, (this.state.width - 56) / 2 / 1280);
    const unchanged = before === after;
    return h("div", { className: "cms-pane" }, head, where,
      unchanged ? h("p", { className: "cms-none" }, "No changes in ", LANG_NAMES[lang], " on this page") : null,
      h("div", { className: "cms-sides" },
        h("figure", null, h("figcaption", null, "Before (published)"), before ? h(PageFrame, { html: before, lang, topicRef: ref, scale, height: 1600, title: "Before" }) : h("p", { className: "cms-note" }, "Not published yet")),
        h("figure", null, h("figcaption", null, "After (this edit)"), h(PageFrame, { html: after, lang, topicRef: ref, scale, height: 1600, title: "After" }))));
  },
});

// "Used on" at the top of a topic. Shows information only; it saves nothing.
const UsedOn = createClass({
  componentDidMount() { ready.then(() => this.forceUpdate()); },
  render() {
    const id = this.props.entry.getIn(["data", "id"]);
    const ref = `${docOf(this.props.collection)}/${id}`;
    return h("p", { className: this.props.classNameWrapper, style: { margin: 0, padding: "12px 16px", fontWeight: 600 } }, usedOnText(ref));
  },
});

CMS.registerWidget("used-on", UsedOn, () => null);
CMS.registerPreviewStyle(new URL("preview.css", location.href).href);
ready.then((d) => {
  const docs = new Set(Object.keys(d.topics).map((ref) => ref.split("/")[0]));
  for (const doc of docs) CMS.registerPreviewTemplate(`topics-${doc}`, makePreview(doc));
}).finally(() => CMS.init());
