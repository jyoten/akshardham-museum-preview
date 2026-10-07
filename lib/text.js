// The build's copy of the text rules in lib/text-core.js (Markdown via markdown-it).
import MarkdownIt from "markdown-it";
import { createText } from "./text-core.js";

export const { escText, escAttr, markPlaceholders, plainText, richText } = createText(MarkdownIt);
