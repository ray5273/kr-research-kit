#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const EXPECTED_ITEMS = {
  "10-K": [
    ["Item 1", "Business"],
    ["Item 1A", "Risk Factors"],
    ["Item 1B", "Unresolved Staff Comments"],
    ["Item 1C", "Cybersecurity"],
    ["Item 2", "Properties"],
    ["Item 3", "Legal Proceedings"],
    ["Item 4", "Mine Safety Disclosures"],
    ["Item 5", "Market for Registrant's Common Equity"],
    ["Item 6", "Reserved"],
    ["Item 7", "Management's Discussion and Analysis"],
    ["Item 7A", "Quantitative and Qualitative Disclosures About Market Risk"],
    ["Item 8", "Financial Statements and Supplementary Data"],
    ["Item 9", "Changes in and Disagreements With Accountants"],
    ["Item 9A", "Controls and Procedures"],
    ["Item 9B", "Other Information"],
    ["Item 9C", "Disclosure Regarding Foreign Jurisdictions"],
    ["Item 10", "Directors, Executive Officers and Corporate Governance"],
    ["Item 11", "Executive Compensation"],
    ["Item 12", "Security Ownership"],
    ["Item 13", "Certain Relationships and Related Transactions"],
    ["Item 14", "Principal Accountant Fees and Services"],
    ["Item 15", "Exhibits and Financial Statement Schedules"],
    ["Item 16", "Form 10-K Summary"],
  ],
  "10-Q": [
    ["Part I Item 1", "Financial Statements"],
    ["Part I Item 2", "Management's Discussion and Analysis"],
    ["Part I Item 3", "Quantitative and Qualitative Disclosures About Market Risk"],
    ["Part I Item 4", "Controls and Procedures"],
    ["Part II Item 1", "Legal Proceedings"],
    ["Part II Item 1A", "Risk Factors"],
    ["Part II Item 2", "Unregistered Sales of Equity Securities"],
    ["Part II Item 3", "Defaults Upon Senior Securities"],
    ["Part II Item 4", "Mine Safety Disclosures"],
    ["Part II Item 5", "Other Information"],
    ["Part II Item 6", "Exhibits"],
  ],
};

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--input") {
      result.input = argv[index + 1];
      index += 1;
    } else if (arg === "--form") {
      result.form = argv[index + 1].toUpperCase();
      index += 1;
    } else if (arg === "--output") {
      result.output = argv[index + 1];
      index += 1;
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
    "  node extract-sec-sections.js --input latest-10k.txt --form 10-K --output sec-sections.json",
    "",
    "Parses 10-K/10-Q Item headings and emits parsed, partial, missing, or needs_review coverage.",
  ].join("\n");
}

function readText(filePath) {
  return fs.readFileSync(path.resolve(filePath), "utf8");
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
  fs.writeFileSync(path.resolve(filePath), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function normalizeLines(text) {
  return text
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trimEnd());
}

function canonicalPart(value) {
  if (!value) {
    return null;
  }
  const roman = value.toUpperCase().match(/PART\s+([IVX]+)/);
  return roman ? `Part ${roman[1]}` : null;
}

function canonicalItem(value) {
  return `Item ${String(value).toUpperCase().replace(/\s+/g, "")}`;
}

function classifyHeading(line, currentPart) {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }

  const inline = trimmed.match(/^(PART\s+[IVX]+)\s+ITEM\s+(\d+[A-Z]?)\.?\s*[:.\-]?\s*(.+)?$/i);
  if (inline) {
    const part = canonicalPart(inline[1]);
    const item = canonicalItem(inline[2]);
    return {
      part,
      item,
      key10k: item,
      key10q: `${part} ${item}`,
      title: `${part} ${item}${inline[3] ? ` ${inline[3].trim()}` : ""}`,
    };
  }

  const itemOnly = trimmed.match(/^ITEM\s+(\d+[A-Z]?)\.?\s*[:.\-]?\s*(.+)?$/i);
  if (itemOnly) {
    const item = canonicalItem(itemOnly[1]);
    return {
      part: currentPart,
      item,
      key10k: item,
      key10q: currentPart ? `${currentPart} ${item}` : item,
      title: `${currentPart ? `${currentPart} ` : ""}${item}${itemOnly[2] ? ` ${itemOnly[2].trim()}` : ""}`,
    };
  }

  return null;
}

function countMatches(text, pattern) {
  return [...text.matchAll(pattern)].length;
}

function collapseText(lines) {
  return lines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function buildCandidates(lines, form) {
  const candidates = [];
  let currentPart = null;

  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();
    const partOnly = trimmed.match(/^PART\s+([IVX]+)\b/i);
    if (partOnly) {
      currentPart = `Part ${partOnly[1].toUpperCase()}`;
    }

    const heading = classifyHeading(trimmed, currentPart);
    if (!heading) {
      continue;
    }

    candidates.push({
      ...heading,
      key: form === "10-Q" ? heading.key10q : heading.key10k,
      lineNumber: index + 1,
    });
  }

  for (let index = 0; index < candidates.length; index += 1) {
    const current = candidates[index];
    const next = candidates[index + 1];
    const startLine = current.lineNumber + 1;
    const endLine = next ? next.lineNumber - 1 : lines.length;
    const content = collapseText(lines.slice(startLine - 1, endLine));
    current.startLine = startLine;
    current.endLine = endLine;
    current.content = content;
    current.contentLength = content.length;
    current.numericBlockCount = countMatches(content, /\d[\d,]*(?:\.\d+)?(?:%|\s*(?:million|billion|thousand|shares|dollars|USD))?/gi);
    current.preview = content.slice(0, 320);
  }

  return candidates;
}

function chooseBestCandidate(candidates, expectedKey) {
  const matches = candidates.filter((candidate) => candidate.key === expectedKey);
  if (matches.length === 0) {
    return null;
  }
  return matches.sort((left, right) => right.contentLength - left.contentLength)[0];
}

function statusFor(candidate, expectedKey) {
  if (!candidate) {
    return "missing";
  }
  const critical = /Item 1A|Item 7|Item 8|Part I Item 1|Part I Item 2|Part II Item 1A/.test(expectedKey);
  if (candidate.contentLength >= (critical ? 700 : 250)) {
    return "parsed";
  }
  if (candidate.contentLength >= 80) {
    return "partial";
  }
  return "needs_review";
}

function extractSections(text, form) {
  const lines = normalizeLines(text);
  const candidates = buildCandidates(lines, form);
  const expected = EXPECTED_ITEMS[form] || [];
  const items = expected.map(([key, expectedTitle], index) => {
    const candidate = chooseBestCandidate(candidates, key);
    const status = statusFor(candidate, key);
    return {
      id: `sec-item-${String(index + 1).padStart(3, "0")}`,
      key,
      expectedTitle,
      detectedTitle: candidate ? candidate.title : null,
      status,
      startLine: candidate ? candidate.startLine : null,
      endLine: candidate ? candidate.endLine : null,
      contentLength: candidate ? candidate.contentLength : 0,
      numericBlockCount: candidate ? candidate.numericBlockCount : 0,
      preview: candidate ? candidate.preview : "",
      content: candidate ? candidate.content : "",
    };
  });

  const summary = {
    parsedCount: items.filter((item) => item.status === "parsed").length,
    partialCount: items.filter((item) => item.status === "partial").length,
    missingCount: items.filter((item) => item.status === "missing").length,
    needsReviewCount: items.filter((item) => item.status === "needs_review").length,
  };
  summary.completionRate = items.length > 0 ? summary.parsedCount / items.length : 0;

  return {
    extractedAt: new Date().toISOString(),
    form,
    sourceLineCount: lines.length,
    expectedItemCount: expected.length,
    candidateHeadingCount: candidates.length,
    summary,
    items,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.input || !args.form || !args.output) {
    console.log(usage());
    process.exit(args.help ? 0 : 1);
  }
  if (!EXPECTED_ITEMS[args.form]) {
    throw new Error(`Unsupported form for section extraction: ${args.form}`);
  }

  const payload = extractSections(readText(args.input), args.form);
  writeJson(args.output, payload);
}

try {
  main();
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exit(1);
}
