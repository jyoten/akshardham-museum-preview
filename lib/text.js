// How text from the content files becomes HTML. Editors never write HTML:
// - every text field is plain text; "&" and "<" are escaped here;
// - a Description is Markdown (paragraphs, **bold**, *italic*, [links](/visit), line breaks), shown as
//   formatted text in the editor;
// - anything in [SQUARE BRACKETS] is a reminder of content still to come, and is highlighted
//   (<mark class="todo">) on the site.
// Used by eleventy.config.js and scripts/check-content.js.
import MarkdownIt from "markdown-it";

const escText = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export const escAttr = (s) => escText(s).replace(/"/g, "&quot;");

const md = new MarkdownIt({ html: false, linkify: false, typographer: false, breaks: false });
// Keep links as written (no percent-encoding), refuse script-like ones.
md.validateLink = (url) => !/^\s*(javascript|vbscript|file|data):/i.test(url);
md.normalizeLink = (url) => url;
md.normalizeLinkText = (s) => s;
md.renderer.rules.text = (tokens, i) => escText(tokens[i].content);
md.renderer.rules.hardbreak = () => "<br>";
md.renderer.rules.softbreak = () => "\n";
// [text](todo:note) is a link whose page doesn't exist yet: href="#" with the yellow to-do marker.
md.renderer.rules.link_open = (tokens, i) => {
  const href = tokens[i].attrGet("href") || "";
  if (href.startsWith("todo:")) {
    let note = href.slice(5);
    try { note = decodeURIComponent(note); } catch {}
    return `<a href="#" class="todo-link" data-todo="${escAttr(note)}">`;
  }
  return `<a href="${escAttr(href)}">`;
};

// [ANYTHING IN BRACKETS] -> <mark class="todo">[…]</mark>, in text only (never inside a tag).
export function markPlaceholders(html) {
  return String(html).split(/(<[^>]*>)/).map((part) => (part.startsWith("<") ? part : part.replace(/\[[^\[\]]*\]/g, (m) => `<mark class="todo">${m}</mark>`))).join("");
}

// Title, sub heading, caption, button label: plain text.
export const plainText = (s) => markPlaceholders(escText(s));
// Description: Markdown. One paragraph renders inline (the design wraps it); several render as <p>…</p>.
export function richText(s) {
  const src = String(s);
  const html = /\n[ \t]*\n/.test(src.trim()) ? md.render(src).trim() : md.renderInline(src.trim());
  return markPlaceholders(html);
}
