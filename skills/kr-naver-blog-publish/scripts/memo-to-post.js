#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { normalizeSourceCitations } = require("./source-citations");
const {
  assert,
  fileSha256,
  normalizeText,
  sha256,
  writeJsonAtomic,
} = require("./lib");

const EXCLUDED_SECTIONS = new Set([
  "research brief",
  "update log",
  "follow-up research prompts",
  "follow up research prompts",
]);

const HEADING_MAP = new Map([
  ["summary", "한눈에 보는 결론"],
  ["decision frame", "투자 판단의 핵심 축"],
  ["business and thesis", "사업과 투자 논지"],
  ["revenue mix", "매출 구조"],
  ["what the latest results say", "최근 실적이 말해주는 것"],
  ["dart recheck", "공시로 다시 확인한 내용"],
  ["order backlog and revenue visibility", "수주잔고와 매출 가시성"],
  ["street / alternative views", "시장과 반대편 시각"],
  ["current valuation snapshot", "현재 밸류에이션"],
  ["historical valuation bands", "과거 밸류에이션 구간"],
  ["chart and positioning", "차트와 수급 위치"],
  ["governance and structure", "지배구조와 자본배치"],
  ["catalysts", "상승 촉매"],
  ["risks", "반드시 볼 리스크"],
  ["uncomfortable questions", "불편하지만 필요한 질문"],
  ["decision-changing issues", "판단을 바꿀 신호"],
  ["structured stance", "현재 판단"],
  ["sources", "출처"],
  ["why this matters", "왜 중요한가"],
  ["price model", "가격 모델"],
  ["samsung seat scenarios", "삼성 좌석 시나리오"],
  ["samsung sds revenue impact", "삼성SDS 매출 영향"],
  ["why enterprise, not business", "Business가 아니라 Enterprise인 이유"],
  ["investment takeaway", "투자 시사점"],
]);

const IMAGE_LINE_PATTERN = /^!\[([^\]]*)]\(([^)]+\.png(?:\?[^)]*)?)\)\s*$/gim;

const CHART_CAPTIONS = [
  "가격 추세와 이동평균 위치를 먼저 봅니다.",
  "이동평균·밴드·구름을 겹쳐 추세 압력을 확인합니다.",
  "RSI와 MACD로 단기 모멘텀의 방향을 점검합니다.",
  "지지·저항 구간과 구조적 가격대를 확인합니다.",
  "패턴 관점에서 단기 매수·매도 압력의 변화를 확인합니다.",
];

function objectParticle(word) {
  const last = [...word.trim()].at(-1);
  if (!last) return "를";
  const code = last.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return "를";
  return (code - 0xac00) % 28 === 0 ? "를" : "을";
}

function normalizeHeading(heading) {
  const cleaned = heading
    .toLowerCase()
    .replace(/^\d+(?:\.\d+)*\s*[.)-]?\s*/, "")
    .replace(/\s+[—-]\s+.*$/, "")
    .replace(/\s*\([^)]*\)\s*$/, "")
    .trim();
  if (cleaned === "summary judgment") return "summary";
  if (cleaned.startsWith("decision frame")) return "decision frame";
  if (cleaned.startsWith("valuation snapshot")) return "current valuation snapshot";
  if (cleaned.startsWith("chart and positioning")) return "chart and positioning";
  if (cleaned.startsWith("street / alternative views")) return "street / alternative views";
  if (cleaned.startsWith("dart recheck")) return "dart recheck";
  if (cleaned.startsWith("출처")) return "sources";
  if (cleaned.startsWith("무엇을 하는 회사인가")) return "business and thesis";
  return cleaned;
}

function researchSignature(selectedSections, images) {
  const headings = new Set(selectedSections.map(section => normalizeHeading(section.heading)));
  const completed = [];
  if (["business and thesis", "dart recheck"].some(heading => headings.has(heading))) completed.push("공시·사업");
  if (["revenue mix", "what the latest results say"].some(heading => headings.has(heading))) completed.push("실적·재무");
  if (["current valuation snapshot", "historical valuation bands"].some(heading => headings.has(heading))) completed.push("밸류에이션");
  if (images.length || headings.has("chart and positioning")) completed.push("차트·수급");
  if (headings.has("street / alternative views")) completed.push("시장 시각");
  if (["catalysts", "risks", "decision-changing issues"].some(heading => headings.has(heading))) completed.push("리스크·촉매");
  return [
    "**RESEARCH COMPLETE · AI-ASSISTED EQUITY INTELLIGENCE**",
    "Codex (or Claude) × KrResearchKit · Crafted by **ray5273**",
    completed.length ? completed.map(label => `✓ ${label}`).join(" · ") : null,
    "[GitHub](https://github.com/ray5273/kr-research-kit) · Open Research Workflow",
  ].filter(Boolean);
}

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith("--")) throw new Error(`Unexpected argument: ${key}`);
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${key}`);
    args[key.slice(2)] = value;
    i += 1;
  }
  return args;
}

function parseMetadata(markdown) {
  const metadata = {};
  const headerBlock = markdown.split(/\r?\n/).slice(0, 40).join("\n");
  for (const line of headerBlock.split(/\r?\n/)) {
    const match = line.match(/^(?:[-*]\s+)?([^#\n:：]+)[:：]\s*(.+?)\s*$/);
    if (match) metadata[match[1].trim()] = match[2].trim().replace(/^`|`$/g, "").replace(/^\*\*([^*]+)\*\*$/, "$1");
  }
  return metadata;
}

function parseSections(markdown) {
  const sections = [];
  const lines = markdown.split(/\r?\n/);
  let current = null;
  for (const line of lines) {
    const heading = line.match(/^##\s+(.+?)\s*$/);
    if (heading) {
      if (current) sections.push({ heading: current.heading, body: current.lines.join("\n").trim() });
      current = { heading: heading[1].trim(), lines: [] };
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current) sections.push({ heading: current.heading, body: current.lines.join("\n").trim() });
  return sections;
}

function stripLeadingMetadataLines(markdown) {
  return markdown
    .split(/\r?\n/)
    .filter(line => !/^(?:기준일|최근 업데이트일)\s*[:：]\s*`?\d{4}-\d{2}-\d{2}`?\s*$/.test(line.trim()))
    .join("\n")
    .replace(/^\n+/, "");
}

function splitTableRow(line) {
  return line.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());
}

function isDivider(line) {
  const cells = splitTableRow(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function alignmentFromDivider(cell) {
  if (/^:-{3,}:$/.test(cell)) return "center";
  if (/^-{3,}:$/.test(cell)) return "right";
  return "left";
}

function parseMarkdownTableBlock(lines, startIndex = 0) {
  if (!lines[startIndex]?.includes("|") || !lines[startIndex + 1] || !isDivider(lines[startIndex + 1])) return null;
  const tableLines = [lines[startIndex], lines[startIndex + 1]];
  let index = startIndex + 2;
  while (index < lines.length && lines[index].includes("|") && lines[index].trim()) {
    tableLines.push(lines[index]);
    index += 1;
  }
  const headers = splitTableRow(tableLines[0]);
  const divider = splitTableRow(tableLines[1]);
  const rows = tableLines.slice(2).map(splitTableRow).map((cells) => {
    const normalized = [...cells];
    while (normalized.length < headers.length) normalized.push("");
    return normalized.slice(0, headers.length);
  });
  return {
    startIndex,
    endIndex: index,
    lines: tableLines,
    headers,
    alignments: divider.map(alignmentFromDivider),
    rows,
  };
}

function extractMarkdownTables(markdown) {
  const lines = markdown.split(/\r?\n/);
  const tables = [];
  for (let i = 0; i < lines.length; i += 1) {
    const table = parseMarkdownTableBlock(lines, i);
    if (!table) continue;
    tables.push(table);
    i = table.endIndex - 1;
  }
  return tables;
}

function markdownTableToTsv(table) {
  return [table.headers, ...table.rows]
    .map(row => row.map(cell => cell.replace(/<br\s*\/?>/gi, "\n")).join("\t"))
    .join("\n");
}

function convertTables(markdown) {
  const lines = markdown.split(/\r?\n/);
  const output = [];
  for (let i = 0; i < lines.length; i += 1) {
    const table = parseMarkdownTableBlock(lines, i);
    if (!table) { output.push(lines[i]); continue; }
    if (output.length && output.at(-1).trim()) output.push("");
    output.push(...table.lines);
    if (table.endIndex < lines.length && lines[table.endIndex]?.trim()) output.push("");
    i = table.endIndex - 1;
  }
  return output.join("\n");
}

function cleanInternalLinks(markdown) {
  return markdown.replace(/(?<!!)\[([^\]]+)]\((?!https?:\/\/|mailto:)([^)]+)\)/g, (_match, label) => {
    return /\.(?:md|json|csv)$/i.test(label.trim()) ? "내부 검증 자료" : label;
  });
}

function stripImageLines(markdown) {
  return markdown.replace(IMAGE_LINE_PATTERN, "").replace(/\n{3,}/g, "\n\n").trim();
}

// SmartEditor collapses every run of spaces inside a text component, so a
// fenced block loses the column alignment that makes it readable — an ASCII
// chart arrives as one ragged line. Drop fenced blocks from the blog post; the
// source memo keeps them, and the surrounding tables carry the same figures.
function stripFencedBlocks(markdown) {
  const kept = [];
  let fenced = false;
  for (const line of markdown.split(/\r?\n/)) {
    if (/^\s*```/.test(line)) { fenced = !fenced; continue; }
    if (!fenced) kept.push(line);
  }
  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function extractImages(markdown, memoPath, selectedHeadings) {
  const images = [];
  const pattern = /!\[([^\]]*)]\(([^)]+\.png(?:\?[^)]*)?)\)/gi;
  let match;
  while ((match = pattern.exec(markdown)) !== null) {
    const relativePath = match[2].split("?")[0];
    const absolutePath = path.resolve(path.dirname(memoPath), relativePath);
    assert(fs.existsSync(absolutePath), `Linked PNG does not exist: ${relativePath}`);
    assert(fs.statSync(absolutePath).isFile(), `Linked PNG is not a file: ${relativePath}`);
    images.push({
      order: images.length + 1,
      alt: match[1] || `차트 ${images.length + 1}`,
      relativePath,
      absolutePath,
      sha256: fileSha256(absolutePath),
      section: selectedHeadings.find((heading) => heading.body.includes(match[0]))?.heading || null,
    });
  }
  return images;
}

function chartAnalysisSection(images) {
  if (!images.length) return null;
  const body = images.map((image, index) => {
    const caption = CHART_CAPTIONS[index] || `${index + 1}번째 차트입니다.`;
    return `![${image.alt}](${image.relativePath})\n\n차트 ${index + 1}. ${caption}`;
  }).join("\n\n");
  return { heading: "차트 분석", body };
}

function extractSourceLines(markdown) {
  const lines = markdown.split(/\r?\n/);
  const sources = [];
  for (let i = 0; i < lines.length; i += 1) {
    const heading = lines[i].trim().match(/^#{2,6}\s+(.+?)\s*$/);
    if (!heading || normalizeHeading(heading[1]) !== "sources") continue;
    i += 1;
    while (i < lines.length && !/^#{2,6}\s+/.test(lines[i])) {
      if (lines[i].trim()) sources.push(lines[i]);
      i += 1;
    }
    i -= 1;
  }
  return sources.join("\n").trim();
}

function deriveIssue(summary) {
  if (/KKR/.test(summary) && /AI|AX|클라우드/.test(summary)) return "KKR 전략자본과 AI 전환 검증";
  const explicitQuestion = summary.match(/핵심 질문은[^—\n]*[—-]\s*([^\n.]+)/);
  if (explicitQuestion) return explicitQuestion[1].replace(/["“”]/g, "").trim().slice(0, 68);
  const bold = summary.match(/\*\*([\s\S]*?)\*\*/);
  if (bold) return bold[1].replace(/["“”]/g, "").trim().slice(0, 68);
  const sentence = summary.split(/[.!?。]\s/)[0];
  return sentence.replace(/[*_`"“”]/g, "").trim().slice(0, 70);
}

function generateTags(company, ticker, summary) {
  const tags = [company, ticker, "주식분석"];
  const candidates = ["딥밸류", "치지직", "글로벌", "배당", "자사주소각", "별풍선", "플랫폼", "KKR", "AI", "AX", "클라우드", "생성형AI", "삼성그룹"];
  for (const candidate of candidates) {
    if (summary.includes(candidate)) tags.push(candidate);
  }
  return [...new Set(tags.filter(Boolean))].slice(0, 10);
}

function buildPost({ markdown, memoPath, category = null }) {
  const metadata = parseMetadata(markdown);
  const companyTitle = markdown.match(/^#\s+(.+?)(?:\s+투자\s+메모)?\s*$/m)?.[1]?.trim();
  const titleMatch = companyTitle?.match(/^(.+?)\((\d{6})\)/);
  const company = (metadata["대상"] || titleMatch?.[1] || companyTitle || path.basename(path.dirname(memoPath)))
    .replace(/\s+보통주.*$/, "")
    .replace(/\s+[—-]\s+.*$/, "")
    .trim();
  const ticker = metadata["티커"] || titleMatch?.[2] || "";
  const asOfDate = metadata["기준일"] || "";
  assert(company, "Company name could not be derived from memo");
  assert(/^\d{4}-\d{2}-\d{2}$/.test(asOfDate), "Memo must contain a YYYY-MM-DD 기준일");

  const allSections = parseSections(markdown);
  const selected = allSections.filter((section) => !EXCLUDED_SECTIONS.has(normalizeHeading(section.heading)));
  const summary = stripLeadingMetadataLines(allSections.find((section) => normalizeHeading(section.heading) === "summary")?.body || "");
  assert(summary, "Memo must contain a Summary section");
  const issue = deriveIssue(summary);
  const title = `${company} | ${issue} | ${asOfDate}`.slice(0, 100);
  const images = extractImages(markdown, memoPath, selected);
  const signature = researchSignature(selected, images);
  const hasSelectedSources = selected.some(section => normalizeHeading(section.heading) === "sources");

  const parts = [
    `# ${title}`,
    "",
    `이 글은 ${asOfDate} 기준으로 ${company}${objectParticle(company)} 개인 투자자의 관점에서 정리한 리서치입니다. 숫자와 공시를 중심으로 보고, 강세 논리와 반대 논리를 함께 남깁니다.`,
  ];
  for (const section of selected) {
    const normalizedHeading = normalizeHeading(section.heading);
    const mapped = HEADING_MAP.get(normalizedHeading) || section.heading;
    let body = convertTables(normalizedHeading === "summary" ? stripLeadingMetadataLines(section.body) : section.body);
    body = stripImageLines(body);
    body = stripFencedBlocks(body);
    body = cleanInternalLinks(body);
    if (!body) continue;
    parts.push("", `## ${mapped}`, "", body);
    if (normalizedHeading === "summary") {
      const chartSection = chartAnalysisSection(images);
      if (chartSection) parts.push("", `## ${chartSection.heading}`, "", chartSection.body);
    }
  }
  if (!hasSelectedSources) {
    const sourceLines = cleanInternalLinks(extractSourceLines(markdown));
    if (sourceLines) parts.push("", "## 출처", "", sourceLines);
  }
  parts.push(
    "",
    "---",
    "",
    `기준일: ${asOfDate}`,
    "",
    "본 글은 공개된 자료를 바탕으로 작성한 개인 리서치이며, 특정 종목의 매수·매도를 권유하지 않습니다. 투자 판단과 그 결과에 대한 책임은 투자자 본인에게 있습니다.",
    "",
    ...signature.map(line => `> ${line}`),
  );
  const postMarkdown = `${normalizeText(normalizeSourceCitations(parts.join("\n")))}\n`;
  return {
    metadata,
    postMarkdown,
    manifest: {
      schemaVersion: 1,
      status: "converted",
      source: {
        memoPath: path.resolve(memoPath),
        memoSha256: fileSha256(memoPath),
        asOfDate,
      },
      post: {
        company,
        ticker,
        title,
        issue,
        category: category || null,
        tags: generateTags(company, ticker, summary),
        markdownPath: null,
        markdownSha256: sha256(postMarkdown),
        images,
        thumbnail: null,
      },
      prepare: null,
      publish: null,
    },
  };
}

// Primary sources = filings, company releases and IR material. Teaser posts
// keep only these so the Naver summary stays short and points to the original.
const PRIMARY_SOURCE_HOST = /(?:^|\.)(?:sec\.gov|dart\.fss\.or\.kr|kind\.krx\.co\.kr|krx\.co\.kr|q4cdn\.com|opendart\.fss\.or\.kr)$/i;
const PRIMARY_SOURCE_LABEL = /공시|보도자료|사업보고서|분기보고서|반기보고서|감사보고서|정정|IR|실적 발표|실적 콜|10-K|10-Q|8-K|20-F|6-K|Form 4|proxy|investor/i;

function isPrimarySourceLine(line) {
  const url = line.match(/https?:\/\/[^\s)]+/)?.[0];
  if (!url) return false;
  try {
    const host = new URL(url).hostname;
    if (PRIMARY_SOURCE_HOST.test(host) || /^(?:ir|investors?)\./i.test(host)) return true;
  } catch {}
  const label = line.match(/\[([^\]]+)]\(/)?.[1] || line.slice(0, line.indexOf(url));
  return PRIMARY_SOURCE_LABEL.test(label);
}

function resolveCanonicalUrl(memoPath, { root, siteConfigPath, publishedPath }) {
  assert(fs.existsSync(siteConfigPath), `Teaser mode needs ${siteConfigPath} (or --canonical-url)`);
  assert(fs.existsSync(publishedPath), `Teaser mode needs ${publishedPath} (or --canonical-url)`);
  const config = JSON.parse(fs.readFileSync(siteConfigPath, "utf8"));
  const published = JSON.parse(fs.readFileSync(publishedPath, "utf8"));
  const entry = (published.articles || []).find(item => path.resolve(root, item.memo) === path.resolve(memoPath));
  assert(entry, `Memo is not listed in ${publishedPath}; add it to the site before writing a teaser`);
  return `${String(config.baseUrl).replace(/\/+$/, "")}/${entry.slug}/`;
}

// Naver summary post: Summary + one key table + one chart + link to the
// canonical site article, primary sources, disclaimer and signature. Keeps the
// full memo off Naver so the two copies are not judged as duplicates.
function buildTeaser({ markdown, memoPath, canonicalUrl, category = null }) {
  assert(/^https:\/\/[^\s]+$/.test(canonicalUrl || ""), "Teaser mode needs an https canonical URL");
  const full = buildPost({ markdown, memoPath, category });
  const { company, ticker, title } = full.manifest.post;
  const asOfDate = full.manifest.source.asOfDate;
  const allSections = parseSections(markdown);
  const selected = allSections.filter(section => !EXCLUDED_SECTIONS.has(normalizeHeading(section.heading)) && normalizeHeading(section.heading) !== "sources");
  const summarySection = selected.find(section => normalizeHeading(section.heading) === "summary");
  const summary = cleanInternalLinks(stripFencedBlocks(stripImageLines(convertTables(stripLeadingMetadataLines(summarySection.body)))));

  let keyTable = null;
  if (!extractMarkdownTables(summary).length) {
    for (const section of selected) {
      if (section === summarySection) continue;
      const table = extractMarkdownTables(section.body)[0];
      if (!table) continue;
      const heading = normalizeHeading(section.heading);
      keyTable = { heading: HEADING_MAP.get(heading) || section.heading, markdown: cleanInternalLinks(table.lines.join("\n")) };
      break;
    }
  }
  const image = full.manifest.post.images[0] ? { ...full.manifest.post.images[0], order: 1, section: "핵심 차트" } : null;

  const sourceLines = extractSourceLines(markdown).split(/\r?\n/).filter(line => line.trim());
  const primary = sourceLines.filter(isPrimarySourceLine);
  const keptSources = cleanInternalLinks((primary.length ? primary : sourceLines.slice(0, 5)).join("\n"));

  const parts = [
    `# ${title}`,
    "",
    `${asOfDate} 기준 ${company}${ticker && !company.includes("(") ? `(${ticker})` : ""} 리서치의 요약입니다. 결론과 핵심 숫자만 옮겼고, 전체 분석은 원문에 있습니다.`,
    "",
    `## ${HEADING_MAP.get("summary")}`,
    "",
    summary,
  ];
  if (keyTable) parts.push("", `## ${keyTable.heading}`, "", keyTable.markdown);
  if (image) parts.push("", "## 핵심 차트", "", `![${image.alt}](${image.relativePath})`, "", `차트. ${image.alt}`);
  parts.push(
    "",
    "## 전문과 업데이트는 원문에서",
    "",
    "밸류에이션, 리스크, 판단을 바꿀 신호와 이후 업데이트 내역은 원문 페이지에서 이어집니다. 원문은 기준일 이후 내용이 바뀌면 같은 주소에서 갱신됩니다.",
    "",
    `원문 전체 보기: ${canonicalUrl}`,
  );
  if (keptSources) parts.push("", "## 출처", "", keptSources);
  parts.push(
    "",
    "---",
    "",
    `기준일: ${asOfDate}`,
    "",
    "본 글은 공개된 자료를 바탕으로 작성한 개인 리서치이며, 특정 종목의 매수·매도를 권유하지 않습니다. 투자 판단과 그 결과에 대한 책임은 투자자 본인에게 있습니다.",
    "",
    ...researchSignature(selected, image ? [image] : []).map(line => `> ${line}`),
  );
  const postMarkdown = `${normalizeText(normalizeSourceCitations(parts.join("\n")))}\n`;
  const manifest = full.manifest;
  manifest.post.mode = "teaser";
  manifest.post.canonicalUrl = canonicalUrl;
  manifest.post.images = image ? [image] : [];
  manifest.post.markdownSha256 = sha256(postMarkdown);
  return { metadata: full.metadata, postMarkdown, manifest };
}

function main() {
  const args = parseArgs(process.argv);
  assert(args.memo, "Usage: memo-to-post.js --memo <memo.md> [--mode full|teaser] [--canonical-url <url>] [--out <naver-post.md>] [--manifest <json>] [--category <name>]");
  const mode = args.mode || "full";
  assert(["full", "teaser"].includes(mode), `Unknown --mode ${mode}; use full or teaser`);
  const memoPath = path.resolve(args.memo);
  assert(fs.existsSync(memoPath), `Memo not found: ${memoPath}`);
  const defaultName = mode === "teaser" ? "naver-teaser" : "naver-post";
  const outPath = path.resolve(args.out || path.join(path.dirname(memoPath), `${defaultName}.md`));
  const manifestPath = path.resolve(args.manifest || path.join(path.dirname(outPath), mode === "teaser" ? "naver-teaser-publish.json" : "naver-publish.json"));
  const markdown = fs.readFileSync(memoPath, "utf8");
  let result;
  if (mode === "teaser") {
    const root = path.resolve(args.root || process.cwd());
    const canonicalUrl = args["canonical-url"] || resolveCanonicalUrl(memoPath, {
      root,
      siteConfigPath: path.resolve(root, args["site-config"] || "site/site.config.json"),
      publishedPath: path.resolve(root, args.published || "site/published.json"),
    });
    result = buildTeaser({ markdown, memoPath, canonicalUrl, category: args.category });
  } else {
    result = buildPost({ markdown, memoPath, category: args.category });
  }
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, result.postMarkdown, "utf8");
  result.manifest.post.markdownPath = outPath;
  writeJsonAtomic(manifestPath, result.manifest);
  process.stdout.write(`${JSON.stringify({ mode, outPath, manifestPath, title: result.manifest.post.title, canonicalUrl: result.manifest.post.canonicalUrl || null, images: result.manifest.post.images.length, tags: result.manifest.post.tags }, null, 2)}\n`);
}

if (require.main === module) {
  try { main(); } catch (error) { console.error(error.message); process.exit(1); }
}

module.exports = {
  EXCLUDED_SECTIONS,
  HEADING_MAP,
  buildPost,
  buildTeaser,
  cleanInternalLinks,
  convertTables,
  deriveIssue,
  extractMarkdownTables,
  isDivider,
  isPrimarySourceLine,
  markdownTableToTsv,
  normalizeHeading,
  parseMarkdownTableBlock,
  parseMetadata,
  parseSections,
  splitTableRow,
  stripLeadingMetadataLines,
};
