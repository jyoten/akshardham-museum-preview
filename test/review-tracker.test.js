import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { textFragment } from "../lib/text-fragment.js";

// New text is on the preview page, so the View link can highlight it.
const HIGHLIGHT = new Set([1, 2, 3, 4, 5, 6, 11, 12, 13, 14, 16, 17, 19, 20, 21, 22, 23, 26, 29, 31, 32, 34]);

const data = JSON.parse(fs.readFileSync("src/content/review-tracker.json", "utf8"));
const items = data.items;

const UPDATED = [1, 2, 3, 4, 5, 6, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 26, 27, 28, 29, 30, 31, 32, 33, 34];
const PARTLY = [9];
const DISCUSS = [7, 24, 25, 35];
const NOT_NEEDED = [8];
const PATHS = new Set([
  "",
  "explore/",
  "explore/lifelike-scenes/",
  "explore/legacy-architecture/",
  "explore/walking-into-scripture/",
  "explore/living-tapestry/",
  "ajanta/",
  "explore/rani-ki-vav/",
  "explore/konark-wheel/",
  "explore/haveli/",
  "explore/dholavira-bazaar/",
  "learn/",
  "support/",
  "privacy/",
]);
const STATUS = {
  Updated: new Set(UPDATED),
  "Partly updated": new Set(PARTLY),
  "To discuss Saturday": new Set(DISCUSS),
  "Not needed": new Set(NOT_NEEDED),
};

test("review tracker lists the 35 comments with the agreed status", () => {
  assert.equal(items.length, 35);
  assert.deepEqual(items.map((item) => item.n), Array.from({ length: 35 }, (_, i) => i + 1));
  assert.equal(data.previewBase, "https://jyoten.github.io/akshardham-museum-preview/previews/pr-1/");
  for (const item of items) {
    const expected = Object.entries(STATUS).find(([, set]) => set.has(item.n));
    assert.ok(expected, `item ${item.n} has no expected status`);
    assert.equal(item.status, expected[0], `item ${item.n}`);
    assert.equal(typeof item.page, "string");
    assert.equal(typeof item.change, "string");
    assert.equal(typeof item.before, "string");
    assert.equal(typeof item.after, "string");
    if (item.view == null) {
      assert.ok([24, 25].includes(item.n), `item ${item.n} should have a view link`);
    } else {
      assert.ok(item.view.length > 0);
      for (const link of item.view) assert.ok(PATHS.has(link.href), `${item.n} ${link.href}`);
    }
  }
});

test("View links carry a text fragment only where the new words are on the page", () => {
  assert.equal(textFragment("All replicas"), "#:~:text=All%20replicas");
  assert.equal(
    textFragment(["Rani-ki-Vav stepwell, 11th-century", "Gujarat"]),
    "#:~:text=Rani-ki-Vav%20stepwell%2C%2011th-century,Gujarat",
  );
  assert.equal(textFragment(["scenes from India\u2019s past", "done"]), "#:~:text=scenes%20from%20India%E2%80%99s%20past,done");
  assert.equal(textFragment(null), "");

  for (const item of items) {
    if (item.view == null) {
      assert.equal(HIGHLIGHT.has(item.n), false);
      continue;
    }
    for (const link of item.view) {
      if (!HIGHLIGHT.has(item.n)) {
        assert.equal(link.text, undefined, `item ${item.n} ${link.href}`);
        continue;
      }
      const parts = Array.isArray(link.text) ? link.text : [link.text];
      assert.ok(parts.length === 1 || parts.length === 2, `item ${item.n}`);
      for (const part of parts) {
        assert.equal(typeof part, "string");
        const words = part.split(/\s+/);
        assert.ok(words.length >= 2 && words.length <= 8, `item ${item.n} ${part}`);
      }
      const frag = textFragment(link.text);
      const decoded = frag.slice("#:~:text=".length).split(",").map(decodeURIComponent);
      assert.deepEqual(decoded, parts, `item ${item.n} ${link.href}`);
    }
  }
});

test("photo tracker lists updated pictures and the ones still to come", () => {
  const photos = data.photos;
  assert.equal(data.liveBase, "https://jyoten.github.io/akshardham-museum-preview/");
  assert.equal(data.liveBase.includes("/previews/"), false);
  assert.deepEqual(data.photoStatuses, ["Updated", "Waiting for photos", "Not needed"]);
  assert.equal(photos.length, 25);
  assert.deepEqual(photos.map((item) => item.n), Array.from({ length: 25 }, (_, i) => i + 1));

  const updated = photos.filter((item) => item.status === "Updated");
  const waiting = photos.filter((item) => item.status === "Waiting for photos");
  const notNeeded = photos.filter((item) => item.status === "Not needed");
  assert.deepEqual(updated.map((item) => item.n), [...Array.from({ length: 14 }, (_, i) => i + 1), 24, 25]);
  assert.deepEqual(waiting.map((item) => item.change), [
    "Hero",
    "Rishis statues",
    "Scholars diorama",
    "Scripture panels",
    "Festival street",
    "Performing arts gallery",
    "Cosmos theater",
    "Young visitor with carved model",
  ]);
  assert.deepEqual(notNeeded.map((item) => ({ n: item.n, change: item.change, note: item.note })), [
    { n: 22, change: "Timeline corridor", note: "Timeline page to be removed; Privacy and Visit now use a museum photo" },
  ]);
  const byN = Object.fromEntries(photos.map((item) => [item.n, item]));
  assert.equal(byN[24].page, "Privacy");
  assert.equal(byN[24].change, "Hero");
  assert.equal(byN[24].before, "/review/photos/timeline-corridor.jpg");
  assert.equal(byN[24].after, "/images/konark-wheels.jpg");
  assert.equal(byN[24].view, "privacy/#photo-hero");
  assert.equal(byN[25].page, "Visit");
  assert.equal(byN[25].change, "Full journey");
  assert.equal(byN[25].before, "/review/photos/timeline-corridor.jpg");
  assert.equal(byN[25].after, "/images/haveli-street.jpg");
  assert.equal(byN[25].view, "visit/#photo-full-journey");
  assert.equal(JSON.parse(fs.readFileSync("src/content/topics/home/timeline.json", "utf8")).en.media[0].src, "/images/timeline-corridor.jpg");
  assert.equal(JSON.parse(fs.readFileSync("src/content/topics/timeline/hero.json", "utf8")).en.media[0].src, "/images/timeline-corridor.jpg");

  const views = new Set();
  for (const item of photos) {
    assert.equal(views.has(item.view), false, `duplicate view ${item.view}`);
    views.add(item.view);
    assert.match(item.view, /^(?:[a-z0-9/-]+)?#photo-[a-z0-9-]+$/);
    assert.equal(item.view.includes("previews"), false);
    const pageText = `${item.page} ${item.change} ${item.status}`;
    for (const bad of ["github", "pull request", "admin"]) {
      assert.equal(pageText.toLowerCase().includes(bad), false, `${item.n} ${bad}`);
    }
    if (item.status === "Updated") {
      assert.match(item.before, /^\/review\/photos\/[a-z0-9-]+\.jpg$/);
      assert.match(item.after, /^\/images\/[a-z0-9-]+\.jpg$/);
      const earlier = fs.readFileSync(item.before.replace("/review/photos/", "src/review-photos/"));
      const current = fs.readFileSync(item.after.replace("/images/", "src/images/"));
      assert.equal(earlier.subarray(0, 3).toString("hex"), "ffd8ff");
      assert.ok(earlier.length < 180000, `${item.before} is ${earlier.length} bytes`);
      assert.equal(earlier.equals(current), false, item.before);
    } else if (item.status === "Not needed") {
      assert.equal(item.after, undefined);
      assert.equal(typeof item.note, "string");
      assert.match(item.before, /^\/images\/[a-z0-9-]+\.jpg$/);
      assert.equal(fs.existsSync(item.before.replace("/images/", "src/images/")), true);
    } else {
      assert.equal(item.status, "Waiting for photos");
      assert.equal(item.after, undefined);
      assert.equal(item.note, undefined);
      assert.match(item.before, /^\/images\/[a-z0-9-]+\.jpg$/);
      assert.equal(fs.existsSync(item.before.replace("/images/", "src/images/")), true);
    }
  }
});

test("corrected wording is in the new text", () => {
  const byN = Object.fromEntries(items.map((item) => [item.n, item.after]));
  assert.match(byN[11], /Maharashtra mountain over two thousand years ago/);
  assert.match(byN[16], /hundreds of sculptures/);
  assert.match(byN[20], /courtyards that keep the house cool and private/);
  for (const item of items) {
    for (const bad of ["Maharasthra", "two thousands", "scultpures", "the the"]) {
      assert.equal(item.after.includes(bad), false, `item ${item.n} after includes ${bad}`);
    }
  }
});
