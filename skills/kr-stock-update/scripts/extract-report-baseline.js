#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

function parseArgs(argv) {
  const result = {};

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--input") {
      result.input = argv[i + 1];
      i += 1;
    } else if (arg === "--reference") {
      result.reference = argv[i + 1];
      i += 1;
    } else if (arg === "--dart-cache") {
      result.dartCache = argv[i + 1];
      i += 1;
    } else if (arg === "--output") {
      result.output = argv[i + 1];
      i += 1;
    } else if (arg === "--help" || arg === "-h") {
      result.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return result;
}

function usage() {
  return [
    "Usage:",
    "  node extract-report-baseline.js --input analysis-example/kr/<company>/memo.md [--reference analysis-example/kr/<company>/dart-reference.md] [--dart-cache analysis-example/kr/<company>/dart-cache.json] [--output baseline.json]",
    "",
    "Notes:",
    "  - Parses memo metadata from an existing markdown report.",
    "  - Extracts memo date, recent update date, update-log dates, source URLs, and a short summary excerpt.",
    "  - Can also ingest DART reference digest and cache metadata for later filing updates.",
  ].join("\n");
}

function readText(filePath) {
  return fs.readFileSync(path.resolve(filePath), "utf8");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(filePath), "utf8"));
}

function extractSingleLine(text, label) {
  const pattern = new RegExp(`^(?:[-*]\\s*)?${label}:\\s*(.+)$`, "m");
  return text.match(pattern)?.[1]?.trim().replace(/^`|`$/g, "") || null;
}

function extractTitle(text) {
  return text.match(/^#\s+(.+)$/m)?.[1]?.trim() || null;
}

function cleanCompanyName(title, filePath) {
  const fallback = path.basename(filePath, path.extname(filePath));
  if (!title) {
    return fallback;
  }

  return title
    .replace(/\s+(analysis|memo|report)$/i, "")
    .replace(/\s+(분석 예시|분석|메모|리포트)$/i, "")
    .trim() || fallback;
}

function extractSection(text, heading) {
  const headingPattern = new RegExp(`^##\\s+${heading}\\s*$`, "m");
  const headingMatch = headingPattern.exec(text);
  if (!headingMatch) {
    return "";
  }

  const startIndex = headingMatch.index + headingMatch[0].length;
  const rest = text.slice(startIndex);
  const nextMatch = /\n##\s+/.exec(rest);
  const endIndex = nextMatch ? startIndex + nextMatch.index : text.length;

  return text.slice(startIndex, endIndex).trim();
}

function extractSectionByNames(text, headings) {
  for (const heading of headings) {
    const section = extractSection(text, heading);
    if (section) {
      return section;
    }
  }
  return "";
}

function collapseWhitespace(text) {
  return text.replace(/\r/g, "").replace(/\n{2,}/g, "\n\n").trim();
}

function extractSummaryExcerpt(text) {
  const raw = extractSection(text, "Summary") || extractSection(text, "요약");
  if (!raw) {
    return null;
  }

  const normalized = collapseWhitespace(raw)
    .replace(/!\[[^\]]*]\([^)]+\)/g, "")
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .trim();

  return normalized.slice(0, 600) || null;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function extractUpdateDates(text) {
  return unique(extractUpdateBlocks(text).map((block) => block.date));
}

function normalizeHeadingDate(raw) {
  return raw?.trim().replace(/^`|`$/g, "") || null;
}

function parseUpdateHeading(line) {
  const cleaned = line.trim();
  const match = cleaned.match(/^###\s+(?:(?:\d+[.)]\s+)|[-*]\s*)?`?(\d{4}-\d{2}-\d{2})`?(?:\s+Update)?\s*$/);
  if (!match) {
    return null;
  }
  return normalizeHeadingDate(match[1]);
}

function extractUpdateBlocks(text) {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const blocks = [];
  let active = null;
  let offset = 0;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const date = parseUpdateHeading(line);
    if (date) {
      if (active) {
        active.endLine = i;
        active.content = lines.slice(active.startIndex + 1, i).join("\n").trim();
        active.sourceUrls = extractSourceUrls(active.content);
        active.eventKeys = extractEventKeys(active.content);
        blocks.push(active);
      }
      active = {
        date,
        heading: line.trim(),
        startLine: i + 1,
        startIndex: i,
        startOffset: offset,
        content: "",
        sourceUrls: [],
        eventKeys: [],
      };
    }
    offset += line.length + 1;
  }

  if (active) {
    active.endLine = lines.length;
    active.content = lines.slice(active.startIndex + 1).join("\n").trim();
    active.sourceUrls = extractSourceUrls(active.content);
    active.eventKeys = extractEventKeys(active.content);
    blocks.push(active);
  }

  return blocks;
}

function extractSourceUrls(text) {
  const markdownLinkUrls = [...text.matchAll(/\[[^\]]+]\((https?:\/\/[^)\s]+)\)/g)].map((match) => match[1]);
  const rawUrls = [...text.matchAll(/\bhttps?:\/\/[^\s)>]+/g)].map((match) => match[0]);
  return unique([...markdownLinkUrls, ...rawUrls]);
}

function inferTickerFromUrls(urls) {
  for (const url of urls) {
    const naverMatch = url.match(/[?&]code=(\d{6})\b/i);
    if (naverMatch) {
      return naverMatch[1];
    }

    const yahooMatch = url.match(/\/chart\/([0-9]{6}\.(?:KS|KQ))\b/i);
    if (yahooMatch) {
      return yahooMatch[1].toUpperCase();
    }
  }

  return null;
}

function extractMarkdownImages(text) {
  return [...text.matchAll(/!\[([^\]]*)]\(([^)]+)\)/g)].map((match) => ({
    alt: match[1],
    path: match[2].trim().replace(/^<|>$/g, ""),
  }));
}

function resolveLocalAsset(reportPath, assetPath) {
  if (!assetPath || /^(https?:|mailto:)/i.test(assetPath)) {
    return null;
  }
  return path.resolve(path.dirname(reportPath), decodeURIComponent(assetPath));
}

function extractChartAssets(text, reportPath) {
  return extractMarkdownImages(text)
    .filter((image) => /chart|valuation|backlog|차트|밸류|수주잔고/i.test(`${image.alt} ${image.path}`))
    .map((image) => ({
      ...image,
      resolvedPath: resolveLocalAsset(reportPath, image.path),
      exists: resolveLocalAsset(reportPath, image.path) ? fs.existsSync(resolveLocalAsset(reportPath, image.path)) : false,
    }));
}

function extractSiblingArtifacts(reportPath) {
  const dir = path.dirname(reportPath);
  if (!fs.existsSync(dir)) {
    return [];
  }

  const interestingNames = new Set([
    "data-pack.md",
    "dart-analysis.md",
    "dart-reference.md",
    "dart-cache.json",
    "chart-analysis.md",
    "chart-data.json",
    "order-backlog-analysis.md",
    "order-backlog-data.json",
    "order-backlog-chart-summary.json",
    "analyst-report-insight.md",
    "foreign-views.md",
    "foreign-analyst-views.md",
    "naver-insights.md",
    "gate-report.json",
    "valuation-history.json",
  ]);

  return fs.readdirSync(dir)
    .filter((name) => interestingNames.has(name) || /^assets(?:-.+)?$/.test(name))
    .map((name) => {
      const artifactPath = path.join(dir, name);
      const stats = fs.statSync(artifactPath);
      return {
        name,
        path: artifactPath,
        type: stats.isDirectory() ? "directory" : "file",
        modifiedAt: stats.mtime.toISOString(),
      };
    });
}

function parseMarkdownTable(section) {
  const rows = [];
  const lines = section.split("\n").map((line) => line.trim()).filter(Boolean);
  const headerIndex = lines.findIndex((line) => /^\|.+\|$/.test(line));
  if (headerIndex < 0 || headerIndex + 1 >= lines.length || !/^\|?\s*:?-{3,}:?\s*\|/.test(lines[headerIndex + 1])) {
    return rows;
  }

  const headers = lines[headerIndex].split("|").slice(1, -1).map((cell) => cell.trim());
  for (const line of lines.slice(headerIndex + 2)) {
    if (!/^\|.+\|$/.test(line)) {
      break;
    }
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    if (cells.length !== headers.length) {
      continue;
    }
    rows.push(Object.fromEntries(headers.map((header, index) => [header, cells[index]])));
  }
  return rows;
}

function extractSectionSnapshot(text, headings) {
  const snapshot = {};
  for (const heading of headings) {
    const raw = extractSection(text, heading);
    snapshot[heading] = raw
      ? {
          present: true,
          excerpt: collapseWhitespace(raw).slice(0, 1200),
          tableRows: parseMarkdownTable(raw),
        }
      : {
          present: false,
          excerpt: null,
          tableRows: [],
        };
  }
  return snapshot;
}

function extractGuardDecision(text) {
  const section = extractSectionByNames(text, ["guard-decision", "Guard Decision", "Decision Block"]);
  if (!section) {
    const fenced = text.match(/```guard-decision\s+([\s\S]*?)```/i);
    if (!fenced) {
      return null;
    }
    return {
      format: "fenced",
      raw: fenced[1].trim(),
      trigger: fenced[1].match(/\btrigger:\s*([^\n]+)/i)?.[1]?.trim() || null,
      reviewBy: fenced[1].match(/\breview_by:\s*([^\n]+)/i)?.[1]?.trim() || null,
    };
  }

  return {
    format: "section",
    raw: section,
    trigger: section.match(/\btrigger:\s*([^\n]+)/i)?.[1]?.trim() || null,
    reviewBy: section.match(/\breview_by:\s*([^\n]+)/i)?.[1]?.trim() || null,
  };
}

function extractEventKeys(text) {
  return unique(
    [...text.matchAll(/\beventKey:\s*([A-Za-z0-9._:-]+)/g)].map((match) => match[1]),
  );
}

function classifyStaleSections(sectionSnapshots) {
  return Object.entries(sectionSnapshots)
    .filter(([, snapshot]) => snapshot.present && /needs follow-up|not separately disclosed|미공시|확인 필요|추적/i.test(snapshot.excerpt || ""))
    .map(([heading]) => heading);
}

function fileExists(filePath) {
  return Boolean(filePath) && fs.existsSync(path.resolve(filePath));
}

function extractListSection(text, heading) {
  const section = extractSection(text, heading);
  if (!section) {
    return [];
  }

  return section
    .split("\n")
    .map((line) => line.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean);
}

function parseReferenceMetadata(referencePath) {
  if (!fileExists(referencePath)) {
    return null;
  }

  const text = readText(referencePath);
  return {
    path: path.resolve(referencePath),
    title: extractTitle(text),
    referenceDate: extractSingleLine(text, "reference 기준일"),
    lastCheckedDate: extractSingleLine(text, "최근 확인일"),
    lastFilingChecked: extractSingleLine(text, "마지막 반영 공시일"),
    tocCount: extractSingleLine(text, "TOC 기준 섹션 수"),
    parsedCount: extractSingleLine(text, "완전 파싱"),
    partialCount: extractSingleLine(text, "부분 파싱"),
    missingCount: extractSingleLine(text, "누락"),
    needsReviewCount: extractSingleLine(text, "재검토 필요"),
    nextCheckSections: extractListSection(text, "다음 업데이트 우선 확인 항목"),
  };
}

function parseDartCache(cachePath) {
  if (!fileExists(cachePath)) {
    return null;
  }

  const payload = readJson(cachePath);
  return {
    path: path.resolve(cachePath),
    asOf: payload.reference?.asOf || null,
    lastCheckedAt: payload.reference?.lastCheckedAt || null,
    lastFilingChecked: payload.reference?.lastFilingChecked || null,
    coverage: payload.coverage || null,
  };
}

function buildBaseline(args) {
  const absoluteInput = path.resolve(args.input);
  const text = readText(absoluteInput);
  const title = extractTitle(text);
  const memoDate = extractSingleLine(text, "기준일");
  const recentUpdate = extractSingleLine(text, "최근 업데이트일");
  const updateDates = extractUpdateDates(text);
  const updateBlocks = extractUpdateBlocks(text);
  const sourceUrls = extractSourceUrls(text);
  const referenceMetadata = parseReferenceMetadata(args.reference);
  const dartCacheMetadata = parseDartCache(args.dartCache);
  const sectionSnapshots = extractSectionSnapshot(text, [
    "Decision Frame",
    "Summary",
    "Order Backlog and Revenue Visibility",
    "DART Recheck",
    "Street / Alternative Views",
    "Decision-Changing Issues",
    "Structured Stance",
    "Follow-up Research Prompts",
    "Update Log",
  ]);

  const payload = {
    path: absoluteInput,
    title,
    company: cleanCompanyName(title, absoluteInput),
    memoDate,
    recentUpdate,
    effectiveSourceStartDate: memoDate,
    hasUpdateLog: /^##\s+Update Log\s*$/m.test(text),
    existingUpdateDates: updateDates,
    existingSourceUrls: sourceUrls,
    existingEventKeys: unique(updateBlocks.flatMap((block) => block.eventKeys)),
    updateBlocks,
    summaryExcerpt: extractSummaryExcerpt(text),
    sections: sectionSnapshots,
    decisionFrame: sectionSnapshots["Decision Frame"],
    orderBacklog: sectionSnapshots["Order Backlog and Revenue Visibility"],
    dartRecheck: sectionSnapshots["DART Recheck"],
    decisionChangingIssues: sectionSnapshots["Decision-Changing Issues"],
    structuredStance: sectionSnapshots["Structured Stance"],
    followUpResearchPrompts: sectionSnapshots["Follow-up Research Prompts"],
    guardDecision: extractGuardDecision(text),
    staleSectionAudit: classifyStaleSections(sectionSnapshots),
    chartAssets: extractChartAssets(text, absoluteInput),
    siblingArtifacts: extractSiblingArtifacts(absoluteInput),
    inferredTicker: inferTickerFromUrls(sourceUrls),
    dartReference: referenceMetadata,
    dartCache: dartCacheMetadata,
  };

  return payload;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.input) {
    console.log(usage());
    process.exit(args.help ? 0 : 1);
  }

  const payload = buildBaseline(args);
  const serialized = `${JSON.stringify(payload, null, 2)}\n`;
  if (args.output) {
    fs.writeFileSync(path.resolve(args.output), serialized, "utf8");
  } else {
    process.stdout.write(serialized);
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

module.exports = {
  buildBaseline,
  extractUpdateBlocks,
  extractSourceUrls,
};
