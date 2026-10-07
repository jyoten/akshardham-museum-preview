// What changed in a topic, field by field and word by word. No dependencies; used by the editor's
// "Changes" view (in the browser) and by the pull-request summary (scripts/pr-summary.js, in Node).

export const LANGS = { en: "English", gu: "Gujarati", hi: "Hindi" };

// Splits text into words and the spaces/punctuation between them, so a diff reads naturally.
const tokens = (s) => String(s || "").match(/[\p{L}\p{M}\p{N}_'’-]+|\s+|[^\s\p{L}\p{M}\p{N}_'’-]/gu) || [];

// Word-level diff: [{ type: "same" | "del" | "add", text }]. Longest common subsequence; texts are short.
export function wordDiff(before, after) {
  const a = tokens(before), b = tokens(after);
  const n = a.length, m = b.length;
  const lcs = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  const out = [];
  const push = (type, text) => { const last = out[out.length - 1]; if (last && last.type === type) last.text += text; else out.push({ type, text }); };
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { push("same", a[i]); i++; j++; }
    else if (lcs[i + 1][j] >= lcs[i][j + 1]) push("del", a[i++]);
    else push("add", b[j++]);
  }
  while (i < n) push("del", a[i++]);
  while (j < m) push("add", b[j++]);
  return out;
}

// Readable text for comparing: Markdown links show their words only.
export const readable = (s) => String(s || "").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/\\\n/g, "\n").trim();

const has = (s) => typeof s === "string" && s.trim() !== "";
// What a field shows in a language: its own text, or the English it falls back to.
const shown = (own, en) => (has(own) ? own : en || "");

// The text fields of a topic in one language, flattened: [{ key, label, value, own }].
// key follows the topic's structure (ids), label is for people (English titles), value is what the site
// shows (the language's own text, or the English it falls back to), own is the language's own text.
function fields(en, v, key, label, out) {
  en = en || {}; v = v || {};
  const k = (what) => (key ? `${key}/${what}` : what);
  const l = (what) => (label ? `${label} › ${what}` : what);
  for (const [f, what] of [["title", "Title"], ["subheading", "Sub heading"], ["description", "Description"]]) {
    if (has(en[f]) || has(v[f])) out.push({ key: k(f), label: l(what), value: shown(v[f], en[f]), own: v[f] || "" });
  }
  (en.media || []).forEach((m, i) => {
    const vm = (v.media || [])[i] || {};
    // The image file itself is the same in every language: reported under English.
    if (has(m.src)) out.push({ key: k(`media${i}.src`), label: l(`Image ${i + 1}`), value: m.src.split("/").pop(), own: "" });
    if (has(m.alt) || has(vm.alt)) out.push({ key: k(`media${i}.alt`), label: l(`Image ${i + 1} description`), value: shown(vm.alt, m.alt), own: vm.alt || "" });
    if (has(m.caption) || has(vm.caption)) out.push({ key: k(`media${i}.caption`), label: l(`Image ${i + 1} caption`), value: shown(vm.caption, m.caption), own: vm.caption || "" });
  });
  if (en.action && (has(en.action.label) || has(v.action && v.action.label))) {
    out.push({ key: k("action"), label: l("Button"), value: shown(v.action && v.action.label, en.action.label), own: (v.action && v.action.label) || "" });
  }
  for (const c of en.topics || []) {
    const name = has(c.title) ? `“${readable(c.title).slice(0, 40)}”` : c.id;
    fields(c, (v.topics || []).find((x) => x && x.id === c.id), k(c.id), l(name), out);
  }
  return out;
}

// Compares two versions of a topic file ({ en, gu, hi }). Either may be null (a new or deleted topic).
// Returns [{ lang, language, label, before, after, parts }] for every field whose shown text changed.
// A Gujarati or Hindi field that only changed because the English it falls back to changed is reported
// once, under English.
export function topicChanges(before, after) {
  const changes = [];
  for (const [lang, language] of Object.entries(LANGS)) {
    const own = lang === "en" ? null : lang;
    const b = before ? fields(before.en, own && before[own], "", "", []) : [];
    const a = after ? fields(after.en, own && after[own], "", "", []) : [];
    const bm = new Map(b.map((f) => [f.key, f])), am = new Map(a.map((f) => [f.key, f]));
    for (const key of new Set([...bm.keys(), ...am.keys()])) {
      const fb = bm.get(key), fa = am.get(key);
      const x = readable(fb && fb.value), y = readable(fa && fa.value);
      if (x === y) continue;
      if (own && !has(fb && fb.own) && !has(fa && fa.own)) continue;
      const everywhere = key.endsWith(".src");
      changes.push({ lang: everywhere ? "all" : lang, language: everywhere ? "All languages" : language, label: (fa || fb).label, before: x, after: y, parts: wordDiff(x, y) });
    }
  }
  return changes;
}

// Plain-language languages list: "English and Gujarati".
export function languagesOf(changes) {
  if (changes.some((c) => c.lang === "all")) return "all languages";
  const names = [...new Set(changes.map((c) => c.language))];
  return names.length < 2 ? names.join("") : names.slice(0, -1).join(", ") + " and " + names[names.length - 1];
}
