// Scroll-to-text fragment for a review View link.
// `text` is the exact phrase as it renders on the page, or [start, end] for a longer passage.
export function textFragment(text) {
  if (text == null || text === "") return "";
  const parts = Array.isArray(text) ? text : [text];
  if (parts.length === 0 || parts.length > 2 || parts.some((p) => typeof p !== "string" || p === "")) return "";
  return "#:~:text=" + parts.map((p) => encodeURIComponent(p)).join(",");
}
