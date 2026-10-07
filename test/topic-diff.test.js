import { test } from "node:test";
import assert from "node:assert/strict";
import { wordDiff, topicChanges, readable, languagesOf } from "../src/admin/topic-diff.js";

const topic = () => ({
  en: { id: "about", title: "Telling our story, our way", description: "One **museum** with [many rooms](/visit).", media: [{ src: "/images/a.jpg", alt: "A hall" }], action: { label: "Read more", link: "/about" },
    topics: [{ id: "kids", title: "For our children", description: "Pride and belonging" }] },
  gu: { title: "અમારી વાર્તા", topics: [{ id: "kids", title: "અમારાં બાળકો માટે" }] },
});

test("word diff marks removed and added words", () => {
  assert.deepEqual(wordDiff("most of your day.", "most of your visit."), [
    { type: "same", text: "most of your " }, { type: "del", text: "day" }, { type: "add", text: "visit" }, { type: "same", text: "." },
  ]);
  assert.deepEqual(wordDiff("same", "same"), [{ type: "same", text: "same" }]);
  assert.deepEqual(wordDiff("", "new"), [{ type: "add", text: "new" }]);
});

test("unchanged topic: no changes", () => {
  assert.deepEqual(topicChanges(topic(), topic()), []);
});

test("an English edit is reported once, with the field and its words", () => {
  const after = topic();
  after.en.title = "Telling our story, in our own way";
  const c = topicChanges(topic(), after);
  assert.equal(c.length, 1);
  assert.equal(c[0].language, "English");
  assert.equal(c[0].label, "Title");
  assert.deepEqual(c[0].parts.filter((p) => p.type !== "same").map((p) => p.type + ":" + p.text), ["add:in ", "add:own "]);
});

test("Gujarati and Hindi: own edits are reported; English fallbacks aren't repeated", () => {
  const after = topic();
  after.gu.topics[0].title = "આપણાં બાળકો માટે";
  after.en.description = "One **museum** with [many galleries](/visit).";
  const c = topicChanges(topic(), after);
  assert.deepEqual(c.map((x) => `${x.language}: ${x.label}`), ["English: Description", "Gujarati: “For our children” › Title"]);
  assert.equal(c[0].before, "One **museum** with many rooms.", "links read as their words");
  assert.equal(languagesOf(c), "English and Gujarati");
});

test("new and removed topics", () => {
  assert.ok(topicChanges(null, topic()).some((c) => c.label === "Title" && c.before === "" && c.after === "Telling our story, our way"));
  assert.ok(topicChanges(topic(), null).every((c) => c.after === ""));
  assert.equal(readable("[a](/x) b\\\nc"), "a b\nc");
});
