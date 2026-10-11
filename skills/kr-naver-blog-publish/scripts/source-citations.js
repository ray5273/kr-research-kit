// Keep evidence links at the end of a stock post, with short references in prose.
const LINK = /(?<!!)\[([^\]]+)]\((https?:\/\/[^)]+)\)/g;
const BARE_URL = /https?:\/\/[^\s)]+/g;

function normalizeSourceCitations(markdown) {
  const lines = markdown.split(/\r?\n/);
  const headingIndex = lines.findIndex(line => /^##\s+(?:출처|Sources)(?:\s|$)/i.test(line));
  const sourceEnd = headingIndex < 0 ? -1 : lines.findIndex((line, index) => index > headingIndex && (/^##\s+/.test(line) || /^---+\s*$/.test(line)));
  const endIndex = sourceEnd < 0 ? lines.length : sourceEnd;
  const terminalIndex = lines.findIndex((line, index) => index >= endIndex && /^---+\s*$/.test(line));
  const bodyLines = headingIndex < 0 ? lines : [
    ...lines.slice(0, headingIndex),
    ...lines.slice(endIndex, terminalIndex < 0 ? lines.length : terminalIndex),
  ];
  const sourceLines = headingIndex < 0 ? [] : lines.slice(headingIndex + 1, endIndex);
  const suffixLines = headingIndex < 0 || terminalIndex < 0 ? [] : lines.slice(terminalIndex);
  const sources = [];
  const byUrl = new Map();
  function add(url, label) {
    if (!byUrl.has(url)) {
      byUrl.set(url, sources.length + 1);
      sources.push({ url, label: label.trim() || new URL(url).hostname });
    }
    return byUrl.get(url);
  }

  // A previously normalized post retains its citation numbers on repeat runs.
  if (sourceLines.some(line => /^\s*\d+\.\s+\[/.test(line))) return markdown;

  const body = bodyLines.join("\n").replace(LINK, (_match, label, url) => `[${add(url, label)}]`);
  for (const line of sourceLines) {
    let matched = false;
    for (const match of line.matchAll(LINK)) {
      add(match[2], match[1]);
      matched = true;
    }
    if (matched) continue;
    for (const match of line.matchAll(BARE_URL)) {
      const url = match[0].replace(/[.,;]+$/, "");
      const label = line.slice(0, match.index).replace(/^\s*(?:[-*]|\d+\.)\s*/, "").replace(/(?:Source|출처)\s*[:：]\s*$/i, "").trim();
      add(url, label);
    }
  }
  if (!sources.length) return markdown;
  const entries = sources.map((source, index) => `${index + 1}. [${source.label}](${source.url})`);
  return [body.trimEnd(), "", "## 출처", "", ...entries, "", ...suffixLines].join("\n");
}

module.exports = { normalizeSourceCitations };
