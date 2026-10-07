// One-off: turns the v5 text files (src/content/<lang>/<page>.json, flat numbered keys)
// into v6 topic files, page layouts and string files. Kept for reference, like convert-v4.py.
//
//   node scripts/migrate-v5-content.mjs <v5 content dir>     e.g. ../v5/src/content
//
// Every v5 key must end up somewhere; the script lists any it didn't use.
import fs from "node:fs";
import path from "node:path";

const SRC = process.argv[2];
if (!SRC) { console.error("usage: node scripts/migrate-v5-content.mjs <v5 src/content dir>"); process.exit(1); }
const OUT = "src/content";
const LANGS = ["en", "gu", "hi"];

const v5 = {};
for (const l of LANGS) {
  v5[l] = {};
  for (const f of fs.readdirSync(path.join(SRC, l)).filter((f) => f.endsWith(".json"))) {
    Object.assign(v5[l], JSON.parse(fs.readFileSync(path.join(SRC, l, f), "utf8")));
  }
}

const used = new Set();
const warnings = [];
const warn = (s) => warnings.push(s);

// ---- values in three languages ("" = not translated, falls back to English) ----
const isV = (x) => x && typeof x === "object" && x.__v === 1;
const V = (en, gu = "", hi = "") => ({ __v: 1, en, gu, hi });
const lit = (s) => V(s);
const asV = (x) => (isV(x) ? x : lit(x));
function k(key) {
  if (!(key in v5.en)) throw new Error("no such v5 key: " + key);
  used.add(key);
  const o = V(v5.en[key]);
  for (const l of ["gu", "hi"]) {
    const s = v5[l][key];
    o[l] = typeof s === "string" && s.trim() ? s : "";
  }
  return o;
}
function map(v, fn) {
  const o = V("");
  for (const l of LANGS) o[l] = v[l] ? fn(v[l], l) : "";
  return o;
}
const mark = (v) => map(v, (s) => `<mark class="todo">${s}</mark>`);
// Joins parts; a translation only exists if at least one translated part does (others fall back to English).
function cat(...parts) {
  const o = V("");
  const vs = parts.filter(isV);
  for (const l of LANGS) {
    if (l !== "en" && vs.every((p) => !p[l])) { o[l] = ""; continue; }
    o[l] = parts.map((p) => (isV(p) ? p[l] || p.en : p)).join("");
  }
  return o;
}
const paras = (...vs) => cat(...vs.flatMap((v, i) => [i ? "\n" : "", "<p>", v, "</p>"]));
// Splits a value with a regex into named groups, per language.
function split(v, re, what) {
  const out = {};
  for (const l of LANGS) {
    if (!v[l]) continue;
    const m = re.exec(v[l]);
    if (!m) { warn(`${what}: "${v[l]}" (${l}) doesn't match ${re}`); continue; }
    for (const [g, s] of Object.entries(m.groups)) (out[g] ||= V(""))[l] = s;
  }
  return out;
}

// ---- topics ----
const TEXT = ["title", "subheading", "description"];
const T = (id, f = {}) => ({ id, ...f });

function variation(t, lang, isChild) {
  const o = {};
  if (lang === "en" || isChild) o.id = t.id;
  for (const f of TEXT) if (t[f] !== undefined) { const s = asV(t[f])[lang]; if (s) o[f] = s; }
  if (t.media && t.media.length) {
    if (lang === "en") {
      o.media = t.media.map((m) => {
        const r = { type: m.type || "image", src: m.src || "" };
        if (m.alt !== undefined) r.alt = asV(m.alt).en; else r.alt = "";
        if (m.caption !== undefined) r.caption = asV(m.caption).en;
        return r;
      });
    } else {
      const ms = t.media.map((m) => {
        const r = {};
        if (m.alt !== undefined && asV(m.alt)[lang]) r.alt = asV(m.alt)[lang];
        if (m.caption !== undefined && asV(m.caption)[lang]) r.caption = asV(m.caption)[lang];
        return r;
      });
      if (ms.some((r) => Object.keys(r).length)) o.media = ms;
    }
  }
  if (t.action) {
    const label = t.action.label !== undefined ? asV(t.action.label)[lang] : "";
    if (lang === "en") { o.action = {}; if (label) o.action.label = label; if (t.action.link !== undefined) o.action.link = t.action.link; }
    else if (label) o.action = { label };
  }
  if (t.topics && t.topics.length) {
    const kids = t.topics.map((c) => variation(c, lang, true)).filter((c) => lang === "en" || Object.keys(c).length > 1);
    if (kids.length) o.topics = kids;
  }
  return o;
}

const LIMITS = { subheading: 100, description: 2000 };
function checkLimits(t, where) {
  for (const [f, n] of Object.entries(LIMITS)) {
    if (t[f] === undefined) continue;
    for (const l of LANGS) { const s = asV(t[f])[l]; if (s && s.length > n) warn(`${where}/${t.id}: ${f} (${l}) is ${s.length} chars, WebNext allows ${n}`); }
  }
  (t.topics || []).forEach((c) => checkLimits(c, where + "/" + t.id));
}

const docs = {};
function doc(name, topics) {
  docs[name] = topics;
}

// ---- interface labels (aria-labels, form controls, glyphs) ----
const labels = {};
// The same label appears on several pages in v5 under different keys; they must agree in every language.
function label(name, ...keys) {
  const vals = keys.map(k);
  for (const l of LANGS) {
    const set = new Set(vals.map((v) => v[l]));
    if (set.size > 1) warn(`label ${name} (${l}) differs between ${keys.join(", ")}: ${[...set].join(" | ")}`);
  }
  labels[name] = vals[0];
}
const labelLit = (name, v) => { labels[name] = v; };

// ---- pages ----
const pages = {};
const HEADER_DARK = "position:relative;background:var(--ink);color:var(--cream)";
function page(id, p) { pages[id] = p; }
const C = (style, topic, settings) => {
  const c = { style };
  if (topic) c.topic = topic;
  if (settings) c.settings = settings;
  return c;
};

// ======================================================================
// Global: header, navigation, footer
// ======================================================================
doc("global", [
  T("site", { title: k("common_002"), subheading: k("common_003"), action: { label: k("common_004"), link: "/visit#tickets" } }),
  T("navigation", {
    topics: [
      ["explore", "common_006", "/explore"], ["timeline", "common_007", "/timeline"], ["visit", "common_008", "/visit"],
      ["learn", "common_009", "/learn"], ["support", "common_010", "/support"], ["shop", "common_011", "todo:Shop (no page in the design)"],
    ].map(([id, key, link]) => T(id, { action: { label: k(key), link } })),
  }),
  T("footer-contact", { title: k("common_002"), subheading: k("common_012"), description: k("common_013"), topics: [T("hours", { title: k("common_014") })] }),
  T("footer-explore", {
    title: k("common_006"),
    topics: [
      ["galleries", "common_015", "/explore"], ["replicas", "common_016", "/explore/legacy-architecture"],
      ["statues", "common_017", "/explore/lifelike-scenes"], ["shows", "common_018", "#"],
      ["timeline", "common_019", "/timeline"], ["virtual-tour", "common_020", "#"],
    ].map(([id, key, link]) => T(id, { action: { label: k(key), link } })),
  }),
  T("footer-visit", {
    title: k("common_022"),
    topics: [
      ["plan", "common_023", "/visit"], ["tickets", "common_024", "/visit#tickets"], ["accessibility", "common_025", "/visit#access"],
      ["schools", "common_026", "/learn#schools"], ["young-explorers", "common_027", "/learn#explorers"],
      ["shop", "common_011", "todo:Shop (no page in the design)"],
    ].map(([id, key, link]) => T(id, { action: { label: k(key), link } })),
  }),
  T("newsletter", { title: k("common_028"), description: k("common_029") }),
  T("footer-legal", {
    title: k("common_034"), subheading: k("common_038"), description: k("common_033"),
    topics: [["accessibility", "common_025"], ["privacy", "common_035"], ["press", "common_036"], ["careers", "common_037"]]
      .map(([id, key]) => T(id, { action: { label: k(key), link: "#" } })),
  }),
]);
label("home_link", "common_001");
label("open_menu", "common_005");
label("footer_visit_nav", "common_021");
label("newsletter_email", "common_030");
label("newsletter_placeholder", "common_031");
label("newsletter_subscribe", "common_032");

// ======================================================================
// Home
// ======================================================================
const quote = (id, q, who) => {
  const s = split(k(who), /^<strong style="color:var\(--ink\);font-weight:600">(?<name>.*?)<\/strong> · (?<role>.*)$/s, who);
  return T(id, { title: s.name, subheading: s.role, description: k(q) });
};
const secondary = (key, link) => T("secondary", { action: { label: k(key), link } });
doc("home", [
  T("meta", { title: k("home_082") }),
  T("hero", {
    subheading: k("home_003"), title: k("home_004"),
    media: [{ src: "/images/rani-ki-vav.jpg", alt: k("home_002"), caption: k("home_007") }],
    action: { label: k("home_005"), link: "/visit#tickets" },
    topics: [secondary("home_006", "/visit")],
  }),
  T("today", {
    title: k("home_008"),
    topics: [
      T("open-today", { title: k("home_009"), description: mark(k("home_010")) }),
      T("next-show", { title: k("home_011"), description: k("home_012") }),
      T("quietest-time", { title: k("home_013"), description: mark(k("home_014")) }),
      T("getting-here", { title: k("home_015"), action: { label: k("home_016"), link: "/visit#getting-here" } }),
    ],
  }),
  T("about", {
    subheading: k("home_017"), title: k("home_018"), description: k("home_019"),
    topics: [
      T("for-our-children", { title: k("home_020"), description: k("home_021") }),
      T("for-the-world", { title: k("home_022"), description: k("home_023") }),
    ],
    action: { label: k("home_024"), link: "#about" },
  }),
  T("explore-and-learn", {
    title: k("home_025"),
    topics: [
      T("explore", { title: k("home_027"), description: k("home_028"), media: [{ src: "/images/rani-ki-vav.jpg", alt: k("home_026") }], action: { label: k("home_029"), link: "/explore" } }),
      T("learn", { title: k("home_031"), description: k("home_032"), media: [{ src: "/images/young-visitor-carved-model.jpg", alt: k("home_030") }], action: { label: k("home_033"), link: "/learn" } }),
    ],
  }),
  T("in-numbers", {
    title: k("home_035"),
    topics: [["floors", 36], ["replicas", 38], ["dioramas", 40], ["shows", 42], ["statues", 44], ["square-feet", 46]]
      .map(([id, n]) => T(id, { title: k(`home_0${n}`), subheading: k(`home_0${n + 1}`) })),
  }),
  T("timeline", {
    subheading: k("home_048"), title: k("home_049"), description: k("home_050"),
    media: [{ src: "/images/timeline-corridor.jpg", alt: k("home_069") }],
    action: { label: k("home_068"), link: "/timeline" },
    topics: [[51, 52], [53, 54], [55, 56], [57, 58], [59, 60], [61, 62], [61, 63], [64, 65], [66, 67]].map(([d, n], i) =>
      T(`era-0${i + 1}`, { title: k(`home_0${n}`), subheading: k(`home_0${d}`), action: { link: `/timeline#era-0${i + 1}` } })),
  }),
  T("visitor-voices", {
    subheading: k("home_070"), title: k("home_071"),
    topics: [quote("priyanka", "home_072", "home_073"), quote("nand", "home_074", "home_075"), quote("aahna", "home_076", "home_077")],
  }),
  T("membership", {
    title: k("home_078"), description: k("home_079"),
    action: { label: k("home_080"), link: "/support#membership" },
    topics: [secondary("home_081", "/support")],
  }),
]);
label("home_welcome", "home_001");
label("home_in_numbers", "home_034");
page("home", {
  path: "/", nav: "", headerStyle: "position:absolute;top:0;left:0;right:0;z-index:3;color:var(--cream)", meta: "home/meta",
  components: [
    C("home-hero", "home/hero"), C("today-strip", "home/today"), C("intro-split", "home/about"),
    C("feature-cards", "home/explore-and-learn"), C("stats-band", "home/in-numbers"), C("timeline-teaser", "home/timeline"),
    C("quotes", "home/visitor-voices"), C("cta-band", "home/membership"),
  ],
});

// ======================================================================
// Explore
// ======================================================================
const galleryCard = (slug, alt, num, title, desc, img) =>
  T(slug, { subheading: k(num), title: k(title), description: k(desc), media: [{ src: `/images/${img}`, alt: k(alt) }], action: { link: `/explore/${slug}` } });
doc("explore", [
  T("meta", { title: k("explore_025") }),
  T("featured", {
    subheading: k("explore_001"), title: k("explore_002"), description: k("explore_003"),
    media: [{ src: "/images/ajanta-prayer-hall.jpg", alt: "" }],
    action: { label: k("explore_004"), link: "/ajanta" },
    topics: [secondary("explore_005", "/visit#tickets")],
  }),
  T("galleries", {
    subheading: k("explore_006"), title: k("explore_007"), description: k("explore_008"),
    topics: [
      galleryCard("lifelike-scenes", "explore_009", "explore_010", "explore_011", "explore_012", "scholars-diorama.jpg"),
      galleryCard("legacy-architecture", "explore_013", "explore_014", "explore_015", "explore_016", "sandstone-temple-facade.jpg"),
      galleryCard("walking-into-scripture", "explore_017", "explore_018", "explore_019", "explore_020", "sage-scripture-panels.jpg"),
      galleryCard("living-tapestry", "explore_021", "explore_022", "explore_023", "explore_024", "festival-street.jpg"),
    ],
  }),
]);
page("explore", {
  path: "/explore/", nav: "explore", headerStyle: HEADER_DARK, meta: "explore/meta",
  components: [C("site-header"), C("page-hero", "explore/featured", { headingId: "feat-hero-h" }), C("gallery-grid", "explore/galleries")],
});

// ======================================================================
// Galleries and exhibits
// ======================================================================
const IMG = { ajanta: "ajanta-prayer-hall.jpg", ranikivav: "rani-ki-vav.jpg", konark: "konark-wheel.jpg", haveli: "haveli.jpg", dholavira: "dholavira-bazaar.jpg",
  lifelike: "scholars-diorama.jpg", legacy: "sandstone-temple-facade.jpg", scripture: "sage-scripture-panels.jpg", tapestry: "festival-street.jpg" };
const LINK = { ajanta: "/ajanta", ranikivav: "/explore/rani-ki-vav", konark: "/explore/konark-wheel", haveli: "/explore/haveli", dholavira: "/explore/dholavira-bazaar",
  lifelike: "/explore/lifelike-scenes", legacy: "/explore/legacy-architecture", scripture: "/explore/walking-into-scripture", tapestry: "/explore/living-tapestry" };
const SLUG = { ajanta: "ajanta-caves", ranikivav: "rani-ki-vav", konark: "konark-wheel", haveli: "traditional-haveli", dholavira: "dholavira-bazaar",
  lifelike: "lifelike-scenes", legacy: "legacy-architecture", scripture: "walking-into-scripture", tapestry: "living-tapestry" };
// [what, alt, kind, title] -> a card linking to that exhibit/gallery
const card = (p) => ([what, alt, kind, title]) =>
  T(SLUG[what], { subheading: k(`${p}_${kind}`), title: k(`${p}_${title}`), media: [{ src: `/images/${IMG[what]}`, alt: k(`${p}_${alt}`) }], action: { link: LINK[what] } });
const breadcrumb = (p, trail) => T("breadcrumb", {
  topics: trail.map(([id, key, link]) => (link ? T(id, { action: { label: k(`${p}_${key}`), link } }) : T(id, { title: k(`${p}_${key}`) }))),
});

const GALLERIES = {
  lifelike: {
    p: "g_lifelike", meta: "026",
    items: [T("rishis-of-india", { subheading: k("g_lifelike_010"), title: k("g_lifelike_011"), media: [{ src: "/images/rishis-statues.jpg", alt: k("g_lifelike_009") }] }),
      T("scientific-achievements", { subheading: k("g_lifelike_013"), title: k("g_lifelike_014") })],
    placeholder: ["g_lifelike_012"],
    other: ["015", "016", [["legacy", "017", "018", "019"], ["scripture", "020", "021", "022"], ["tapestry", "023", "024", "025"]]],
  },
  legacy: {
    p: "g_legacy", meta: "034",
    items: [["ajanta", "009", "010", "011"], ["ranikivav", "012", "013", "014"], ["konark", "015", "016", "017"], ["haveli", "018", "010", "019"], ["dholavira", "020", "021", "022"]].map(card("g_legacy")),
    placeholder: [],
    other: ["023", "024", [["lifelike", "025", "026", "027"], ["scripture", "028", "029", "030"], ["tapestry", "031", "032", "033"]]],
  },
  scripture: {
    p: "g_scripture", meta: "027",
    items: [T("bhakti-and-yoga", { subheading: k("g_scripture_010"), title: k("g_scripture_011"), media: [{ src: "/images/sage-scripture-panels.jpg", alt: k("g_scripture_009") }] }),
      T("history-of-sanskrit", { subheading: k("g_scripture_010"), title: k("g_scripture_013") }),
      T("shanti-mantra", { subheading: k("g_scripture_014"), title: k("g_scripture_015") })],
    placeholder: ["g_scripture_012"],
    other: ["016", "017", [["lifelike", "018", "019", "020"], ["legacy", "021", "022", "023"], ["tapestry", "024", "025", "026"]]],
  },
  tapestry: {
    p: "g_tapestry", meta: "025",
    items: [T("performing-arts-of-india", { subheading: k("g_tapestry_010"), title: k("g_tapestry_011"), media: [{ src: "/images/performing-arts-gallery.jpg", alt: k("g_tapestry_009") }] }),
      T("festivals-of-india", { subheading: k("g_tapestry_010"), title: k("g_tapestry_013"), media: [{ src: "/images/festival-street.jpg", alt: k("g_tapestry_012") }] })],
    placeholder: [],
    other: ["014", "015", [["lifelike", "016", "017", "018"], ["legacy", "019", "020", "021"], ["scripture", "022", "023", "024"]]],
  },
};
const placeholderKeys = [];
const breadcrumbKeys = [], separatorKeys = [];
for (const [g, d] of Object.entries(GALLERIES)) {
  const p = d.p, slug = SLUG[g];
  placeholderKeys.push(...d.placeholder);
  breadcrumbKeys.push(`${p}_001`); separatorKeys.push(`${p}_003`);
  const [otherTitle, otherAll, otherCards] = d.other;
  doc(`gallery-${slug}`, [
    T("meta", { title: k(`${p}_${d.meta}`) }),
    breadcrumb(p, [["explore", "002", "/explore"], ["current", "004"]]),
    T("hero", { subheading: k(`${p}_005`), title: k(`${p}_004`), description: k(`${p}_006`), media: [{ src: `/images/${IMG[g]}`, alt: "" }] }),
    T("in-this-gallery", { title: k(`${p}_007`), description: mark(k(`${p}_008`)), topics: d.items }),
    T("other-galleries", { title: k(`${p}_${otherTitle}`), action: { label: k(`${p}_${otherAll}`), link: "/explore" }, topics: otherCards.map(card(p)) }),
  ]);
  page(`gallery-${slug}`, {
    path: `${LINK[g]}/`, nav: "explore", headerStyle: HEADER_DARK, meta: `gallery-${slug}/meta`,
    components: [
      C("site-header"), C("breadcrumb", `gallery-${slug}/breadcrumb`), C("page-hero", `gallery-${slug}/hero`, { headingId: "g-h" }),
      C("gallery-items", `gallery-${slug}/in-this-gallery`), C("related-cards", `gallery-${slug}/other-galleries`),
    ],
  });
}

// Exhibit pages. Ajanta has its own numbering; the other four share one.
const EXHIBITS = {
  ajanta: {
    p: "ajanta", h1: "007", eyebrow: "006", lead: "008", audio: ["009", "010", "011"], img: ["012", "013"], position: "center 30%",
    facts: ["014", [["015", "016"], ["017", "018"], ["019", "020"], ["021", "022"]], []],
    chapters: [
      T("chapter-1", { subheading: k("ajanta_023"), title: k("ajanta_024"), description: paras(k("ajanta_025"), k("ajanta_026")) }),
      T("chapter-2", {
        subheading: k("ajanta_027"), title: k("ajanta_028"),
        topics: [["ribbed-ceiling", 29], ["stupa", 32], ["pillars", 35]].map(([id, n]) =>
          T(id, { subheading: k(`ajanta_0${n}`), title: k(`ajanta_0${n + 1}`), description: k(`ajanta_0${n + 2}`) })),
      }),
      T("chapter-3", { subheading: k("ajanta_038"), title: k("ajanta_039"), description: paras(k("ajanta_040")) }),
      T("chapter-4", { subheading: k("ajanta_041"), title: k("ajanta_042"), description: paras(k("ajanta_043")), action: { label: cat(k("ajanta_044"), " ", mark(k("ajanta_045"))), link: "#" } }),
    ],
    nearby: ["046", "047", "/explore/legacy-architecture", [["ranikivav", "048", "049", "050"], ["konark", "051", "052", "053"], ["haveli", "054", "055", "056"], ["dholavira", "057", "058", "059"]]],
    lazy: false,
    band: ["060", "061", "062", "063", "/timeline#era-05", "064"], meta: "065",
  },
};
const xChapters = (p) => [
  T("chapter-1", { subheading: k(`${p}_022`), title: k(`${p}_023`), description: paras(k(`${p}_024`), k(`${p}_025`)) }),
  T("chapter-2", { subheading: k(`${p}_026`), title: k(`${p}_027`), description: paras(mark(k(`${p}_028`))) }),
  T("chapter-3", { subheading: k(`${p}_029`), title: k(`${p}_030`), description: paras(k(`${p}_031`)), action: { label: cat(k(`${p}_032`), " ", mark(k(`${p}_033`))), link: "#" } }),
];
const X = (p, marked, nearby, band, meta) => ({
  p, h1: "005", eyebrow: "006", lead: "007", audio: ["008", "009", "010"], img: ["011", "012"], position: "center",
  facts: ["013", [["014", "015"], ["016", "017"], ["018", "019"], ["020", "021"]], marked],
  chapters: xChapters(p), nearby: ["034", "035", "/explore", nearby], lazy: true, band, meta,
});
EXHIBITS.ranikivav = X("x_ranikivav", [], [["ajanta", "036", "037", "038"], ["konark", "039", "040", "041"], ["haveli", "042", "037", "043"], ["dholavira", "044", "045", "046"]], ["047", "048", "049", "050", "/timeline#era-06", "051"], "052");
EXHIBITS.konark = X("x_konark", [], [["ajanta", "036", "037", "038"], ["ranikivav", "039", "040", "041"], ["haveli", "042", "037", "043"], ["dholavira", "044", "045", "046"]], ["047", "048", "049", "050", "/timeline#era-06", "051"], "052");
EXHIBITS.haveli = X("x_haveli", ["017", "019"], [["ajanta", "036", "037", "038"], ["ranikivav", "039", "040", "041"], ["konark", "042", "043", "044"], ["dholavira", "045", "046", "047"]], ["048", "049", "050", "051", "/timeline", "052"], "053");
EXHIBITS.dholavira = X("x_dholavira", [], [["ajanta", "036", "037", "038"], ["ranikivav", "039", "040", "041"], ["konark", "042", "043", "044"], ["haveli", "045", "037", "046"]], ["047", "048", "049", "050", "/timeline#era-02", "051"], "052");

for (const [x, d] of Object.entries(EXHIBITS)) {
  const p = d.p, slug = SLUG[x], K = (n) => k(`${p}_${n}`);
  breadcrumbKeys.push(`${p}_001`); separatorKeys.push(`${p}_003`);
  const [factsTitle, facts, marked] = d.facts;
  const [nearTitle, nearAll, nearLink, nearCards] = d.nearby;
  const [bandLabel, bandEyebrow, bandText, bandSee, bandLink, bandBook] = d.band;
  doc(`exhibit-${slug}`, [
    T("meta", { title: K(d.meta) }),
    breadcrumb(p, [["explore", "002", "/explore"], ["legacy-architecture", "004", "/explore/legacy-architecture"], ["current", "005"]]),
    T("intro", {
      subheading: K(d.eyebrow), title: K(d.h1), description: K(d.lead),
      media: [{ src: `/images/${IMG[x]}`, alt: K(d.img[0]), caption: K(d.img[1]) }],
      topics: [T("audio-guide", { title: K(d.audio[1]), description: K(d.audio[2]), action: { label: K(d.audio[0]) } })],
    }),
    T("key-facts", {
      title: K(factsTitle),
      topics: facts.map(([a, b], i) => T(`fact-${i + 1}`, { title: K(a), description: marked.includes(b) ? mark(K(b)) : K(b) })),
    }),
    T("story", { topics: d.chapters }),
    T("nearby", { title: K(nearTitle), action: { label: K(nearAll), link: nearLink }, topics: nearCards.map(card(p)) }),
    T("on-the-timeline", {
      title: K(bandLabel), subheading: K(bandEyebrow), description: K(bandText),
      action: { label: K(bandSee), link: bandLink },
      topics: [T("secondary", { action: { label: K(bandBook), link: "/visit#tickets" } })],
    }),
  ]);
  page(`exhibit-${slug}`, {
    path: `${LINK[x]}/`, nav: "explore", headerStyle: HEADER_DARK, meta: `exhibit-${slug}/meta`,
    components: [
      C("site-header"), C("breadcrumb", `exhibit-${slug}/breadcrumb`),
      C("exhibit-hero", `exhibit-${slug}/intro`, { imagePosition: d.position }),
      C("key-facts", `exhibit-${slug}/key-facts`), C("chapters", `exhibit-${slug}/story`),
      C("nearby-cards", `exhibit-${slug}/nearby`, d.lazy ? undefined : { lazyImages: false }),
      C("timeline-band", `exhibit-${slug}/on-the-timeline`),
    ],
  });
}
label("breadcrumb", ...breadcrumbKeys);
label("breadcrumb_separator", ...separatorKeys);
label("photo_placeholder", ...placeholderKeys);

// ======================================================================
// Learn
// ======================================================================
doc("learn", [
  T("meta", { title: k("learn_026") }),
  T("hero", { subheading: k("learn_001"), title: k("learn_002"), description: k("learn_003"), media: [{ src: "/images/scholars-diorama.jpg", alt: "" }] }),
  T("ways-to-learn", {
    title: k("learn_004"),
    topics: [
      T("schools", { title: k("learn_006"), description: k("learn_007"), media: [{ src: "/images/young-visitor-carved-model.jpg", alt: k("learn_005") }], action: { label: k("learn_008"), link: "todo:School & group visits (no page)" } }),
      T("explorers", { title: k("learn_010"), description: k("learn_011"), media: [{ src: "/images/cosmos-theater.jpg", alt: k("learn_009") }], action: { label: k("learn_012"), link: "todo:Young explorers (no page)" } }),
      T("ideas", {
        title: k("learn_013"),
        topics: [["yoga", 14], ["karma", 16], ["ahimsa", 18], ["bhakti", 20], ["sanskars", 22], ["science", 24]]
          .map(([id, n]) => T(id, { title: k(`learn_0${n + 1}`), description: k(`learn_0${n}`) })),
      }),
    ],
  }),
]);
page("learn", {
  path: "/learn/", nav: "learn", headerStyle: HEADER_DARK, meta: "learn/meta",
  components: [C("site-header"), C("page-hero", "learn/hero", { headingId: "learn-h" }), C("learning-paths", "learn/ways-to-learn")],
});

// ======================================================================
// Timeline
// ======================================================================
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const erasOf = (l) => (Array.isArray(v5[l].timeline_eras) && v5[l].timeline_eras.length ? v5[l].timeline_eras : null);
used.add("timeline_eras");
const eraV = (i, get) => { const o = V(get(v5.en.timeline_eras[i])); for (const l of ["gu", "hi"]) { const e = erasOf(l); o[l] = e && e[i] ? get(e[i]) || "" : ""; } return o; };
const eras = v5.en.timeline_eras.map((e, i) => {
  if (e.num !== String(i + 1).padStart(2, "0")) warn(`era ${i} has num ${e.num}`);
  const f = (get) => eraV(i, get);
  const t = T(`era-${e.num}`, {
    title: f((x) => x.name), subheading: f((x) => x.dates), description: f((x) => x.summary),
    topics: [
      T("key-names", { description: f((x) => x.keys) }),
      ...e.see.map((s, j) => T(`see-${j + 1}`, {
        title: f((x) => x.see[j] && x.see[j].title), subheading: f((x) => x.see[j] && x.see[j].kind), description: f((x) => x.see[j] && x.see[j].where),
        media: s.hasImg ? [{ src: s.img, alt: "" }] : [], action: { link: s.href },
      })),
    ],
  });
  // The era buttons had their own copy of the dates and names; check it says the same as the era data.
  for (const [field, n] of [[t.subheading, 5 + i * 2], [t.title, 6 + i * 2]]) {
    const key = `timeline_${String(n).padStart(3, "0")}`, btn = k(key);
    for (const l of LANGS) {
      const want = esc(field[l] || field.en), got = btn[l] || btn.en;
      if (want !== got) warn(`era button ${key} (${l}) "${got}" differs from the era data "${want}"`);
    }
  }
  return t;
});
doc("timeline", [
  T("meta", { title: k("timeline_031") }),
  T("hero", { subheading: k("timeline_001"), title: k("timeline_002"), description: k("timeline_003"), media: [{ src: "/images/timeline-corridor.jpg", alt: "" }] }),
  T("eras", { title: k("timeline_004"), topics: eras }),
  T("note-on-dates", { title: k("timeline_029"), description: k("timeline_030") }),
]);
label("timeline_key_names", "timeline_023");
label("timeline_previous", "timeline_024");
label("timeline_earlier", "timeline_025");
label("timeline_next", "timeline_026");
label("timeline_later", "timeline_027");
label("timeline_see_it", "timeline_028");
page("timeline", {
  path: "/timeline/", nav: "timeline", headerStyle: HEADER_DARK, meta: "timeline/meta",
  components: [C("site-header"), C("timeline-hero", "timeline/hero"), C("era-picker", "timeline/eras"), C("era-panel", "timeline/eras"), C("footnote", "timeline/note-on-dates"), C("era-data", "timeline/eras")],
});

// ======================================================================
// Visit
// ======================================================================
const DASH = /^<span aria-hidden="true" style="color:var\(--accent\)">—<\/span>(?<text>.*)$/s;
const dashItem = (id, key) => T(id, { description: split(k(key), DASH, key).text });
doc("visit", [
  T("meta", { title: k("visit_122") }),
  T("hero", { subheading: k("visit_001"), title: k("visit_002"), description: mark(k("visit_003")), media: [{ src: "/images/festival-street.jpg", alt: "" }] }),
  T("essentials", {
    title: k("visit_004"),
    topics: [
      T("hours", { title: k("visit_005"), description: mark(k("visit_006")), subheading: k("visit_007") }),
      T("admission", { title: k("visit_008"), description: mark(k("visit_009")), subheading: k("visit_010") }),
      T("address", { title: k("visit_011"), description: k("visit_012") }),
      T("phone", { title: k("visit_013"), action: { label: k("visit_014"), link: "tel:+16099181212" } }),
    ],
  }),
  T("tickets", {
    subheading: k("visit_015"), title: k("visit_016"), description: k("visit_017"),
    topics: [
      dashItem("mobile-tickets", "visit_018"), dashItem("free-changes", "visit_019"), dashItem("groups", "visit_020"),
      T("booking", {
        title: k("visit_021"),
        action: { label: k("visit_050") },
        topics: [
          T("date", { title: k("visit_022") }),
          T("entry-window", { title: k("visit_023"), topics: [["morning", "024"], ["midday", "026"], ["afternoon", "027"], ["evening", "028"]].map(([id, n]) => T(id, { title: k(`visit_${n}`), subheading: mark(k("visit_025")) })) }),
          T("visitors", {
            title: k("visit_029"),
            topics: [["adult", "030", "031"], ["child", "037", "038"], ["senior", "041", "031"], ["member", "044", "045"]].map(([id, a, b]) => T(id, { title: k(`visit_${a}`), subheading: k(`visit_${b}`) })),
          }),
          T("add-ons", { topics: [T("show", { title: k("visit_048") }), T("tour", { title: k("visit_049") })] }),
        ],
      }),
    ],
  }),
  T("routes", {
    subheading: k("visit_051"), title: k("visit_052"),
    topics: [
      ["highlights", "rani-ki-vav.jpg", 53, 54, 55, [56, 57, 58, 59]],
      ["full-journey", "timeline-corridor.jpg", 60, 61, 62, [63, 64, 65, 66]],
      ["young-children", "festival-street.jpg", 67, 68, 69, [70, 71, 72, 73]],
    ].map(([id, img, alt, time, title, stops]) => T(id, {
      subheading: k(`visit_0${time}`), title: k(`visit_0${title}`), media: [{ src: `/images/${img}`, alt: k(`visit_0${alt}`) }],
      topics: stops.map((n, i) => T(`stop-${i + 1}`, { title: k(`visit_0${n}`) })),
    })),
  }),
  T("museum-map", {
    subheading: k("visit_074"), title: k("visit_075"), description: mark(k("visit_080")),
    action: { label: k("visit_081"), link: "#" },
    topics: [["floor-1", "077"], ["floor-2", "078"], ["floor-3", "079"]].map(([id, n]) => T(id, { title: k(`visit_${n}`) })),
  }),
  T("first-visit", {
    subheading: k("visit_084"), title: k("visit_085"),
    topics: [["what-to-wear", "086"], ["photography", "088"], ["food-and-rest", "090"], ["bags-and-strollers", "092"]]
      .map(([id, n]) => T(id, { title: k(`visit_${n}`), description: mark(k(`visit_${String(+n + 1).padStart(3, "0")}`)) })),
  }),
  T("accessibility-and-directions", {
    topics: [
      T("accessibility", { subheading: k("visit_094"), title: k("visit_095"), topics: ["096", "097", "098", "099"].map((n, i) => T(`item-${i + 1}`, { title: k(`visit_${n}`) })) }),
      T("getting-here", {
        subheading: k("visit_100"), title: k("visit_101"),
        action: { label: k("visit_108"), link: "#" },
        topics: [T("by-car", { title: k("visit_104"), description: mark(k("visit_105")) }), T("by-transit", { title: k("visit_106"), description: mark(k("visit_107")) })],
      }),
    ],
  }),
  T("questions", {
    title: k("visit_013"),
    topics: [
      T("mandir", { title: k("visit_109"), description: k("visit_110"), action: { label: k("visit_111"), link: "https://usa.akshardham.org" } }),
      T("how-long", { title: k("visit_112"), description: k("visit_113") }),
      T("shows", { title: k("visit_114"), description: mark(k("visit_115")) }),
      T("re-entry", { title: k("visit_116"), description: mark(k("visit_117")) }),
      T("tours-in-gujarati-or-hindi", { title: k("visit_118"), description: mark(k("visit_119")) }),
      T("food", { title: k("visit_120"), description: mark(k("visit_121")) }),
    ],
  }),
]);
for (const [id, fewer, more] of [["adult", "032", "035"], ["child", "039", "040"], ["senior", "042", "043"], ["member", "046", "047"]]) {
  label(`booking_fewer_${id}`, `visit_${fewer}`);
  label(`booking_more_${id}`, `visit_${more}`);
}
label("booking_minus", "visit_033");
label("booking_zero", "visit_034");
label("booking_plus", "visit_036");
label("floors", "visit_076");
label("floor_plan", "visit_082");
label("floor_plan_placeholder", "visit_083");
label("map", "visit_102");
label("map_placeholder", "visit_103");
page("visit", {
  path: "/visit/", nav: "visit", headerStyle: HEADER_DARK, meta: "visit/meta",
  components: [
    C("site-header"), C("visit-hero", "visit/hero"), C("essentials", "visit/essentials"), C("tickets", "visit/tickets"),
    C("routes", "visit/routes"), C("floor-map", "visit/museum-map"), C("first-visit", "visit/first-visit"),
    C("access-directions", "visit/accessibility-and-directions"), C("faq", "visit/questions"),
  ],
});

// ======================================================================
// Support
// ======================================================================
const tier = (id, badge, name, benefits, cta) => T(id, {
  ...(badge ? { subheading: k(`support_${badge}`) } : {}), title: k(`support_${name}`),
  topics: [T("price", { title: mark(k("support_011")), subheading: k("support_012") }), ...benefits.map((n, i) => T(`benefit-${i + 1}`, { title: k(`support_${n}`) }))],
  action: { label: k(`support_${cta}`), link: "#" },
});
k("support_009"); // an invisible spacer above the tiers that have no badge; the template adds it
for (const l of LANGS) if (v5[l].support_009 && v5[l].support_009 !== "​") warn(`support_009 (${l}) isn't just a zero-width space`);
const yajman = (id, img, alt, kind, name, aria) => {
  label(`sponsor_enquire_${id}`, `support_${aria}`);
  return T(id, {
    subheading: k(`support_${kind}`), title: k(`support_${name}`), description: mark(k("support_042")),
    media: [{ src: `/images/${img}`, alt: k(`support_${alt}`) }],
    action: { label: k("support_044"), link: "todo:Sponsorship enquiry (no page)" },
  });
};
doc("support", [
  T("meta", { title: k("support_082") }),
  T("hero", {
    subheading: k("support_002"), title: k("support_003"), description: k("support_004"),
    media: [{ src: "/images/konark-wheel.jpg", alt: k("support_001") }],
    action: { label: k("support_005"), link: "#membership" },
    topics: [secondary("support_006", "#give")],
  }),
  T("membership", {
    subheading: k("support_007"), title: k("support_008"),
    topics: [
      tier("individual", null, "010", ["013", "014", "015", "016"], "017"),
      tier("family", "018", "019", ["020", "014", "015", "021"], "022"),
      tier("patron", null, "023", ["024", "025", "026", "027"], "028"),
    ],
  }),
  T("adopt-an-exhibit", {
    subheading: k("support_029"), title: k("support_030"), description: k("support_031"),
    action: { label: k("support_032"), link: "#" },
    topics: [
      yajman("rishi-yajman", "rishis-statues.jpg", "039", "040", "041", "043"),
      yajman("saraswat-yajman", "cosmos-theater.jpg", "045", "046", "047", "048"),
      yajman("kalash-yajman", "performing-arts-gallery.jpg", "049", "050", "051", "052"),
      yajman("tilak-yajman", "dholavira-bazaar.jpg", "053", "054", "055", "056"),
      yajman("sanskruti-yajman", "ajanta-prayer-hall.jpg", "057", "058", "059", "060"),
    ],
  }),
  T("legacy-passes", {
    subheading: k("support_062"), title: k("support_063"), description: k("support_064"),
    media: [{ src: "/images/young-visitor-carved-model.jpg", alt: k("support_061") }],
    action: { label: k("support_066"), link: "#" },
    topics: [T("impact", { description: k("support_065") })],
  }),
  T("legacy-hall", { subheading: k("support_067"), title: k("support_068"), description: k("support_069") }),
  T("more-ways-to-give", {
    title: k("support_073"),
    topics: [["give-once", "074"], ["give-monthly", "076"], ["in-honour-of", "078"], ["volunteer", "080"]]
      .map(([id, n]) => T(id, { title: k(`support_${n}`), description: k(`support_${String(+n + 1).padStart(3, "0")}`), action: { link: "#" } })),
  }),
]);
label("sponsor_levels_scroll", "support_033");
label("sponsor_previous", "support_034");
label("arrow_left", "support_035");
label("sponsor_next", "support_036");
label("arrow_right", "support_037");
label("sponsor_levels", "support_038");
label("legacy_hall_search", "support_070");
label("legacy_hall_placeholder", "support_071");
label("legacy_hall_button", "support_072");
page("support", {
  path: "/support/", nav: "support", headerStyle: HEADER_DARK, meta: "support/meta",
  components: [
    C("site-header"), C("support-hero", "support/hero"), C("membership-tiers", "support/membership"),
    C("sponsorship-row", "support/adopt-an-exhibit"), C("feature-split", "support/legacy-passes"),
    C("legacy-hall", "support/legacy-hall"), C("link-cards", "support/more-ways-to-give"),
  ],
});

// ======================================================================
// Page not found
// ======================================================================
doc("not-found", [
  T("meta", { title: k("notfound_006") }),
  T("message", {
    subheading: k("notfound_001"), title: k("notfound_002"), description: k("notfound_003"),
    action: { label: k("notfound_004"), link: "/" },
    topics: [secondary("notfound_005", "/visit")],
  }),
]);
page("not-found", {
  path: "/404.html", nav: "explore", headerStyle: HEADER_DARK, meta: "not-found/meta",
  components: [C("site-header"), C("message", "not-found/message")],
});

// ======================================================================
// Write it all out
// ======================================================================
const write = (file, data) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 1) + "\n");
};
fs.rmSync(path.join(OUT, "topics"), { recursive: true, force: true });
fs.rmSync(path.join(OUT, "pages"), { recursive: true, force: true });
for (const [name, topics] of Object.entries(docs)) {
  for (const t of topics) {
    checkLimits(t, name);
    const file = {};
    for (const l of LANGS) file[l] = variation(t, l, false);
    write(path.join(OUT, "topics", name, `${t.id}.json`), file);
  }
}
for (const [id, p] of Object.entries(pages)) write(path.join(OUT, "pages", `${id}.json`), p);

// Strings: the JavaScript ones keep their v5 keys; the template labels get readable names.
const ui = {}, lab = {};
for (const l of LANGS) {
  ui[l] = {};
  for (const [key, val] of Object.entries(v5.en)) {
    if (!key.startsWith("ui_")) continue;
    used.add(key);
    const s = l === "en" ? val : v5[l][key];
    if (typeof s === "string" && s.trim()) ui[l][key.slice(3)] = s;
  }
  lab[l] = {};
  for (const [name, v] of Object.entries(labels)) if (v[l]) lab[l][name] = v[l];
}
write(path.join(OUT, "strings", "ui.json"), ui);
write(path.join(OUT, "strings", "labels.json"), lab);

const unused = Object.keys(v5.en).filter((key) => !used.has(key));
console.log(`${Object.keys(docs).length} documents, ${Object.values(docs).flat().length} topics, ${Object.keys(pages).length} pages, ${Object.keys(labels).length} labels`);
if (unused.length) console.log("UNUSED v5 keys:", unused.join(" "));
for (const l of ["gu", "hi"]) {
  const extra = Object.keys(v5[l]).filter((key) => !(key in v5.en));
  if (extra.length) console.log(`keys only in ${l}:`, extra.join(" "));
}
warnings.forEach((w) => console.log("WARN", w));
