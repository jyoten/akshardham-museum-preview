# Content model (v6)

From v6 the site's text is stored the way BAPS WebNext stores content: **documents** made of **topics**, and **pages** made of **components** (a style + a topic). The site looks exactly as it did in v5; only where the words live has changed. If WebNext gets a content API, each file here can be copied across field for field.

```
src/content/
  topics/<document>/<topic>.json   one topic (and its child topics), with en / gu / hi variations
  pages/<page>.json                 one page: its address and its components in order
  strings/labels.json               interface labels: screen readers, form controls, placeholders (en / gu / hi)
  strings/ui.json                   wording used by the page scripts: cookie prompt, opening hours (en / gu / hi)
src/data/site-status.json           opening hours, special dates and notices (read in the browser, unchanged from v5)
src/_includes/components/<style>.njk  the component styles (the design), one per kind of section
```

## Topics

A topic file holds one topic and its children. English is the full topic; Gujarati and Hindi are **variations** that only carry translated text.

```json
{
 "en": {
  "id": "hero",
  "title": "Ten thousand years of India, under one roof.",
  "subheading": "The largest Hindu museum in the Western Hemisphere",
  "description": "…",
  "media": [{ "type": "image", "src": "/images/rani-ki-vav.jpg", "alt": "The carved stone galleries…", "caption": "Rani-ki-Vav stepwell…" }],
  "action": { "label": "Book timed tickets", "link": "/visit#tickets" },
  "topics": [{ "id": "secondary", "action": { "label": "Plan your visit", "link": "/visit" } }]
 },
 "gu": {
  "title": "ભારતનાં દસ હજાર વર્ષ, એક જ છત નીચે.",
  "subheading": "…",
  "media": [{ "alt": "…", "caption": "…" }],
  "action": { "label": "સમયબદ્ધ ટિકિટ બુક કરો" },
  "topics": [{ "id": "secondary", "action": { "label": "આપની મુલાકાતનું આયોજન" } }]
 },
 "hi": { "…": "…" }
}
```

| Field | Meaning | Limit |
| --- | --- | --- |
| `id` | Stable slug. The file name for a top-level topic; page layouts and translations find topics by it. | lower-case, hyphens |
| `title` | The heading. For a section that shows no heading, the name screen readers announce for it (e.g. "Key facts"). | |
| `subheading` | Secondary line: usually the small capitals line above a heading; on cards the kind ("Diorama"); on stats the label; on timeline rows the date. | 100 characters |
| `description` | Rich text (HTML). Several paragraphs are written `<p>…</p>`; a single one can be plain. | 2000 characters |
| `media` | Ordered list of `{ type, src, alt, caption }`. An item with no `src` shows a photo placeholder. | |
| `action` | One button or link: `{ label, link }`. | |
| `topics` | Child topics, same shape, any depth (the admin edits three levels). | |

**Languages.** Structure comes from English: which children exist and in what order, image files, links and IDs. For Gujarati and Hindi, each text field (`title`, `subheading`, `description`, `media[].alt`, `media[].caption`, `action.label`) is taken from the variation if it's filled in, otherwise from English. Children are matched by `id`, media by position. A missing language, topic or field simply shows English. Links inside text (`href="/visit"`) are pointed at the same language automatically (`/gu/visit`).

**Links** in `action.link`: a site path (`/visit#tickets`, made language-aware), an anchor (`#about`), an external address, `tel:`, or `todo:<note>` for a link whose page doesn't exist yet. `todo:` renders as `href="#"` with the yellow to-do marker, as in v5.

**Placeholders** are unchanged from v5: `<mark class="todo">[X]</mark>` inside the text, highlighted yellow.

### Documents

| Document (folder) | Topics |
| --- | --- |
| `global` | `site` (wordmark, tagline, Book tickets), `navigation`, `footer-contact`, `footer-explore`, `footer-visit`, `newsletter`, `footer-legal` |
| `home` | `meta`, `hero`, `today`, `about`, `explore-and-learn`, `in-numbers`, `timeline`, `visitor-voices`, `membership` |
| `explore` | `meta`, `featured`, `galleries` |
| `gallery-<name>` ×4 | `meta`, `breadcrumb`, `hero`, `in-this-gallery`, `other-galleries` |
| `exhibit-<name>` ×5 (Ajanta, Rani-ki-Vav, Konark, Haveli, Dholavira) | `meta`, `breadcrumb`, `intro` (+ `audio-guide`), `key-facts`, `story` (chapters), `nearby`, `on-the-timeline` |
| `timeline` | `meta`, `hero`, `eras` (9 era topics, each with `key-names` and `see-N` children), `note-on-dates` |
| `visit` | `meta`, `hero`, `essentials`, `tickets` (+ `booking` form), `routes`, `museum-map`, `first-visit`, `accessibility-and-directions`, `questions` |
| `learn` | `meta`, `hero`, `ways-to-learn` (cards + `ideas`) |
| `support` | `meta`, `hero`, `membership` (tiers), `adopt-an-exhibit` (Yajman levels), `legacy-passes`, `legacy-hall`, `more-ways-to-give` |
| `not-found` | `meta`, `message` |

Each document's `meta` topic holds the browser-tab title in its `title`.

## Pages

```json
{
 "path": "/ajanta/",
 "nav": "explore",
 "meta": "exhibit-ajanta-caves/meta",
 "headerStyle": "position:relative;background:var(--ink);color:var(--cream)",
 "components": [
  { "style": "site-header" },
  { "style": "breadcrumb", "topic": "exhibit-ajanta-caves/breadcrumb" },
  { "style": "exhibit-hero", "topic": "exhibit-ajanta-caves/intro", "settings": { "imagePosition": "center 30%" } },
  { "style": "key-facts", "topic": "exhibit-ajanta-caves/key-facts" },
  …
 ]
}
```

Each page is built in English at `path`, and at `/gu/…` and `/hi/…`. `src/pages.njk` walks the components in order and renders `src/_includes/components/<style>.njk` with the topic in the page's language. `settings` are presentation-only switches a style understands (`headingId`, `imagePosition`, `lazyImages`). `nav` is the menu item to highlight; `headerStyle` is how the header sits on that page.

### Component styles

| Style | Used on | What it shows from the topic |
| --- | --- | --- |
| `site-header` | every page but Home | (global `site` and `navigation`) |
| `home-hero` | Home | subheading, title, media[0] (image + caption), action, `secondary` child; includes the header |
| `today-strip` | Home | children: title + description, or title + action |
| `intro-split` | Home | subheading, title, description, children (title + description), action |
| `feature-cards` | Home | children: title, description, media, action |
| `stats-band` | Home | title; children: title (number) + subheading (label) |
| `timeline-teaser` | Home | subheading, title, description, media, action; children: title + subheading (date) + link |
| `quotes` | Home | subheading, title; children: description (quote), title (name), subheading (who) |
| `cta-band` | Home | title, description, action, `secondary` child |
| `page-hero` | Explore, Learn, galleries | subheading, title, description, media (background), optional action + `secondary` |
| `gallery-grid` | Explore | subheading, title, description; children: subheading (number), title, description, media, link |
| `breadcrumb` | galleries, exhibits | children: linked crumbs (action) and the current page (title) |
| `gallery-items`, `related-cards`, `nearby-cards` | galleries, exhibits | title, description or action; children as cards: subheading (kind), title, media, optional link |
| `exhibit-hero` | exhibits | subheading, title, description, media (image + caption); `audio-guide` child (title, description, action = play button label) |
| `key-facts` | exhibits | title (section label); children: title + description |
| `chapters` | exhibits | children = chapters: subheading ("CHAPTER 01"), title, description, optional action; or numbered children instead of text |
| `timeline-band` | exhibits | title (section label), subheading, description, action, `secondary` child |
| `learning-paths` | Learn | children with media = cards (id is the anchor, e.g. `#schools`); the child without media = idea chips |
| `timeline-hero`, `era-picker`, `era-panel`, `era-data`, `footnote` | Timeline | hero; era buttons (era title + subheading); the era panel; the era data for `js/timeline.js`; the dates note |
| `visit-hero`, `essentials`, `tickets`, `routes`, `floor-map`, `first-visit`, `access-directions`, `faq` | Visit | see each file; `tickets` also renders the `booking` child as the ticket form |
| `support-hero`, `membership-tiers`, `sponsorship-row`, `feature-split`, `legacy-hall`, `link-cards` | Support | see each file |
| `message` | 404 | subheading, title, description, action, `secondary` child |

## Mapping to WebNext

| WebNext | Here | Notes |
| --- | --- | --- |
| Document | a folder in `src/content/topics/` | folder name = document slug |
| Topic | a top-level topic file, or a child in its `topics` list | `id` is the stable key |
| Topic › Title | `title` | |
| Topic › Sub heading (≤100) | `subheading` | all current values are within 100 characters |
| Topic › Description (rich text, ≤2000) | `description` (HTML) | all within 2000; HTML inline tags only (`<p>`, `<a>`, `<mark>`, `<br>`, `<strong>`) |
| Topic › Media list (image/video, caption, alt) | `media[]` `{ type, src, alt, caption }` | `src` is a site path under `/images/`; upload the file and swap in the WebNext media reference |
| Topic › Action button (label + link) | `action` `{ label, link }` | `todo:` links need a real destination first |
| Topic › child topics | `topics[]` | same shape, nested |
| Topic › variations (en/gu/hi, English fallback) | the `gu` / `hi` objects in the file | sparse: only translated fields; children matched by `id` |
| Page | `src/content/pages/<page>.json` | `path` is the URL; `meta` points at the topic holding the page title |
| Page › component (style + topic) | `components[]` `{ style, topic }` | WebNext style names will differ; map ours to theirs once (table above) |

### Moving into WebNext (when there is a content API)

1. For each folder in `src/content/topics/`, create a Document with that slug.
2. For each topic file, create the Topic from `en` (title, sub heading, description, media, action), then its children recursively, keeping `id`s.
3. For `gu` and `hi`, create variations from the same files (only the fields present; the rest falls back).
4. Upload the images under `src/images/` and replace each `media[].src` with the uploaded asset.
5. For each page file, create the Page at `path` with one component per entry, mapping our `style` to the matching WebNext style and pointing it at the topic.
6. Bring across `strings/labels.json`, `strings/ui.json` and the hours (see below) wherever WebNext keeps site settings and interface translations.

## Structured data that isn't prose

| Data | Where it is | How it would map |
| --- | --- | --- |
| Opening hours, special dates, notices | `src/data/site-status.json` (Decap: "Opening hours & notices") | Not topics: read live by `js/status.js`. In WebNext this is a site setting or a small data source. Notices could become topics with a start/end date if WebNext supports scheduling. |
| Ticket types, prices, entry windows | `visit/tickets` › `booking` child topics (title = type, subheading = ages · price) | Placeholders today. A real booking system would own prices; the topics would keep only the labels. |
| Membership tiers | `support/membership` children: tier title, badge (subheading), a `price` child (title = price, subheading = "per year"), benefit children, action | Fits as topics; a price field would be cleaner if WebNext has one. |
| Yajman (sponsorship) levels | `support/adopt-an-exhibit` children: kind, name, amount (description), image, Enquire action | Fits as topics. |
| Timeline eras | `timeline/eras` children: title = name, subheading = dates, description = summary; `key-names` child; `see-N` children = where to see it (title, subheading = kind, description = floor, media, link) | Fits as topics. The era number is the position. Era text is plain text (the timeline script escapes it). |
| Museum in numbers | `home/in-numbers` children: title = number, subheading = label | Fits as topics. |
| Legacy Hall sponsor list | `src/data/legacy-hall-sample.json` (sample data, unchanged) | A data source, not topics. |

## What doesn't fit the WebNext model cleanly

- **Two buttons.** A topic has one action. Where a section has a second button (heroes, the membership band, the 404 page, the exhibit timeline band), it's a child topic with id `secondary` that has only an action.
- **Interface text isn't content.** Screen-reader labels, form placeholders, the ticket counter's − / + / 0, the cookie prompt and the opening-hours wording are in `strings/labels.json` and `strings/ui.json`, not topics. WebNext presumably translates these in the theme or site settings.
- **Section names.** A section that has no visible heading (Key facts, Today at the museum, the exhibit timeline band) uses its topic `title` as the screen-reader name. Where a section has a visible heading *and* a different screen-reader name (Home "Welcome", "The museum in numbers"; footer "Visit and learn"), the name is a label in `strings/labels.json`.
- **Page titles.** Kept in a `meta` topic per document; WebNext pages likely have their own SEO title field.
- **Component settings.** `headingId`, `imagePosition` (Ajanta's photo is framed "center 30%") and `lazyImages` are presentation switches on the component, not content.
- **Inline HTML in text.** 273 `<mark class="todo">` placeholders, and three strings with inline link styles (the phone link in the footer address, the Mandir link in the footer, the audio-guide "Transcript" link). These need tidying when the real content goes in.
- **Repeated card text.** The "Nearby" and "Other galleries" cards repeat each exhibit's name, kind and image description on every page that shows them, as in v5 (some translations differ page to page). A later clean-up could make them references to one shared card topic per exhibit, if WebNext supports topic references.
- **The ticket form** is an app (a booking widget), modelled as topics only so its labels are editable. In WebNext it would probably be an embed.
- **Breadcrumbs and menus** are topics here (lists of actions). WebNext may generate these from the page tree.
- **Membership tiers' blank badge.** Tiers without a "Most popular" badge get an invisible spacer from the style, not from the content.

## Editing (Decap CMS at /admin/)

- **Text — <document>**: one collection per document; each entry is a topic with English, Gujarati and Hindi side by side. Child topics are nested lists. Leave a Gujarati or Hindi field empty to show English.
- **Interface text**: labels and script wording, in three languages.
- **Page layouts**: the component list of each page (structure; change with care).
- **Opening hours & notices**: as in v5.

`npm run cms-config` regenerates `src/admin/config.yml` after adding a document, a component style or a label. `npm run translations` lists anything not yet translated.

## How this was made and checked

`scripts/migrate-v5-content.mjs` converted the v5 text files (flat numbered keys per page and language) into these files. It places every one of the v5 keys and stops on any it doesn't recognise. Where v5 had one string in two places with different translations (the audio-guide button and the exhibit timeline band in Gujarati/Hindi), each page kept its own.

The v5 and v6 builds were compared page by page (`/`, `/gu/`, `/hi/` and every page, 49 files, both the normal build and the review-preview build): the HTML is identical apart from whitespace between tags.
