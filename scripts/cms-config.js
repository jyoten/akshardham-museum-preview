// Writes src/admin/config.yml (the Decap CMS setup) from the content files.
// Run after adding a document, a page, a component style or a label:  npm run cms-config
import fs from "node:fs";
import path from "node:path";

const CONTENT = "src/content";
const LOCALES = ["en", "gu", "hi"];

// Uploads: one fixed folder, images only, at most 2 MB each. Decap checks the size when a file is picked;
// scripts/check-content.js checks type and size again on every pull request.
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
const UPLOADS = "JPEG, PNG, WebP or AVIF, up to 2 MB";
const MEDIA_LIMITS = { allow_multiple: false, config: { max_file_size: MAX_UPLOAD_BYTES } };

// The sign-in service (auth/). Placeholder until it is deployed: see SECURITY.md.
const AUTH_SERVICE_URL = "https://AUTH-SERVICE.example.org";

// Documents (folders in src/content/topics), in the order the admin lists them.
const DOCUMENTS = {
  global: "Global: header, navigation & footer",
  home: "Home",
  explore: "Explore",
  "gallery-lifelike-scenes": "Gallery: Lifelike Scenes & Statues",
  "gallery-legacy-architecture": "Gallery: Legacy Architecture",
  "gallery-walking-into-scripture": "Gallery: Walking into Scripture",
  "gallery-living-tapestry": "Gallery: A Living Tapestry",
  "exhibit-ajanta-caves": "Exhibit: Ajanta Caves",
  "exhibit-rani-ki-vav": "Exhibit: Rani-ki-Vav",
  "exhibit-konark-wheel": "Exhibit: Konark Wheel",
  "exhibit-traditional-haveli": "Exhibit: Traditional Haveli",
  "exhibit-dholavira-bazaar": "Exhibit: Dholavira Bazaar",
  timeline: "Timeline (eras)",
  visit: "Plan your visit",
  learn: "Learn",
  support: "Support",
  "not-found": "Page not found",
};

// ---- a small YAML writer (strings are JSON-quoted, which YAML accepts) ----
const scalar = (v) => (typeof v === "string" ? JSON.stringify(v) : String(v));
function yaml(v, indent = 0) {
  const pad = " ".repeat(indent);
  if (Array.isArray(v)) {
    if (!v.length) return " []";
    return v.map((item) => {
      if (item && typeof item === "object" && !Array.isArray(item)) {
        const body = yaml(item, indent + 2).replace(/^\n/, "").replace(new RegExp("^" + " ".repeat(indent + 2)), "");
        return `\n${pad}- ${body}`;
      }
      return `\n${pad}- ${scalar(item)}`;
    }).join("");
  }
  if (v && typeof v === "object") {
    return Object.entries(v).filter(([, x]) => x !== undefined).map(([k, x]) => {
      const simple = x === null || typeof x !== "object";
      return `\n${pad}${k}:${simple ? " " + scalar(x) : yaml(x, indent + 2)}`;
    }).join("");
  }
  return " " + scalar(v);
}

// ---- the topic fields (WebNext: title, sub heading, description, media, action, child topics) ----
function topicFields(depth) {
  const fields = [
    { name: "id", label: "ID", widget: "string", i18n: "duplicate", required: true, pattern: ["^[a-z0-9-]+$", "Lower-case letters, numbers and hyphens"], hint: "A stable name. Page layouts and translations find this topic by it, so don't change it once it is in use." },
    { name: "title", label: "Title", widget: "string", i18n: true, required: false },
    { name: "subheading", label: "Sub heading", widget: "string", i18n: true, required: false, pattern: ["^.{0,100}$", "At most 100 characters"], hint: "Up to 100 characters. Often the small line above a heading, or a label." },
    { name: "description", label: "Description", widget: "text", i18n: true, required: false, pattern: ["^[\\s\\S]{0,2000}$", "At most 2000 characters"], hint: "Rich text, up to 2000 characters. Keep any <tags> as they are; they make links, paragraphs and highlights." },
    {
      name: "media", label: "Media", label_singular: "image or video", widget: "list", i18n: true, required: false, summary: "{{fields.src}}",
      fields: [
        { name: "type", label: "Type", widget: "select", options: ["image", "video"], default: "image", i18n: "duplicate" },
        { name: "src", label: "File", widget: "image", required: false, i18n: "duplicate", choose_url: false, media_library: MEDIA_LIMITS, hint: `Upload into the site's image folder: ${UPLOADS}. Leave empty for a placeholder.` },
        { name: "alt", label: "Alt text", widget: "string", required: false, i18n: true, hint: "What the image shows, for people who can't see it. Empty if it's only decoration." },
        { name: "caption", label: "Caption", widget: "string", required: false, i18n: true },
      ],
    },
    {
      name: "action", label: "Action button", widget: "object", i18n: true, required: false, collapsed: true,
      fields: [
        { name: "label", label: "Label", widget: "string", required: false, i18n: true },
        { name: "link", label: "Link", widget: "string", required: false, i18n: "duplicate", hint: "/visit, /visit#tickets, https://… or todo:<note> for a link that has no page yet." },
      ],
    },
  ];
  if (depth > 0) {
    fields.push({
      name: "topics", label: "Child topics", label_singular: "child topic", widget: "list", i18n: true, required: false,
      summary: "{{fields.id}} {{fields.title}}", collapsed: true,
      hint: "In Gujarati and Hindi, a child is matched to the English one by its ID; anything left empty shows the English text.",
      fields: topicFields(depth - 1),
    });
  }
  return fields;
}

const time = (name, label, extra = {}) => ({ name, label, widget: "datetime", date_format: false, time_format: "HH:mm", format: "HH:mm", picker_utc: false, required: false, ...extra });
const day = (d) => ({
  name: d, label: d[0].toUpperCase() + d.slice(1), widget: "object", collapsed: true,
  fields: [{ name: "closed", label: "Closed all day", widget: "boolean", default: false }, time("opens", "Opens"), time("closes", "Closes")],
});

const statusCollection = {
  name: "status", label: "Opening hours & notices",
  description: "Regular hours, special dates (holidays, closures, special hours) and notices shown at the top of every page.",
  editor: { preview: false },
  files: [{
    name: "site-status", label: "Opening hours & notices", file: "src/data/site-status.json",
    fields: [
      { name: "sample_hours", label: "These are sample hours (highlight them in yellow on the site)", widget: "boolean", default: false },
      { name: "timezone", label: "Time zone", widget: "hidden", default: "America/New_York" },
      { name: "regular_hours", label: "Regular weekly hours", widget: "object", fields: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map(day) },
      {
        name: "special_dates", label: "Special dates", label_singular: "special date", widget: "list",
        hint: "Holidays, closures or different hours on a particular day. These override the regular hours.",
        summary: "{{fields.date}} {{fields.note_en}}",
        fields: [
          { name: "date", label: "Date", widget: "datetime", date_format: "YYYY-MM-DD", time_format: false, format: "YYYY-MM-DD" },
          { name: "closed", label: "Closed all day", widget: "boolean", default: true },
          time("opens", "Opens (if open)"), time("closes", "Closes (if open)"),
          { name: "note_en", label: "Note (English)", widget: "string", required: false, hint: "e.g. Closed for Thanksgiving" },
          { name: "note_gu", label: "Note (Gujarati)", widget: "string", required: false },
          { name: "note_hi", label: "Note (Hindi)", widget: "string", required: false },
        ],
      },
      {
        name: "notices", label: "Notices", label_singular: "notice", widget: "list",
        hint: "A bar at the top of every page. Switch it on, and optionally set when it starts and ends.",
        summary: "{{fields.type}}: {{fields.message_en}}",
        fields: [
          { name: "id", label: "Short name (no spaces)", widget: "string", hint: "e.g. snow-closure-jan-12. Used to remember who closed the notice." },
          { name: "active", label: "Show this notice", widget: "boolean", default: true },
          { name: "type", label: "Type", widget: "select", options: [{ label: "Information", value: "info" }, { label: "Warning", value: "warning" }, { label: "Closure", value: "closure" }], default: "info" },
          { name: "starts", label: "Show from", widget: "datetime", format: "YYYY-MM-DDTHH:mm", date_format: "YYYY-MM-DD", time_format: "HH:mm", picker_utc: false, required: false, hint: "Museum time (New York). Leave empty to show straight away." },
          { name: "ends", label: "Show until", widget: "datetime", format: "YYYY-MM-DDTHH:mm", date_format: "YYYY-MM-DD", time_format: "HH:mm", picker_utc: false, required: false, hint: "Leave empty to show until you switch it off." },
          { name: "message_en", label: "Message (English)", widget: "text" },
          { name: "message_gu", label: "Message (Gujarati)", widget: "text", required: false },
          { name: "message_hi", label: "Message (Hindi)", widget: "text", required: false },
          { name: "link_url", label: "Link", widget: "string", required: false, hint: "e.g. /visit/ or a full web address" },
          { name: "link_label_en", label: "Link text (English)", widget: "string", required: false },
          { name: "link_label_gu", label: "Link text (Gujarati)", widget: "string", required: false },
          { name: "link_label_hi", label: "Link text (Hindi)", widget: "string", required: false },
        ],
      },
    ],
  }],
};

const i18n = { structure: "single_file", locales: LOCALES, default_locale: "en" };
const readJson = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const plain = (s) => String(s).replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const short = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

const docs = fs.readdirSync(path.join(CONTENT, "topics")).filter((d) => fs.statSync(path.join(CONTENT, "topics", d)).isDirectory());
const order = Object.keys(DOCUMENTS).filter((d) => docs.includes(d)).concat(docs.filter((d) => !DOCUMENTS[d]));

const topicCollections = order.map((d) => ({
  name: `topics-${d}`,
  label: `Text — ${DOCUMENTS[d] || d}`,
  label_singular: "topic",
  description: "Each entry is a topic: title, sub heading, description, media, an action button and child topics, in English, Gujarati and Hindi. Leave a Gujarati or Hindi field empty to show the English text there.",
  folder: `${CONTENT}/topics/${d}`,
  extension: "json", format: "json",
  identifier_field: "id", slug: "{{slug}}", summary: "{{id}} — {{title}}",
  create: true, delete: false,
  i18n,
  editor: { preview: false },
  fields: topicFields(3),
}));

// Interface text: labels for screen readers and form controls, and the wording the page scripts use.
function stringsFile(name, label, file, description) {
  const en = readJson(path.join(CONTENT, "strings", file)).en;
  return {
    name, label, file: `${CONTENT}/strings/${file}`, description,
    fields: Object.entries(en).map(([key, val]) => {
      const p = plain(val);
      return { name: key, label: short(p || key, 70) + `  (${key})`, widget: p.length > 90 ? "text" : "string", i18n: true, required: false };
    }),
  };
}
const stringsCollection = {
  name: "strings", label: "Interface text", description: "Short text that isn't page content: screen-reader labels, form controls, the cookie prompt and opening-hours wording.",
  i18n, editor: { preview: false },
  files: [
    stringsFile("labels", "Labels (screen readers, forms, placeholders)", "labels.json"),
    stringsFile("ui", "Cookie prompt, hours wording & page scripts", "ui.json", "Keep {time}, {day}, {open}, {close}, {days}, {n}, {num}, {total} and {bay} exactly as written."),
  ],
};

const styles = fs.readdirSync("src/_includes/components").filter((f) => f.endsWith(".njk")).map((f) => f.slice(0, -4)).sort();
const pagesCollection = {
  name: "pages", label: "Page layouts", label_singular: "page",
  description: "Which components make up each page, in order. Each component is a style (a design in src/_includes/components) showing one topic. Changing these changes the page structure; new styles need a developer.",
  folder: `${CONTENT}/pages`, extension: "json", format: "json", identifier_field: "path", slug: "{{slug}}", summary: "{{path}}",
  create: false, delete: false, editor: { preview: false },
  fields: [
    { name: "path", label: "Address", widget: "string" },
    { name: "nav", label: "Highlighted menu item", widget: "string", required: false },
    { name: "meta", label: "Page title topic", widget: "string", hint: "document/topic whose title is the browser-tab title" },
    { name: "headerStyle", label: "Header style (CSS)", widget: "string", required: false },
    {
      name: "components", label: "Components", label_singular: "component", widget: "list", summary: "{{fields.style}}: {{fields.topic}}",
      fields: [
        { name: "style", label: "Style", widget: "select", options: styles },
        { name: "topic", label: "Topic", widget: "string", required: false, hint: "document/topic, e.g. home/hero" },
        {
          name: "settings", label: "Settings", widget: "object", required: false, collapsed: true,
          fields: [
            { name: "headingId", label: "Heading id", widget: "string", required: false },
            { name: "imagePosition", label: "Image position (CSS object-position)", widget: "string", required: false },
            { name: "lazyImages", label: "Load images lazily", widget: "boolean", required: false },
          ],
        },
      ],
    },
  ],
};

const config = {
  // GitHub backend: every save is a commit by the token the sign-in service hands out, which needs write access
  // to this one repository. base_url is where auth/ is deployed; it answers Decap's sign-in popup.
  backend: { name: "github", repo: "OWNER/REPOSITORY", branch: "main", base_url: AUTH_SERVICE_URL, auth_endpoint: "auth" },
  // Every change becomes a draft, then a pull request someone reviews and merges.
  publish_mode: "editorial_workflow",
  // Only used when the admin is opened on localhost with "npm run cms" running; ignored on a real domain.
  local_backend: true,
  media_folder: "src/images",
  public_folder: "/images",
  locale: "en",
  i18n,
  collections: [statusCollection, ...topicCollections, stringsCollection, pagesCollection],
};

let out = "# Generated by scripts/cms-config.js — edit that script, not this file.\n";
out += "# Set backend.repo to the GitHub repository and backend.base_url to the deployed sign-in service (auth/), see SECURITY.md.\n";
out += "# \"npm run cms\" (decap-server) lets you use the admin on localhost without signing in.";
out += yaml(config) + "\n";
fs.writeFileSync("src/admin/config.yml", out);
console.log(`wrote src/admin/config.yml (${topicCollections.length} documents, ${styles.length} component styles)`);
