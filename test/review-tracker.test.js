import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const data = JSON.parse(fs.readFileSync("src/content/review-tracker.json", "utf8"));
const round1 = data.rounds.find((round) => round.n === 1);
const round2 = data.rounds.find((round) => round.n === 2);
const items = round1.items;

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
  assert.equal(round1.title, "Round 1: Oct 28 comments");
  assert.equal(round1.by, "Yoganand Swami");
  assert.equal(round1.date, "Oct 28");
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

test("round 2 records the Nov 1 comments", () => {
  const intro = "The Akshardham Museum is a one-of-a-kind cultural experience. Across three floors, lifelike scenes and grand replicas immerse us in India and Hinduism.";
  assert.equal(round2.title, "Round 2: Nov 1 comments");
  assert.equal(round2.by, "Yoganand Swami");
  assert.equal(round2.date, "Nov 1, 2026");
  assert.equal(round2.items.length, 2);
  assert.equal(round2.items[0].change, "Hero heading and subtext");
  assert.equal(round2.items[0].status, "Updated");
  assert.match(round2.items[0].after, /^Thousands of years of Hindu Dharma under one roof\n/);
  assert.match(round2.items[0].after, new RegExp(intro.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$"));
  assert.equal(round2.items[1].change, "Intro heading");
  assert.equal(round2.items[1].status, "Updated");
  assert.match(round2.items[1].before, /TELLING OUR STORY, OUR WAY/);
  assert.match(round2.items[1].after, /Authentic and Awe-Inspiring\nLearn about authentic Hinduism from expert sources\./);
  for (const item of round2.items) {
    assert.equal(item.page, "Home");
    assert.equal(item.view.length, 1);
    assert.equal(item.view[0].href, "");
  }
});

test("home intro paragraph includes Hinduism in each language", () => {
  const about = JSON.parse(fs.readFileSync("src/content/topics/home/about.json", "utf8"));
  assert.equal(
    about.en.description,
    "The Akshardham Museum is a one-of-a-kind cultural experience. Across three floors, lifelike scenes and grand replicas immerse us in India and Hinduism.",
  );
  assert.match(about.gu.description, /ભારત અને હિંદુ ધર્મમાં/);
  assert.match(about.hi.description, /भारत और हिंदू धर्म में/);
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
