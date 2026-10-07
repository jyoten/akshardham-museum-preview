# Updating the site without code

Everything an admin changes lives in the **admin** at `/admin/` (Decap CMS): opening hours, special dates, notices and all the text on the site, in English, Gujarati and Hindi.

## Change the regular hours
1. Open `/admin/` and sign in.
2. **Opening hours & notices** → **Opening hours & notices**.
3. Under **Regular weekly hours**, open a day, set **Opens** and **Closes**, or tick **Closed all day**.
4. Untick **These are sample hours** once the real hours are in (this removes the yellow highlight).
5. Click **Publish** → **Publish now**.

The "Open today / Closed now" status on every page, and the hours list on Plan your visit, update from this.

## Close for a day, or open different hours (holidays, special events)
1. Same screen → **Special dates** → **Add special date**.
2. Pick the **Date**. Tick **Closed all day**, or untick it and set **Opens** / **Closes**.
3. Optional **Note**, e.g. "Closed for Thanksgiving". It shows next to the status that day.
4. **Publish** → **Publish now**.

Special dates override the regular hours for that day only. Old ones can be left in or deleted.

## Show a notice (weather closure, parking changes, special hours…)
1. Same screen → **Notices** → **Add notice**.
2. **Short name**: anything without spaces, e.g. `snow-closure-jan-12`.
3. **Type**: *Information* (dark), *Warning* (gold) or *Closure* (saffron).
4. **Message (English)**, plus Gujarati and Hindi if you have them (otherwise the English message shows on those pages).
5. Optional **Link** (e.g. `/visit/`) and **Link text**.
6. Optional **Show from** / **Show until** (museum time, New York). Leave both empty to show it straight away until you switch it off.
7. Make sure **Show this notice** is on → **Publish** → **Publish now**.

The bar appears at the top of every page. Visitors can close it; they won't see that notice again unless you change its message. To take it down, switch **Show this notice** off (or delete it) and publish.

Hours and notices are read by the browser when the page loads, so they show up as soon as the change is deployed. No rebuild of the pages is needed.

## Edit text or add a translation
1. **Text — …** → pick the part of the site (e.g. *Text — Plan your visit*), then the topic (e.g. `tickets`). Each entry is one section of a page: its title, sub heading, description, images, button and child topics (cards, list items, questions).
2. The English, Gujarati and Hindi versions sit side by side. Edit and **Publish**.
3. In Gujarati and Hindi, a field left **empty** shows the English text on the site. Fill it in to translate it.
4. Some fields contain little tags like `<mark class="todo">[X]</mark>`, `<p>…</p>` or `<a href="/visit">…</a>`. Keep the tags and change only the words between them.
5. Screen-reader labels, form placeholders and the cookie prompt are under **Interface text**.

To see what still needs translating: `npm run translations` (add `--keys` for the exact fields).

Text changes are built into the pages, so they appear after the next build/deploy (a minute or two on a host such as GitHub Pages or Netlify).

---

## Setting it up for real (one-time, for whoever hosts the site)
See **SECURITY.md**: the sign-in service in `auth/`, the GitHub token it uses, protecting the `main` branch so every change needs a review, and adding editors.

Changes made in the admin become **pull requests**. In the admin, save a draft, then set it to *In review* and *Ready*; someone with merge rights reviews and publishes it (in the admin's **Workflow** tab, or on GitHub). Each pull request is checked automatically (`npm run check-content`) before it can be merged.

## Trying the admin on your own computer
```
npm install
npm run dev        # site at http://localhost:8090, admin at http://localhost:8090/admin/
npm run cms        # in a second terminal: lets the admin save files without signing in
```
