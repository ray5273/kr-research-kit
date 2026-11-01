// Shared [red:]/[blue:]/[brown:] tone markers used by the Naver publisher and
// the kr-research-site renderer, so both outputs carry the same legend.
const COLOR_PALETTE = { red: "#d93025", blue: "#1a73e8", brown: "#8a5a2b" };
const COLOR_LEGEND_TEXT = "색상 안내 — 빨간색: 좋은 것 · 파란색: 안 좋은 의견 · 갈색: 추측성 의견";
const COLOR_LEGEND_MARKDOWN = "색상 안내 — [red: 빨간색: 좋은 것] · [blue: 파란색: 안 좋은 의견] · [brown: 갈색: 추측성 의견]";
const COLOR_MARKER_PATTERN = /\[(?:red|blue|brown):\s*[^\]]+\]/;
const COLOR_MARKER_GLOBAL = /\[(red|blue|brown):\s*([^\]]+)\]/g;

function markdownVisibleText(markdown) {
  return String(markdown || "").replace(/\[(?:red|blue|brown):\s*([^\]]+)\]/g, "$1");
}

function withColorLegend(markdown) {
  const source = String(markdown || "");
  if (!COLOR_MARKER_PATTERN.test(source) || markdownVisibleText(source).includes(COLOR_LEGEND_TEXT)) return source;
  const eol = source.includes("\r\n") ? "\r\n" : "\n";
  const title = source.match(/^#\s+.+?[ \t]*(?:\r?\n|$)/m);
  if (!title) return `${COLOR_LEGEND_MARKDOWN}${eol}${eol}${source.replace(/^(?:\r?\n)+/, "")}`;
  const titleEnd = title.index + title[0].length;
  const before = source.slice(0, titleEnd).replace(/\r?\n$/, "");
  const after = source.slice(titleEnd).replace(/^(?:\r?\n)+/, "");
  return `${before}${eol}${eol}${COLOR_LEGEND_MARKDOWN}${eol}${eol}${after}`;
}

module.exports = {
  COLOR_LEGEND_MARKDOWN,
  COLOR_LEGEND_TEXT,
  COLOR_MARKER_GLOBAL,
  COLOR_MARKER_PATTERN,
  COLOR_PALETTE,
  markdownVisibleText,
  withColorLegend,
};
