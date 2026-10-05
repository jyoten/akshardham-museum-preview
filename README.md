# Akshardham Museum – static site

Plain HTML/CSS/JS extracted from the design-tool export `../Akshardham Museum Website.html`. There's no build step.

## Routes
Each page is a folder with an `index.html`, so the URLs stay clean on any static host:

| URL | File |
| --- | --- |
| `/` | `index.html` |
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

## Still to do
- Placeholder content is wrapped in `<mark class="todo">` (highlighted yellow). Search for `class="todo"`.
- Links with no destination yet have `class="todo-link"` and a `data-todo` note. Many other links are plain `href="#"`.
- Forms (tickets, newsletter, sponsor search) have no backend.
