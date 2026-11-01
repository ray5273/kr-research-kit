#!/usr/bin/env node

// Build the public research site from opt-in memos listed in site/published.json.
// Output is a static directory (default site-dist/) with article pages, list
// pages, sitemap.xml, feed.xml, robots.txt, llms.txt, llms-full.txt, urls.json
// and — only when adsense.client is configured — ads.txt and ad slots.

const {related, neighbors} = require("./discovery");
const {shareCard} = require("./share-card");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const NAVER_SCRIPTS = path.resolve(__dirname, "..", "..", "kr-naver-blog-publish", "scripts");
function requireNaver(name) {
  try {
    return require(path.join(NAVER_SCRIPTS, name));
  } catch (error) {
    throw new Error(`kr-research-site needs kr-naver-blog-publish installed next to it (${name}): ${error.message}`);
  }
}
const {
  EXCLUDED_SECTIONS,
  HEADING_MAP,
  cleanInternalLinks,
  deriveIssue,
  normalizeHeading,
  parseMarkdownTableBlock,
  parseMetadata,
  parseSections,
  stripLeadingMetadataLines,
} = requireNaver("memo-to-post");
const { COLOR_MARKER_PATTERN, markdownVisibleText } = requireNaver("color-markers");

const TEMPLATE_DIR = path.resolve(__dirname, "..", "templates");
const DEFAULT_DISCLAIMER = "본 글은 공개된 자료를 바탕으로 작성한 개인 리서치이며, 특정 종목의 매수·매도를 권유하지 않습니다. 투자 판단과 그 결과에 대한 책임은 투자자 본인에게 있습니다. 이 글은 AI 도구의 보조를 받아 작성했으며, 작성 방식은 소개 페이지에 공개합니다.";
const MARKET_LABELS = { kr: "한국 주식", us: "미국 주식", sector: "섹터·산업", global: "해외 주식", cn: "중국 주식" };
const MARKET_SHORT = { kr: "한국", us: "미국", sector: "섹터", global: "해외", cn: "중국" };
const STANCES = { pos: ["pos", "긍정"], 긍정: ["pos", "긍정"], neu: ["neu", "중립"], 중립: ["neu", "중립"], neg: ["neg", "부정"], 부정: ["neg", "부정"] };
const TONE_CLASS = { red: "tone-pos", blue: "tone-neg", brown: "tone-spec" };
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/;
const ANSWER_HEADING = "@@answer@@";
const UPDATES_HEADING = "업데이트 내역";
const SOURCES_HEADING = "출처";

// Holdings, the decision ledger and the private voice corpus must never reach
// the public site (same guard as kr-chatgpt-review).
const PRIVATE_CONTENT_RX = /decision-ledger|ledger\.ndjson|portfolio\.json|holdings\.json|voice-profile\.md|voice-metrics\.json|stock-analysis-private|folio-private|KR_PORTFOLIO_GUARD_HOME/i;

// ---------- small utilities ----------

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith("--")) throw new Error(`Unexpected argument: ${key}`);
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) { args[key.slice(2)] = true; continue; }
    args[key.slice(2)] = value;
    i += 1;
  }
  return args;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeXml(value) {
  return escapeHtml(value);
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function fill(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key) => (vars[key] ?? ""));
}

function jsonLdScript(value) {
  return `<script type="application/ld+json">${JSON.stringify(value).replace(/</g, "\\u003c")}</script>`;
}

// Strip markdown syntax for meta descriptions, llms.txt and JSON-LD text.
function plainText(markdown) {
  return markdownVisibleText(String(markdown || ""))
    .replace(/⟦cite:\d+⟧/g, "")
    .replace(/!\[([^\]]*)]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*(?:[-*+]|\d+\.)\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(text, max) {
  const chars = [...text];
  if (chars.length <= max) return text;
  return `${chars.slice(0, max - 1).join("").trimEnd()}…`;
}

function isoKst(date) {
  return `${date}T09:00:00+09:00`;
}

function pngSize(buffer) {
  if (buffer.length < 24 || buffer.toString("ascii", 1, 4) !== "PNG") return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

// ---------- safety: opt-in, tracked, non-private ----------

function loadEnvFile(root) {
  const envPath = path.join(root, ".env");
  if (!fs.existsSync(envPath)) return;
  for (const raw of fs.readFileSync(envPath, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const name = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!(name in process.env)) process.env[name] = value;
  }
}

function privateRoots() {
  const roots = [path.join(os.homedir(), "stock-analysis-private"), path.join(os.homedir(), "folio-private")];
  if (process.env.KR_PORTFOLIO_GUARD_HOME) roots.unshift(path.resolve(process.env.KR_PORTFOLIO_GUARD_HOME));
  return roots;
}

function isInside(child, parent) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function createSafety({ root, requireTracked }) {
  const realRoot = fs.realpathSync(root);
  const roots = privateRoots().map(dir => (fs.existsSync(dir) ? fs.realpathSync(dir) : dir));
  const guardHome = process.env.KR_PORTFOLIO_GUARD_HOME ? path.resolve(process.env.KR_PORTFOLIO_GUARD_HOME) : null;

  function checkPath(filePath, label) {
    assert(fs.existsSync(filePath), `${label} not found: ${filePath}`);
    const real = fs.realpathSync(filePath);
    assert(!roots.some(dir => isInside(real, dir)), `${label} is inside a private directory and cannot be published: ${filePath}`);
    assert(isInside(real, realRoot), `${label} is outside the repository and cannot be published: ${filePath}`);
    if (requireTracked) {
      const relative = path.relative(realRoot, real);
      try {
        execFileSync("git", ["-C", realRoot, "ls-files", "--error-unmatch", "--", relative], { stdio: "ignore" });
      } catch {
        throw new Error(`${label} is not tracked by git; commit it before publishing: ${relative}`);
      }
    }
    return real;
  }

  function checkContent(text, label) {
    const match = text.match(PRIVATE_CONTENT_RX);
    assert(!match, `${label} references private holdings/ledger data (${match?.[0]}); refusing to publish`);
    if (guardHome) assert(!text.includes(guardHome), `${label} references KR_PORTFOLIO_GUARD_HOME; refusing to publish`);
  }

  return { checkPath, checkContent };
}

// ---------- citations ----------

const LINK_RX = /(?<!!)\[([^\]]+)]\((https?:\/\/[^)\s]+)\)/g;
const BARE_URL_RX = /https?:\/\/[^\s)<>]+/g;

// Keep the link label in prose and add a numbered footnote marker; numbering
// follows first appearance in the body, then the remaining Sources entries.
function collectCitations(bodyMarkdown, sourceLines) {
  const sources = [];
  const byUrl = new Map();
  function add(url, label) {
    if (!byUrl.has(url)) {
      let fallback = url;
      try { fallback = new URL(url).hostname; } catch {}
      byUrl.set(url, sources.length + 1);
      sources.push({ url, label: String(label || "").trim() || fallback });
    }
    return byUrl.get(url);
  }
  // Preserve explicitly numbered references before URL citations are renumbered.
  // Protect inline/fenced code and numeric labels on actual Markdown links.
  const referenceUrls = new Map();
  for (const line of sourceLines) {
    const id = line.match(/^\s*(\d+)\.\s+/)?.[1];
    const link = [...line.matchAll(LINK_RX)][0];
    if (id && link) referenceUrls.set(id, { url: link[2], label: link[1] });
  }
  const referenced = bodyMarkdown.replace(/(```[\s\S]*?```|`[^`\n]+`)|(?<!!)\[(\d+)\](?!\()/g, (match, code, id) => {
    if (code || !referenceUrls.has(id)) return match;
    return `⟦source:${id}⟧`;
  });
  const body = referenced.replace(/⟦source:(\d+)⟧|(?<!!)\[([^\]]+)]\((https?:\/\/[^)\s]+)\)/g, (_match, id, label, url) => {
    if (id) {
      const source = referenceUrls.get(id);
      return `⟦cite:${add(source.url, source.label)}⟧`;
    }
    return `${label}⟦cite:${add(url, label)}⟧`;
  });
  for (const line of sourceLines) {
    let matched = false;
    for (const match of line.matchAll(LINK_RX)) {
      // The Sources entry usually carries the fuller label (publisher + date).
      const number = add(match[2], match[1]);
      if (match[1].trim()) sources[number - 1].label = match[1].trim();
      matched = true;
    }
    if (matched) continue;
    for (const match of line.matchAll(BARE_URL_RX)) {
      const url = match[0].replace(/[.,;]+$/, "");
      const label = line.slice(0, match.index).replace(/^\s*(?:[-*]|\d+\.)\s*/, "").replace(/(?:Source|출처)\s*[:：]\s*$/i, "").trim();
      add(url, label);
    }
  }
  return { body, sources };
}

// ---------- markdown → HTML ----------

function renderInline(text, ctx) {
  const codes = [];
  let value = String(text).replace(/`([^`]+)`/g, (_match, code) => {
    codes.push(code);
    return `⟦code:${codes.length - 1}⟧`;
  });
  value = escapeHtml(value);
  value = value.replace(/!\[([^\]]*)]\(([^)\s]+)\)/g, (_match, alt, src) => {
    const image = ctx.resolveImage ? ctx.resolveImage(src, alt) : null;
    return image ? `<img src="${escapeHtml(image.src)}" alt="${alt}" loading="lazy" decoding="async">` : alt;
  });
  value = value.replace(/\[([^\]]+)]\(([^)\s]+)\)/g, (_match, label, href) => {
    if (/^(?:https?:\/\/|mailto:|\/|#)/.test(href)) {
      const external = /^https?:\/\//.test(href) && !(ctx.baseUrl && href.startsWith(ctx.baseUrl));
      return `<a href="${href}"${external ? ' rel="noopener"' : ""}>${label}</a>`;
    }
    return label;
  });
  value = value.replace(/\[(red|blue|brown):\s*([^\]]+)]/g, (_match, color, inner) => `<span class="${TONE_CLASS[color]}">${inner.trim()}</span>`);
  value = value.replace(/\*\*([^*]+?)\*\*/g, "<strong>$1</strong>");
  value = value.replace(/&lt;br\s*\/?&gt;/gi, "<br>");
  value = value.replace(/⟦cite:(\d+)⟧/g, (_match, n) => `<sup class="cite"><a href="#src-${n}" aria-label="출처 ${n}">[${n}]</a></sup>`);
  value = value.replace(/⟦code:(\d+)⟧/g, (_match, index) => `<code>${escapeHtml(codes[Number(index)])}</code>`);
  return value;
}

function renderTable(table, ctx) {
  // Public tables use one consistent left alignment regardless of Markdown hints.
  const head = table.headers.map(cell => `<th>${renderInline(cell, ctx)}</th>`).join("");
  const rows = table.rows.map(row => `<tr>${row.map(cell => `<td>${renderInline(cell, ctx)}</td>`).join("")}</tr>`).join("\n");
  return `<div class="table-scroll"><table><thead><tr>${head}</tr></thead><tbody>\n${rows}\n</tbody></table></div>`;
}

const LIST_ITEM_RX = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const IMAGE_BLOCK_RX = /^!\[([^\]]*)]\(([^)\s]+)\)\s*$/;

function buildList(items, start, ctx) {
  const baseIndent = items[start].indent;
  const ordered = items[start].ordered;
  const first = ordered ? Number.parseInt(items[start].marker, 10) : 1;
  let html = ordered ? (first !== 1 ? `<ol start="${first}">` : "<ol>") : "<ul>";
  let i = start;
  while (i < items.length && items[i].indent >= baseIndent) {
    const item = items[i];
    i += 1;
    let inner = renderInline(item.text, ctx);
    if (i < items.length && items[i].indent > baseIndent) {
      const [nested, next] = buildList(items, i, ctx);
      inner += nested;
      i = next;
    }
    html += `<li>${inner}</li>`;
  }
  return [`${html}${ordered ? "</ol>" : "</ul>"}`, i];
}

function isBlockStart(lines, index) {
  const line = lines[index];
  return /^\s*```/.test(line)
    || /^#{1,6}\s+/.test(line)
    || /^>/.test(line)
    || /^---+\s*$/.test(line)
    || LIST_ITEM_RX.test(line)
    || IMAGE_BLOCK_RX.test(line.trim())
    || Boolean(parseMarkdownTableBlock(lines, index));
}

function renderBlocks(markdown, ctx) {
  const lines = String(markdown || "").split(/\r?\n/);
  const html = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i += 1; continue; }
    if (/^\s*```/.test(line)) {
      const code = [];
      i += 1;
      while (i < lines.length && !/^\s*```/.test(lines[i])) { code.push(lines[i]); i += 1; }
      i += 1;
      html.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
      continue;
    }
    const table = parseMarkdownTableBlock(lines, i);
    if (table) {
      html.push(renderTable(table, ctx));
      i = table.endIndex;
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      const level = Math.min(6, Math.max(3, heading[1].length));
      html.push(`<h${level}>${renderInline(heading[2], ctx)}</h${level}>`);
      i += 1;
      continue;
    }
    if (/^---+\s*$/.test(line)) { html.push("<hr>"); i += 1; continue; }
    const image = line.trim().match(IMAGE_BLOCK_RX);
    if (image) {
      const resolved = ctx.resolveImage ? ctx.resolveImage(image[2], image[1]) : null;
      if (resolved) {
        const size = resolved.width ? ` width="${resolved.width}" height="${resolved.height}"` : "";
        const caption = image[1] ? `<figcaption>${escapeHtml(image[1])}</figcaption>` : "";
        html.push(`<figure><img src="${escapeHtml(resolved.src)}" alt="${escapeHtml(image[1])}"${size} loading="lazy" decoding="async">${caption}</figure>`);
      }
      i += 1;
      continue;
    }
    if (/^>/.test(line)) {
      const quoted = [];
      while (i < lines.length && /^>/.test(lines[i])) { quoted.push(lines[i].replace(/^>\s?/, "")); i += 1; }
      html.push(`<blockquote>${renderBlocks(quoted.join("\n"), ctx)}</blockquote>`);
      continue;
    }
    if (LIST_ITEM_RX.test(line)) {
      const items = [];
      while (i < lines.length) {
        const match = lines[i].match(LIST_ITEM_RX);
        if (match) {
          items.push({ indent: match[1].replace(/\t/g, "    ").length, marker: match[2], ordered: /\d/.test(match[2]), text: match[3] });
          i += 1;
          continue;
        }
        // Indented continuation lines belong to the previous item.
        if (lines[i].trim() && /^\s{2,}/.test(lines[i]) && !parseMarkdownTableBlock(lines, i)) {
          items.at(-1).text += ` ${lines[i].trim()}`;
          i += 1;
          continue;
        }
        break;
      }
      let index = 0;
      while (index < items.length) {
        const [listHtml, next] = buildList(items, index, ctx);
        html.push(listHtml);
        index = next;
      }
      continue;
    }
    const paragraph = [];
    while (i < lines.length && lines[i].trim() && (paragraph.length === 0 || !isBlockStart(lines, i))) {
      paragraph.push(lines[i].trim());
      i += 1;
    }
    html.push(`<p>${renderInline(paragraph.join(" "), ctx)}</p>`);
  }
  return html.join("\n");
}

// ---------- memo → article model ----------

// Whole sentences up to max chars, so card summaries never stop mid-number.
function sentenceSummary(text, max) {
  const sentences = String(text).split(/(?<=[.!?。])\s+/).filter(Boolean);
  let out = "";
  for (const sentence of sentences) {
    if (out && (out + " " + sentence).length > max) break;
    out = out ? `${out} ${sentence}` : sentence;
  }
  return out.length > max ? truncate(out, max) : out;
}

function cleanCompany(raw) {
  return String(raw || "")
    .replace(/\*\*/g, "")
    .replace(/\s+보통주.*$/, "")
    .replace(/\s*\|.*$/, "")
    .replace(/\s*\(\d{6}\).*$/, "")
    .replace(/\s+투자\s*(?:메모|분석).*$/, "")
    .replace(/,.*$/, "")
    .replace(/\s+[—-]\s+.*$/, "")
    .trim();
}

function marketFromPath(relativeMemo) {
  const segment = relativeMemo.split(/[\\/]/)[1] || "";
  if (/sector/.test(segment)) return "sector";
  if (MARKET_LABELS[segment]) return segment;
  return segment || "kr";
}

// Pull the "결론 한 문장 + 숫자" answer from the first blocks of the lead section.
function extractAnswer(body) {
  const blocks = stripLeadingMetadataLines(body).split(/\n\s*\n/);
  let lead = "";
  let answer = "";
  let consumed = 0;
  const first = (blocks[0] || "").trim();
  const wholeBold = first.match(/^\*\*([^*]+)\*\*$/);
  const leadingBold = first.match(/^\*\*([^*]+)\*\*\s*([\s\S]*)$/);
  const isProse = block => block && !/^\s*(?:[-*+]\s|\d+\.\s|\||!\[|#|>|```)/.test(block);
  if (wholeBold) {
    lead = wholeBold[1].trim();
    consumed = 1;
    if (isProse((blocks[1] || "").trim())) { answer = blocks[1].trim(); consumed = 2; }
  } else if (leadingBold && isProse(first)) {
    lead = leadingBold[1].trim();
    answer = leadingBold[2].trim();
    consumed = 1;
  } else if (isProse(first)) {
    const sentence = first.split(/(?<=[.!?。다])\s/)[0];
    lead = sentence;
    answer = first.slice(sentence.length).trim();
    consumed = 1;
  }
  return { lead, answer, rest: blocks.slice(consumed).join("\n\n").trim() };
}

function updateDates(markdown) {
  const section = parseSections(markdown).find(item => normalizeHeading(item.heading) === "update log");
  if (!section) return [];
  return [...section.body.matchAll(/^#{3,6}\s+(\d{4}-\d{2}-\d{2})/gm)].map(match => match[1]);
}

function faqFromMarkdown(markdown) {
  const lines = markdown.split(/\r?\n/);
  const faq = [];
  for (let i = 0; i < lines.length; i += 1) {
    const table = parseMarkdownTableBlock(lines, i);
    if (!table) continue;
    i = table.endIndex - 1;
    if (table.headers.length < 2 || !/질문/.test(table.headers[0])) continue;
    for (const row of table.rows) {
      const question = plainText(row[0]);
      const answer = plainText(row.slice(1).filter(Boolean).join(" "));
      if (question && answer) faq.push({ question, answer });
    }
  }
  return faq;
}

function markdownTables(markdown) {
  const lines = markdown.split(/\r?\n/);
  const tables = [];
  for (let i = 0; i < lines.length; i += 1) {
    const table = parseMarkdownTableBlock(lines, i);
    if (!table) continue;
    tables.push(table.lines.map(line => markdownVisibleText(line).replace(/⟦cite:\d+⟧/g, "")).join("\n"));
    i = table.endIndex - 1;
  }
  return tables;
}

function loadArticle(entry, options) {
  const { root, safety, config } = options;
  assert(entry && typeof entry.memo === "string", "published.json entries need a memo path");
  assert(SLUG_PATTERN.test(entry.slug || ""), `Invalid slug for ${entry.memo}: use lowercase a-z, 0-9, '-' and '/'`);
  const memoPath = safety.checkPath(path.resolve(root, entry.memo), "Memo");
  assert(entry.article === undefined || typeof entry.article === "string", "article must be a path");
  assert(entry.sectors === undefined || (Array.isArray(entry.sectors) && entry.sectors.every(s => typeof s === "string" && s.trim())), "sectors must be a string array");
  assert(entry.archive === undefined || typeof entry.archive === "boolean", "archive must be a boolean");
  const contentPath = entry.article ? safety.checkPath(path.resolve(root, entry.article), "Article") : memoPath;
  const markdown = fs.readFileSync(contentPath, "utf8");
  safety.checkContent(markdown, `Article ${entry.article || entry.memo}`);
  if (entry.article) {
    const original = fs.readFileSync(memoPath, "utf8");
    safety.checkContent(original, `Memo ${entry.memo}`);
    const originalDate = (parseMetadata(original)["기준일"] || "").match(/\d{4}-\d{2}-\d{2}/)?.[0];
    const articleDate = (parseMetadata(markdown)["기준일"] || "").match(/\d{4}-\d{2}-\d{2}/)?.[0];
    assert(originalDate && originalDate === articleDate, "Article must preserve the memo 기준일");
  }
  const metadata = parseMetadata(markdown);
  const asOfDate = (metadata["기준일"] || "").match(/\d{4}-\d{2}-\d{2}/)?.[0];
  assert(asOfDate, `Memo has no YYYY-MM-DD 기준일 and cannot be published: ${entry.memo}`);
  const updatedMeta = (metadata["최근 업데이트일"] || "").match(/\d{4}-\d{2}-\d{2}/)?.[0];
  const dateModified = [asOfDate, updatedMeta, ...updateDates(markdown), entry.datePublished, entry.dateModified].filter(Boolean).sort().at(-1);
  const datePublished = entry.datePublished || asOfDate;

  const h1 = markdown.match(/^#\s+(.+?)\s*$/m)?.[1]?.trim() || entry.slug;
  const target = metadata["대상"] || "";
  const company = entry.company || cleanCompany(target) || cleanCompany(h1);
  const ticker = entry.ticker ?? (metadata["티커"] || target.match(/\b(\d{6})\b/)?.[1] || "");
  const market = entry.market || marketFromPath(entry.memo);

  const allSections = parseSections(markdown);
  const sections = allSections.filter(section => {
    const key = normalizeHeading(section.heading);
    return !EXCLUDED_SECTIONS.has(key) && key !== "sources";
  });
  const leadIndex = Math.max(0, ["summary", "decision frame"].map(key => sections.findIndex(section => normalizeHeading(section.heading) === key)).find(index => index >= 0) ?? 0);
  assert(sections.length, `Memo has no publishable ## sections: ${entry.memo}`);
  const answer = extractAnswer(sections[leadIndex].body);
  assert(answer.lead, `Could not derive a core answer from the memo's lead section: ${entry.memo}`);
  const issue = (entry.issue || deriveIssue(`**${answer.lead}**`)).replace(/[.。]+$/, "");

  const parts = [`## ${ANSWER_HEADING}`, "", `**${answer.lead}**`, "", answer.answer];
  sections.forEach((section, index) => {
    const key = normalizeHeading(section.heading);
    let body = index === leadIndex ? answer.rest : section.body;
    if (key === "summary" && index !== leadIndex) body = stripLeadingMetadataLines(body);
    body = cleanInternalLinks(body).trim();
    if (body) parts.push("", `## ${HEADING_MAP.get(key) || section.heading}`, "", body);
  });
  const updateLog = allSections.find(section => normalizeHeading(section.heading) === "update log");
  if (updateLog?.body.trim()) parts.push("", `## ${UPDATES_HEADING}`, "", cleanInternalLinks(updateLog.body.trim()));
  const sourceLines = allSections
    .filter(section => normalizeHeading(section.heading) === "sources")
    .flatMap(section => section.body.split(/\r?\n/))
    .filter(line => line.trim());
  const cited = collectCitations(parts.join("\n"), sourceLines);
  const citedSections = parseSections(cited.body);

  const answerSection = citedSections.find(section => section.heading === ANSWER_HEADING);
  const answerExtracted = extractAnswer(answerSection.body);
  const summary = entry.summary || sentenceSummary(plainText(answer.answer || answer.lead), 120);
  const description = summary;
  const title = [ticker ? `${company}(${ticker})` : company, issue, asOfDate].join(" | ");

  const thumbnailPath = path.join(path.dirname(memoPath), "assets", "naver-thumbnail.png");
  // Stance badge and quote cells are display-only and come from published.json,
  // never derived: the author states them explicitly or they are not shown.
  assert(!entry.stance || STANCES[entry.stance], `Invalid stance for ${entry.memo}: use pos/neu/neg or 긍정/중립/부정`);
  const quote = (entry.quote || []).slice(0, 4).map(cell => {
    assert(cell && cell.label && cell.value !== undefined, `quote cells need label and value: ${entry.memo}`);
    return { label: String(cell.label), value: String(cell.value), unit: cell.unit ? String(cell.unit) : "", tone: ["up", "down"].includes(cell.tone) ? cell.tone : "" };
  });
  const bodyChars = citedSections.reduce((sum, section) => sum + plainText(section.body).length, 0);
  return {
    entry,
    slug: entry.slug,
    url: `${config.baseUrl}/${entry.slug}/`,
    memoPath,
    memoDir: path.dirname(contentPath),
    archive: entry.archive === true,
    originalMarkdown: entry.article ? fs.readFileSync(memoPath, "utf8") : null,
    markdown,
    h1,
    company,
    ticker,
    exchange: entry.exchange || (market === "kr" && ticker ? "KRX" : ""),
    market,
    sectors: [...new Set(entry.sectors || [])],
    tags: (entry.tags && entry.tags.length ? entry.tags : [company, ticker]).filter(Boolean),
    asOfDate,
    datePublished,
    dateModified,
    issue,
    title,
    description,
    answerLead: answerExtracted.lead,
    answerBody: answerExtracted.answer,
    sections: citedSections.filter(section => section.heading !== ANSWER_HEADING),
    sources: cited.sources,
    hasColorMarkers: COLOR_MARKER_PATTERN.test(markdown),
    faq: faqFromMarkdown(markdown),
    tables: markdownTables(cited.body),
    thumbnailPath: fs.existsSync(thumbnailPath) ? thumbnailPath : null,
    headline: entry.headline || h1,
    summary,
    stance: entry.stance ? STANCES[entry.stance] : null,
    quote,
    featured: Number.isFinite(entry.featured) ? entry.featured : null,
    popular: Number.isFinite(entry.popular) ? entry.popular : null,
    readMinutes: Math.max(1, Math.round(bodyChars / 600)),
    cardImage: null,
  };
}

// ---------- ads ----------

function adsEnabled(config) {
  return Boolean(config.adsense && config.adsense.client);
}

function adHead(config) {
  if (!adsEnabled(config)) return "";
  return `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${escapeHtml(config.adsense.client)}" crossorigin="anonymous"></script>`;
}

function adSlot(config, name) {
  if (!adsEnabled(config)) return "";
  const slot = config.adsense.slots?.[name];
  if (!slot) return "";
  return `<div class="ad" data-slot="${escapeHtml(name)}"><ins class="adsbygoogle" style="display:block" data-ad-client="${escapeHtml(config.adsense.client)}" data-ad-slot="${escapeHtml(slot)}" data-ad-format="auto" data-full-width-responsive="true"></ins><script>(adsbygoogle=window.adsbygoogle||[]).push({});</script></div>`;
}

// ---------- page rendering ----------

function navHtml(site) {
  const links = [];
  for (const market of site.markets) links.push(`<a href="/${market}/">${escapeHtml(MARKET_SHORT[market] || MARKET_LABELS[market] || market)}</a>`);
  if (site.pages.some(page => page.slug === "about")) links.push(`<a href="/about/">소개</a>`);
  links.push(`<a href="/search/">검색</a>`);
  return links.join("");
}

function footerHtml(site) {
  return site.pages.map(page => `<a href="/${page.slug}/">${escapeHtml(page.title)}</a>`).join("") + `<a href="/feed.xml">RSS</a>`;
}

// Search-console ownership meta tags. A *.workers.dev site cannot use DNS
// verification, so Google, Naver and Bing are verified with these instead.
function verificationMeta(config) {
  const names = { google: "google-site-verification", naver: "naver-site-verification", bing: "msvalidate.01" };
  return Object.entries(names)
    .filter(([key]) => config.verification?.[key])
    .map(([key, name]) => `<meta name="${name}" content="${escapeHtml(config.verification[key])}">`)
    .join("\n");
}

function renderLayout(site, page) {
  const { config } = site;
  const ogImage = page.image
    ? `<meta property="og:image" content="${escapeHtml(page.image)}">\n<meta name="twitter:image" content="${escapeHtml(page.image)}">${page.imageAlt ? `\n<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:type" content="image/png"><meta property="og:image:alt" content="${escapeHtml(page.imageAlt)}"><meta name="twitter:image:alt" content="${escapeHtml(page.imageAlt)}">` : ""}`
    : "";
  return fill(site.templates.layout, {
    title: escapeHtml(page.title),
    shareTitle: escapeHtml(page.shareTitle || page.title),
    description: escapeHtml(page.description),
    canonical: escapeHtml(page.canonical),
    baseUrl: escapeHtml(config.baseUrl),
    siteName: escapeHtml(config.siteName),
    tagline: escapeHtml(config.tagline || ""),
    robots: page.robots || "index,follow,max-image-preview:large",
    ogType: page.ogType || "website",
    ogImage,
    twitterCard: page.image ? "summary_large_image" : "summary",
    head: [verificationMeta(config), adHead(config), page.head || ""].filter(Boolean).join("\n"),
    jsonLd: (page.jsonLd || []).map(jsonLdScript).join("\n"),
    nav: navHtml(site),
    content: page.content,
    footerLinks: footerHtml(site),
    year: String(site.buildYear),
    author: escapeHtml(config.author?.name || config.siteName),
  });
}

function createImageResolver(article, outDir, safety, config) {
  const copied = new Map();
  const used = new Set();
  return function resolveImage(src, _alt) {
    if (/^https?:\/\//.test(src)) return { src };
    let clean = src.split("?")[0];
    try { clean = decodeURI(clean); } catch {}
    if (!/\.(?:png|jpe?g|webp|gif|svg)$/i.test(clean)) return null;
    const absolute = path.resolve(article.memoDir, clean);
    if (copied.has(absolute)) return copied.get(absolute);
    const real = safety.checkPath(absolute, `Image ${clean}`);
    let name = path.basename(real).replace(/[^\w.-]+/g, "-");
    while (used.has(name)) name = `x-${name}`;
    used.add(name);
    const buffer = fs.readFileSync(real);
    writeFile(path.join(outDir, article.slug, "assets", name), buffer);
    const size = pngSize(buffer);
    const result = { src: `assets/${name}`, absolute: `${config.baseUrl}/${article.slug}/assets/${name}`, ...(size || {}) };
    copied.set(absolute, result);
    return result;
  };
}

function articleJsonLd(article, site, image) {
  const { config } = site;
  const author = { "@type": "Person", name: config.author?.name || config.siteName, url: config.author?.url || `${config.baseUrl}/about/` };
  const graph = [{
    "@context": "https://schema.org",
    "@type": "Article",
    headline: truncate(article.headline, 110),
    description: article.description,
    inLanguage: "ko-KR",
    datePublished: isoKst(article.datePublished),
    dateModified: isoKst(article.dateModified),
    author,
    publisher: { "@type": "Organization", name: config.siteName, url: config.baseUrl },
    mainEntityOfPage: { "@type": "WebPage", "@id": article.url },
    ...(image ? { image: [image] } : {}),
    ...(article.company ? {
      about: {
        "@type": "Corporation",
        name: article.company,
        ...(article.ticker ? { tickerSymbol: [article.exchange, article.ticker].filter(Boolean).join(" ") } : {}),
      },
    } : {}),
  }, {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "홈", item: `${config.baseUrl}/` },
      { "@type": "ListItem", position: 2, name: MARKET_LABELS[article.market] || article.market, item: `${config.baseUrl}/${article.market}/` },
      { "@type": "ListItem", position: 3, name: article.title, item: article.url },
    ],
  }];
  if (article.faq.length) {
    graph.push({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: article.faq.map(item => ({ "@type": "Question", name: item.question, acceptedAnswer: { "@type": "Answer", text: item.answer } })),
    });
  }
  return graph;
}

function renderArticle(article, site, outDir, safety) {
  const { config } = site;
  const resolveImage = createImageResolver(article, outDir, safety, config);
  const ctx = { resolveImage, baseUrl: config.baseUrl };
  let image = null;
  if (article.thumbnailPath) {
    // The Naver thumbnail is optional for the site: skip it when it is untracked.
    try { image = resolveImage(path.relative(article.memoDir, article.thumbnailPath)).absolute; } catch {}
  }

  const bodySections = article.sections.filter(section => section.heading !== UPDATES_HEADING);
  const midIndex = bodySections.length >= 4 ? Math.floor(bodySections.length / 2) : -1;
  const bodyHtml = [];
  bodySections.forEach((section, index) => {
    if (index === midIndex) bodyHtml.push(adSlot(config, "midArticle"));
    bodyHtml.push(`<h2 id="s-${index + 1}">${renderInline(section.heading, ctx)}</h2>`, renderBlocks(section.body, ctx));
    if (index === 0) bodyHtml.push(adSlot(config, "afterSummary"));
  });
  if (!bodySections.length) bodyHtml.push(adSlot(config, "afterSummary"));
  if (!image) {
    const firstImage = /!\[[^\]]*]\(([^)\s]+)\)/.exec(bodySections.map(section => section.body).join("\n"));
    if (firstImage) image = resolveImage(firstImage[1])?.absolute || null;
  }
  if (!image && config.defaultOgImage) image = config.defaultOgImage;
  if (image) article.cardImage = image.startsWith(`${config.baseUrl}/`) ? image.slice(config.baseUrl.length) : image;

  const updates = article.sections.find(section => section.heading === UPDATES_HEADING);
  const updatesHtml = updates ? `<section class="updates"><h2 id="updates">${UPDATES_HEADING}</h2>\n${renderBlocks(updates.body, ctx)}</section>` : "";
  const sourcesHtml = article.sources.length
    ? `${adSlot(config, "endArticle")}<section class="sources"><h2 id="sources">${SOURCES_HEADING}</h2>\n<ol>\n${article.sources.map((source, index) => `<li id="src-${index + 1}"><a href="${escapeHtml(source.url)}" rel="noopener">${renderInline(source.label, {})}</a></li>`).join("\n")}\n</ol></section>`
    : adSlot(config, "endArticle");
  const legend = article.hasColorMarkers
    ? `<p class="legend">색상 안내 — <span class="tone-pos">빨간색: 좋은 것</span> · <span class="tone-neg">파란색: 안 좋은 의견</span> · <span class="tone-spec">갈색: 추측성 의견</span></p>`
    : "";
  const tocItems = [
    ["answer", "핵심 답변"],
    ...bodySections.map((section, index) => [`s-${index + 1}`, plainText(section.heading)]),
    ...(updates ? [["updates", UPDATES_HEADING]] : []),
    ...(article.sources.length ? [["sources", SOURCES_HEADING]] : []),
  ];
  const shareImage = article.shareImage || (article.shareImage = shareCard(article, config, outDir));
  const content = fill(site.templates.article, {
    toc: `<nav class="toc" aria-label="목차">${tocItems.map(([id, label], index) => `<a href="#${id}"${index === 0 ? ' class="on"' : ""}>${escapeHtml(truncate(label, 24))}</a>`).join("")}</nav>`,
    tocScript: TOC_SCRIPT,
    sharing: sharingHtml(article, config),
    comments: commentsHtml(),
    chips: chipsHtml(article, { exchange: true }),
    headline: escapeHtml(article.headline),
    metaLine: `${escapeHtml(config.author?.name || config.siteName)} · 자료 기준일 <time datetime="${article.asOfDate}">${article.asOfDate}</time> · 사이트 발행 <time datetime="${article.datePublished}">${article.datePublished}</time> · 최근 편집 <time datetime="${article.dateModified}">${article.dateModified}</time> · ${article.readMinutes}분 · <span data-share-count title="사이트 공유 기능 이용 횟수이며 링크 복사를 포함합니다">공유 —</span> · <a href="#comments" data-comment-count>댓글 —</a>`,
    archiveNotice: article.archive ? '<p class="archive-note">기록 글 · 자료 기준일 당시의 수치와 판단을 보존했습니다. 이후 변동은 반영하지 않았습니다.</p>' : "",
    quote: article.quote.length ? `<div class="quote">${article.quote.map(cell => `<div><div class="k">${escapeHtml(cell.label)}</div><div class="v${cell.tone ? ` ${cell.tone}` : ""}">${escapeHtml(cell.value)}${cell.unit ? `<small>${escapeHtml(cell.unit)}</small>` : ""}</div></div>`).join("")}</div>` : "",
    more: moreHtml(article, site),
    answerLead: renderInline(article.answerLead, ctx),
    answerBody: article.answerBody ? renderBlocks(article.answerBody, ctx) : "",
    asOfDate: article.asOfDate,
    dateModified: article.dateModified,
    legend,
    body: bodyHtml.filter(Boolean).join("\n"),
    updates: updatesHtml,
    sources: sourcesHtml,
    tags: article.tags.map(tag => `<a href="${tagHref(tag)}">#${escapeHtml(tag)}</a>`).join(""),
    disclaimer: escapeHtml(config.disclaimer || DEFAULT_DISCLAIMER),
  });
  const html = renderLayout(site, {
    title: article.title,
    shareTitle: article.headline,
    imageAlt: `${article.headline} · ${article.summary} · 자료 기준일 ${article.asOfDate}`,
    description: article.description,
    canonical: article.url,
    ogType: "article",
    image: shareImage,
    head: [
      `<script src="/engagement.js" defer></script>`,
      ...(config.kakao?.javascriptKey || process.env.KAKAO_JAVASCRIPT_KEY ? [`<script defer src="https://t1.kakaocdn.net/kakao_js_sdk/2.8.4/kakao.min.js" crossorigin="anonymous"></script>`] : []),
      `<meta property="article:published_time" content="${isoKst(article.datePublished)}">`,
      `<meta property="article:modified_time" content="${isoKst(article.dateModified)}">`,
    ].join("\n"),
    jsonLd: articleJsonLd(article, site, shareImage),
    content,
  });
  writeFile(path.join(outDir, article.slug, "index.html"), html);
  if (article.originalMarkdown) writeFile(path.join(outDir, article.slug, "memo.md"), article.originalMarkdown);
  return html;
}

function tagDir(tag) {
  return String(tag).trim().replace(/[\s/\\?#%]+/g, "-");
}

function tagHref(tag) {
  return `/tags/${encodeURIComponent(tagDir(tag))}/`;
}

// Highlights the TOC entry of the section being read; the page works without it.
const TOC_SCRIPT = `<script>(()=>{const l=[...document.querySelectorAll(".toc a")];if(!l.length||!("IntersectionObserver"in window))return;const m=new Map(l.map(a=>[decodeURIComponent(a.hash.slice(1)),a]));const o=new IntersectionObserver(es=>{for(const e of es)if(e.isIntersecting){l.forEach(a=>a.classList.remove("on"));m.get(e.target.id)?.classList.add("on")}},{rootMargin:"0px 0px -70% 0px"});m.forEach((a,id)=>{const t=document.getElementById(id);if(t)o.observe(t)})})();</script>`;

function chipsHtml(article, { exchange = false } = {}) {
  const market = MARKET_SHORT[article.market] || MARKET_LABELS[article.market] || article.market;
  const ticker = [exchange ? article.exchange : "", article.ticker].filter(Boolean).join(" · ");
  return [
    `<span class="mk">${escapeHtml(market)}</span>`,
    article.archive ? '<span class="tk">기록 글</span>' : "",
    ticker ? `<span class="tk">${escapeHtml(ticker)}</span>` : "",
    article.stance ? `<span class="badge ${article.stance[0]}">${article.stance[1]}</span>` : "",
  ].filter(Boolean).join("");
}

function asOfTag(article) {
  return `<span class="asof"><b>기준일</b>${article.asOfDate}</span>`;
}

function imageHtml(article, className = "") {
  return article.cardImage
    ? `<img src="${escapeHtml(article.cardImage)}" alt="" loading="lazy"${className ? ` class="${className}"` : ""}>`
    : `<div class="ph">${escapeHtml((article.company || "").slice(0, 2))}</div>`;
}

function cardHtml(article, { summary = false } = {}) {
  return `<a class="card" href="/${article.slug}/"><div class="img">${imageHtml(article)}${asOfTag(article)}</div><div class="in"><div class="chips">${chipsHtml(article)}</div><h3>${escapeHtml(article.headline)}</h3>${summary ? `<p>${escapeHtml(article.summary)}</p>` : ""}</div></a>`;
}

function rowHtml(article, rank) {
  const updated = article.dateModified !== article.datePublished ? ` · 업데이트 ${article.dateModified}` : "";
  return `<a class="row" href="/${article.slug}/"><div><div class="chips">${rank ? `<span class="rank">${rank}</span>` : ""}${chipsHtml(article)}</div><h3>${escapeHtml(article.headline)}</h3><p>${escapeHtml(article.summary)}</p><div class="sub">기준일 ${article.asOfDate}${updated} · ${article.readMinutes}분</div></div>${imageHtml(article)}</a>`;
}

function moreHtml(article, site) {
  const picks = related(article, site.articles), {previous, next} = neighbors(article, site.articles);
  const link = (a,label) => a ? `<a href="/${a.slug}/"><span class="sub">${label}</span><h3>${escapeHtml(a.headline)}</h3></a>` : "";
  return (picks.length ? `<section class="more" aria-label="연관글"><h2>연관글</h2><div class="pair">${picks.map(pick=>cardHtml(pick)).join("")}</div></section>` : "") +
    (previous || next ? `<nav class="more" aria-label="이어서 읽기"><h2>이어서 읽기</h2><div class="pair">${link(previous,"이전 글")}${link(next,"다음 글")}</div></nav>` : "");
}
function sharingHtml(article, config) {
 return `<div class="sharing" data-url="${escapeHtml(article.url)}" data-title="${escapeHtml(article.headline)}" data-summary="${escapeHtml(article.summary)}" data-image="${escapeHtml(article.shareImage)}" data-kakao-key="${escapeHtml(config.kakao?.javascriptKey || process.env.KAKAO_JAVASCRIPT_KEY || "")}">
 <div class="share-buttons" role="group" aria-label="글 공유"><button type="button" data-share="kakao">카카오톡</button><button type="button" data-share="native">공유하기</button><button type="button" data-share="copy">링크 복사</button></div><p class="sub" role="status" aria-live="polite"></p></div>`;
}
function commentsHtml() {
 return `<section class="comments more" id="comments" aria-labelledby="comments-title"><h2 id="comments-title">댓글</h2><p class="sub">관리자 승인 후 공개됩니다. 삭제 요청은 <a href="/contact/">문의</a>로 보내 주세요. <a href="/privacy/">개인정보 안내</a></p>
 <form id="comment-form"><label>닉네임<input name="nickname" maxlength="30" required autocomplete="off"></label><label>댓글<textarea name="body" maxlength="2000" rows="5" required></textarea></label><div class="spam-trap" aria-hidden="true"><label>웹사이트<input name="website" tabindex="-1" autocomplete="off"></label></div><button type="submit">댓글 등록</button><p role="status" aria-live="polite" id="comment-status"></p></form>
 <p id="comments-status" role="status" aria-live="polite"></p><ol id="comment-list"></ol><button type="button" id="comments-more" hidden>댓글 더 불러오기</button><button type="button" id="comments-retry" hidden>다시 시도</button><noscript>댓글을 보거나 작성하려면 JavaScript를 켜 주세요.</noscript></section>`;
}

// Recommended: entries with a `featured` rank first, then the latest ones.
function featuredArticles(articles) {
  const ranked = articles.filter(article => article.featured !== null).sort((a, b) => a.featured - b.featured);
  return [...ranked, ...articles.filter(article => article.featured === null)].slice(0, 3);
}

// Popular: `popular` ranks first, then published.json order (no visit stats yet).
function popularArticles(articles) {
  const ranked = articles.filter(article => article.popular !== null).sort((a, b) => a.popular - b.popular);
  const rest = articles.filter(article => article.popular === null).sort((a, b) => a.order - b.order);
  return [...ranked, ...rest];
}

function heroHtml(site, articles) {
  const picks = featuredArticles(articles);
  if (!picks.length) return "";
  const [first, ...rest] = picks;
  return `<section class="rec"><h1>지금 읽을 만한 리서치</h1><p class="lede">${escapeHtml(site.config.description || "")}</p><div class="grid${rest.length ? "" : " one"}">${cardHtml(first, { summary: true })}${rest.length ? `<div class="stack">${rest.map(article => cardHtml(article)).join("")}</div>` : ""}</div></section>`;
}

function renderList(site, { heading, intro, articles, canonical, robots, home = false }) {
  const rows = list => list.map(article => rowHtml(article)).join("\n") || `<p class="empty">아직 공개된 글이 없습니다.</p>`;
  const list = home
    ? [
      `<input type="radio" name="sort" id="sort-latest" checked hidden><input type="radio" name="sort" id="sort-popular" hidden>`,
      `<div class="seg" role="tablist"><label for="sort-latest">최신</label><label for="sort-popular">인기</label></div>`,
      `<div class="panel latest">${rows(articles)}</div>`,
      `<div class="panel popular">${popularArticles(articles).map((article, index) => rowHtml(article, index + 1)).join("\n")}</div>`,
    ].join("\n")
    : rows(articles);
  const content = fill(site.templates.index, {
    hero: home ? heroHtml(site, articles) : `<header class="list-head"><h1>${escapeHtml(heading)}</h1><p>${escapeHtml(intro)}</p></header>`,
    list,
  });
  return renderLayout(site, {
    title: heading === site.config.siteName ? heading : `${heading} | ${site.config.siteName}`,
    description: intro,
    canonical,
    robots,
    content,
    jsonLd: [{ "@context": "https://schema.org", "@type": "CollectionPage", name: heading, url: canonical, inLanguage: "ko-KR" }],
  });
}

function loadPages(pagesDir, safety) {
  if (!pagesDir || !fs.existsSync(pagesDir)) return [];
  return fs.readdirSync(pagesDir)
    .filter(name => name.endsWith(".md"))
    .sort()
    .map(name => {
      const filePath = path.join(pagesDir, name);
      const markdown = fs.readFileSync(filePath, "utf8");
      safety.checkContent(markdown, `Page ${name}`);
      const title = markdown.match(/^#\s+(.+?)\s*$/m)?.[1] || name.replace(/\.md$/, "");
      const body = markdown.replace(/^#\s+.+?\s*$/m, "").trim();
      const firstParagraph = body.split(/\n\s*\n/).find(block => block.trim() && !/^\s*[-*#|]/.test(block)) || title;
      return { slug: name.replace(/\.md$/, ""), title, body, description: truncate(plainText(firstParagraph), 160) };
    });
}

// ---------- global SEO/AEO files ----------

function sitemapXml(entries) {
  const urls = entries.map(entry => `  <url><loc>${escapeXml(entry.loc)}</loc>${entry.lastmod ? `<lastmod>${entry.lastmod}</lastmod>` : ""}</url>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

function feedXml(site, articles) {
  const { config } = site;
  const updated = articles[0] ? isoKst(articles[0].dateModified) : new Date().toISOString();
  const entries = articles.slice(0, 50).map(article => [
    "  <entry>",
    `    <title>${escapeXml(article.title)}</title>`,
    `    <link href="${escapeXml(article.url)}"/>`,
    `    <id>${escapeXml(article.url)}</id>`,
    `    <published>${isoKst(article.datePublished)}</published>`,
    `    <updated>${isoKst(article.dateModified)}</updated>`,
    `    <summary>${escapeXml(article.description)}</summary>`,
    "  </entry>",
  ].join("\n")).join("\n");
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="ko">',
    `  <title>${escapeXml(config.siteName)}</title>`,
    `  <link href="${escapeXml(config.baseUrl)}/"/>`,
    `  <link rel="self" href="${escapeXml(config.baseUrl)}/feed.xml"/>`,
    `  <id>${escapeXml(config.baseUrl)}/</id>`,
    `  <updated>${updated}</updated>`,
    `  <author><name>${escapeXml(config.author?.name || config.siteName)}</name></author>`,
    entries,
    "</feed>",
    "",
  ].join("\n");
}

function llmsTxt(site, articles) {
  const { config } = site;
  return [
    `# ${config.siteName}`,
    "",
    `> ${config.description || "공시와 숫자로 확인한 한국·미국 주식 리서치. 모든 글에 기준일과 출처가 있습니다."}`,
    "",
    "각 글은 사실(공시·회사 자료), 계산(수록 숫자로 산출), 추론(작성자 판단)을 구분합니다. 투자 권유가 아닙니다.",
    "",
    "## 글",
    "",
    ...articles.map(article => `- [${article.title}](${article.url}): ${article.description} (기준일 ${article.asOfDate}, 최근 업데이트 ${article.dateModified})`),
    "",
    "## 안내",
    "",
    ...site.pages.map(page => `- [${page.title}](${config.baseUrl}/${page.slug}/)`),
    `- [전문 텍스트](${config.baseUrl}/llms-full.txt)`,
    "",
  ].join("\n");
}

function llmsFullTxt(site, articles) {
  const blocks = articles.map(article => [
    `# ${article.title}`,
    "",
    `URL: ${article.url}`,
    `기준일: ${article.asOfDate}`,
    `사이트 발행일: ${article.datePublished}`,
    `최근 편집일: ${article.dateModified}`,
    ...(article.archive ? ["기록 글: 자료 기준일 당시의 수치와 판단이며 이후 변동은 반영하지 않았다."] : []),
    "",
    "## 핵심 답변",
    "",
    plainText(article.answerLead),
    "",
    plainText(article.answerBody),
    ...(article.tables.length ? ["", "## 수치 표", "", article.tables.join("\n\n")] : []),
    "",
    "## 출처",
    "",
    ...article.sources.map((source, index) => `${index + 1}. ${source.label} — ${source.url}`),
  ].join("\n"));
  return `# ${site.config.siteName} — 전문 요약\n\n${blocks.join("\n\n---\n\n")}\n`;
}

// ---------- build ----------

function validateConfig(config, { production }) {
  assert(config && typeof config === "object", "site.config.json must be an object");
  assert(/^https?:\/\/[^/]+$/.test(config.baseUrl || ""), "site.config.json baseUrl must be an origin like https://example.com (no trailing slash)");
  assert(config.siteName, "site.config.json needs siteName");
  if (production) {
    assert(/^https:\/\//.test(config.baseUrl) && !/example\.(?:com|org|net)$/.test(new URL(config.baseUrl).hostname), "Production build needs a real https baseUrl in site.config.json");
  }
  if (config.adsense?.client) assert(/^ca-pub-\d{10,20}$/.test(config.adsense.client), "adsense.client must look like ca-pub-0000000000000000");
  if (config.indexNow?.key) assert(/^[A-Za-z0-9-]{8,128}$/.test(config.indexNow.key), "indexNow.key must be 8-128 chars of A-Z, a-z, 0-9 or '-'");
}

function buildSite(options) {
  const root = path.resolve(options.root || process.cwd());
  loadEnvFile(root);
  const config = options.config;
  validateConfig(config, { production: Boolean(options.production) });
  const published = options.published;
  assert(Array.isArray(published?.articles), "published.json must contain an articles array");
  const outDir = path.resolve(options.outDir);
  const safety = createSafety({ root, requireTracked: options.requireTracked !== false });

  const slugs = new Set();
  const articles = published.articles.map(entry => {
    assert(!slugs.has(entry.slug), `Duplicate slug in published.json: ${entry.slug}`);
    assert(!/^(admin|api|search|share)(\/|$)/.test(entry.slug), `Reserved application slug: ${entry.slug}`);
    slugs.add(entry.slug);
    return loadArticle(entry, { root, safety, config });
  }).map((article, order) => Object.assign(article, { order })).sort((a, b) => b.dateModified.localeCompare(a.dateModified) || b.datePublished.localeCompare(a.datePublished) || a.slug.localeCompare(b.slug));

  const pages = loadPages(options.pagesDir, safety);
  assert(pages.every(page => !/^(admin|api|search|share)(\/|$)/.test(page.slug)), "Reserved application page slug");
  const markets = [...new Set(articles.map(article => article.market))].sort((a, b) => Object.keys(MARKET_LABELS).indexOf(a) - Object.keys(MARKET_LABELS).indexOf(b));
  const templates = Object.fromEntries(["layout", "article", "index"].map(name => [name, fs.readFileSync(path.join(TEMPLATE_DIR, `${name}.html`), "utf8")]));
  const site = { config, templates, pages, markets, articles, buildYear: options.buildYear || new Date().getFullYear() };

  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  const urlEntries = [];
  const record = (loc, lastmod, html, inSitemap = true) => urlEntries.push({ loc, lastmod, sha256: sha256(html), inSitemap });

  // First pass copies images and fixes every article's card image, so the
  // "이어서 읽기" cards rendered in the second pass can show other articles' thumbnails.
  for (const article of articles) renderArticle(article, site, outDir, safety);
  for (const article of articles) {
    const html = renderArticle(article, site, outDir, safety);
    record(article.url, article.dateModified, html);
  }
  const latest = articles[0]?.dateModified;
  const home = renderList(site, { heading: config.siteName, intro: config.description || "공시와 숫자로 확인한 주식 리서치. 모든 글에 기준일과 출처가 있습니다.", articles, canonical: `${config.baseUrl}/`, home: true });
  writeFile(path.join(outDir, "index.html"), home);
  record(`${config.baseUrl}/`, latest, home);
  for (const market of markets) {
    const label = MARKET_LABELS[market] || market;
    const html = renderList(site, { heading: label, intro: `${label} 리서치 글 목록 (최근 업데이트순)`, articles: articles.filter(article => article.market === market), canonical: `${config.baseUrl}/${market}/` });
    writeFile(path.join(outDir, market, "index.html"), html);
    record(`${config.baseUrl}/${market}/`, articles.find(article => article.market === market)?.dateModified, html);
  }
  const tags = new Map();
  for (const article of articles) for (const tag of article.tags) tags.set(tagDir(tag), [...(tags.get(tagDir(tag)) || []), article]);
  for (const [tag, tagged] of tags) {
    const html = renderList(site, { heading: `#${tag}`, intro: `${tag} 관련 리서치`, articles: tagged, canonical: `${config.baseUrl}/tags/${encodeURIComponent(tag)}/`, robots: "noindex,follow" });
    writeFile(path.join(outDir, "tags", tag, "index.html"), html);
  }
  for (const page of pages) {
    const html = renderLayout(site, {
      title: `${page.title} | ${config.siteName}`,
      description: page.description,
      canonical: `${config.baseUrl}/${page.slug}/`,
      content: `<div class="narrow page"><article class="body"><h1>${escapeHtml(page.title)}</h1>\n${renderBlocks(page.body, { baseUrl: config.baseUrl })}</article></div>`,
    });
    writeFile(path.join(outDir, page.slug, "index.html"), html);
    record(`${config.baseUrl}/${page.slug}/`, null, html);
  }
  writeFile(path.join(outDir, "404.html"), renderLayout(site, {
    title: `페이지를 찾을 수 없습니다 | ${config.siteName}`,
    description: "요청한 페이지가 없습니다.",
    canonical: `${config.baseUrl}/404.html`,
    robots: "noindex",
    content: `<div class="narrow page"><h1>페이지를 찾을 수 없습니다</h1><p><a href="/">홈으로 가기</a></p></div>`,
  }));

  writeFile(path.join(outDir, "sitemap.xml"), sitemapXml(urlEntries.filter(entry => entry.inSitemap)));
  const searchIndex = articles.map(a=>({slug:a.slug,headline:a.headline,company:a.company,ticker:a.ticker,market:a.market,sectors:a.sectors,tags:a.tags,summary:a.summary,datePublished:a.datePublished,order:a.order}));
  writeFile(path.join(outDir,"search-index.json"),JSON.stringify(searchIndex));
  for(const name of ["discovery.js","search.js"]) writeFile(path.join(outDir,name),fs.readFileSync(path.join(__dirname,name),"utf8"));
  writeFile(path.join(outDir,"engagement.js"),fs.readFileSync(path.join(__dirname,"../../../site/engagement.js"),"utf8"));
  writeFile(path.join(outDir,"search/index.html"),renderLayout(site,{
   title:`검색 | ${config.siteName}`,description:"공개 리서치 검색",canonical:`${config.baseUrl}/search/`,robots:"noindex,follow",
   head:'<script src="/discovery.js" defer></script><script src="/search.js" defer></script>',
   content:`<div class="wrap narrow"><header class="list-head"><h1>리서치 검색</h1><p>제목·종목·섹터로 다음 글을 찾아보세요.</p></header><form id="search-form" action="/search/" method="get" class="search-form"><label for="search-q">검색어</label><div><input id="search-q" name="q" type="search" autocomplete="off"><button>검색</button><a href="/search/" id="search-reset">초기화</a></div></form><p id="search-status" role="status" aria-live="polite"></p><button id="search-retry" hidden>다시 시도</button><div id="search-results" class="list"></div><a href="/" id="search-back">뒤로가기</a><noscript>검색하려면 JavaScript를 켜 주세요.</noscript></div>`
  }));
  writeFile(path.join(outDir, "feed.xml"), feedXml(site, articles));
  writeFile(path.join(outDir, "robots.txt"), `User-agent: *\nAllow: /\nDisallow: /admin\n\nSitemap: ${config.baseUrl}/sitemap.xml\n`);
  writeFile(path.join(outDir, "llms.txt"), llmsTxt(site, articles));
  writeFile(path.join(outDir, "llms-full.txt"), llmsFullTxt(site, articles));
  if (adsEnabled(config)) {
    writeFile(path.join(outDir, "ads.txt"), `google.com, ${config.adsense.client.replace(/^ca-/, "")}, DIRECT, f08c47fec0942fa0\n`);
  }
  if (config.indexNow?.key) writeFile(path.join(outDir, `${config.indexNow.key}.txt`), config.indexNow.key);
  const urls = urlEntries.map(({ loc, lastmod, sha256: hash }) => ({ loc, lastmod: lastmod || null, sha256: hash }));
  writeFile(path.join(outDir, "urls.json"), `${JSON.stringify({ baseUrl: config.baseUrl, urls }, null, 2)}\n`);

  // Public metadata only: never include memo filesystem paths or admin assets.
  const analyticsManifest = {
    paths: [...new Set([...urlEntries.map(e => new URL(e.loc).pathname), ...[...tags.keys()].map(tag => `/tags/${encodeURIComponent(tag)}/`)])],
    articles: articles.map(a => ({path: `/${a.slug}/`, title: a.headline || a.title, market: a.market, tags: a.tags})),
  };
  writeFile(path.join(outDir, "analytics-manifest.json"), JSON.stringify(analyticsManifest));
  writeFile(path.join(outDir, "analytics.js"), fs.readFileSync(path.join(__dirname, "../../../site/analytics/tracker.js"), "utf8"));

  return { outDir, articles: articles.map(article => ({ slug: article.slug, url: article.url, title: article.title, dateModified: article.dateModified })), pages: pages.map(page => page.slug), ads: adsEnabled(config) };
}

function canonicalUrlFor(memoPath, { root, config, published }) {
  const resolved = path.resolve(memoPath);
  const entry = (published.articles || []).find(item => path.resolve(root, item.memo) === resolved);
  if (!entry) return null;
  return `${config.baseUrl}/${entry.slug}/`;
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    process.stdout.write("Usage: build-site.js [--root .] [--config site/site.config.json] [--published site/published.json] [--pages site/pages] [--out site-dist] [--production]\n");
    return;
  }
  const root = path.resolve(args.root || process.cwd());
  const configPath = path.resolve(root, args.config || "site/site.config.json");
  const publishedPath = path.resolve(root, args.published || "site/published.json");
  const result = buildSite({
    root,
    config: readJson(configPath),
    published: readJson(publishedPath),
    pagesDir: path.resolve(root, args.pages || "site/pages"),
    outDir: path.resolve(root, args.out || "site-dist"),
    production: Boolean(args.production),
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (require.main === module) {
  try { main(); } catch (error) { console.error(error.message); process.exit(1); }
}

module.exports = {
  buildSite,
  canonicalUrlFor,
  collectCitations,
  extractAnswer,
  renderBlocks,
  renderInline,
};
