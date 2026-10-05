# Akshardham Museum – static site

Plain HTML/CSS/JS extracted from the design-tool export `../Akshardham Museum Website.html`. There's no build step.

## Routes
Each page is a folder with an `index.html`, so the URLs stay clean on any static host:

| URL | File |
| --- | --- |
| `/` | `index.html` |
| `/explore` | `explore/index.html` (Four ways into India, featured replica) |
| `/learn` | `learn/index.html` (school visits, young explorers, ideas) |
| `/ajanta` | `ajanta/index.html` |
| `/timeline` (`/timeline#era-01` … `#era-09` opens an era) | `timeline/index.html` |
| `/visit` | `visit/index.html` |
| `/support` | `support/index.html` |
| anything else | `404.html` |

Links and asset paths are root-relative (`/visit#tickets`, `/css/site.css`), so the site must be served from the domain root. Most hosts (GitHub Pages, Netlify, Cloudflare Pages, nginx/Apache) serve `/ajanta` with or without the trailing slash and use `404.html` automatically.

## Preview locally
Opening the files directly (file://) won't resolve root paths. Serve the folder instead:

```
cd site
python3 -m http.server 8000
```

Then visit http://localhost:8000. Python's server doesn't use `404.html`; real hosts do.

## Files
- `css/site.css` holds the palette (CSS variables), shared rules and responsive breakpoints (1024px, 640px). `css/fonts.css` is self-hosted fonts.
- `js/site.js` runs the mobile menu and stops the demo forms from submitting. `js/timeline.js` runs the era picker.
- Page layout is mostly inline `style="…"` attributes carried over from the design.

## Interaction layer (iteration 2)
`css/play.css` and `js/play.js` add the motion and interactivity on top of the base pages: scroll reveals, sticky header, Ken Burns hero, counting stats, idea chips, Ajanta hotspots and chapter nav, the working ticket form, floor tabs, FAQ accordion and the Legacy Hall search. Remove those two files and the pages fall back to the static v1 behaviour. All motion is switched off for visitors who set "reduce motion".

- The idea-chip meanings on the home page (`data-meaning` in `index.html`) are draft copy. Please review.
- `data/legacy-hall-sample.json` is **sample data**, not real sponsors. Replace it before launch.

## Compact layout (iteration 3)
`css/compact.css` and `js/compact.js` cut vertical scrolling:
- On phones, card groups become swipe rows, and short items sit two to a row.
- On the Visit page, First visit, Accessibility & getting here, and Questions are tabs.
- Section padding, gaps, hero heights and image ratios are tightened in the HTML.
- In `js/play.js`, the Ajanta chapters are tabs with previous/next buttons.

## Cookie consent
`js/consent.js` and `css/consent.css` show a banner on the first visit (Accept all / Reject non-essential / Manage settings). "Cookie settings" in the footer reopens it.
- The choice is saved in localStorage (`museum-consent`) with a policy `VERSION`. Raise `VERSION` in `js/consent.js` whenever the cookie policy changes, so everyone is asked again.
- The site currently sets **no non-essential cookies**. Any analytics or marketing script added later must wait for consent. Add it like this and it only runs once that category is allowed:
  `<script type="text/plain" data-consent="analytics" src="https://…"></script>`
  In code, use `window.cookieConsent.allows('analytics')` or listen for the `cookieconsent` event on `document`.
- The banner's "Privacy policy" link is a placeholder until there is a privacy page.

## Still to do
- Placeholder content is wrapped in `<mark class="todo">` (highlighted yellow). Search for `class="todo"`.
- Links with no destination yet have `class="todo-link"` and a `data-todo` note. Many other links are plain `href="#"`.
- Forms (tickets, newsletter, sponsor search) have no backend.
