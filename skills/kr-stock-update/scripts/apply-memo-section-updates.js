#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const ALLOWED_SECTIONS = new Set([
  "Summary",
  "Structured Stance",
  "Decision-Changing Issues",
  "Follow-up Research Prompts",
  "DART Recheck",
  "Decision Frame",
  "Order Backlog and Revenue Visibility",
  "guard-decision",
  "Decision Block",
]);

const RESERVED_SECTIONS = new Set(["Update Log", "Sources"]);

function parseArgs(argv) {
  const result = { allowInsert: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--input") {
      result.input = argv[i + 1];
      i += 1;
    } else if (arg === "--report") {
      result.report = argv[i + 1];
      i += 1;
    } else if (arg === "--output") {
      result.output = argv[i + 1];
      i += 1;
    } else if (arg === "--allow-insert") {
      result.allowInsert = true;
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
    "  node apply-memo-section-updates.js --report analysis-example/kr/<company>/memo.md --input section-updates.json [--output updated.md] [--allow-insert]",
    "",
    "Expected JSON:",
    '  { "sections": { "Summary": "...", "Structured Stance": "..." } }',
    "",
    "Notes:",
    "  - Only gated thesis-maintenance sections are allowed.",
    "  - 기준일 must not change.",
    "  - 최근 업데이트일 and Update Log are owned by normalize-update-log.js.",
  ].join("\n");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(filePath), "utf8"));
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractMemoDate(text) {
  return text.match(/^기준일:\s*(.+)$/m)?.[1]?.trim() || null;
}

function extractMemoDateLines(text) {
  return [...text.matchAll(/^기준일:\s*(.+)$/gm)].map((match) => match[1].trim());
}

function findSectionRange(text, heading) {
  const pattern = new RegExp(`^##\\s+${escapeRegExp(heading)}\\s*$`, "m");
  const match = pattern.exec(text);
  if (!match) {
    return null;
  }
  const bodyStart = match.index + match[0].length;
  const rest = text.slice(bodyStart);
  const next = /\n##\s+/.exec(rest);
  const end = next ? bodyStart + next.index : text.length;
  return {
    start: match.index,
    bodyStart,
    end,
    headingLine: match[0],
  };
}

function normalizeSectionBody(body) {
  return String(body || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}

function validateSections(sections) {
  if (!sections || typeof sections !== "object" || Array.isArray(sections)) {
    throw new Error("Input JSON must include a sections object.");
  }
  for (const heading of Object.keys(sections)) {
    if (RESERVED_SECTIONS.has(heading)) {
      throw new Error(`${heading} is reserved; use the dedicated script for that section.`);
    }
    if (!ALLOWED_SECTIONS.has(heading)) {
      throw new Error(`${heading} is not an allowed gated update section.`);
    }
  }
}

function appendBeforeUpdateLog(text, heading, body) {
  const updateLogRange = findSectionRange(text, "Update Log");
  const block = `## ${heading}\n\n${body.trim()}\n\n`;
  if (!updateLogRange) {
    return `${text.trimEnd()}\n\n${block.trimEnd()}\n`;
  }
  return `${text.slice(0, updateLogRange.start).trimEnd()}\n\n${block}${text.slice(updateLogRange.start)}`;
}

function applySectionUpdates(reportText, payload, options = {}) {
  const originalMemoDate = extractMemoDate(reportText);
  const originalMemoDateLines = extractMemoDateLines(reportText);
  validateSections(payload.sections);

  let next = reportText;
  for (const [heading, rawBody] of Object.entries(payload.sections)) {
    const body = normalizeSectionBody(rawBody);
    const range = findSectionRange(next, heading);
    if (!range && !options.allowInsert) {
      throw new Error(`Section not found and --allow-insert was not set: ${heading}`);
    }

    if (!range) {
      next = appendBeforeUpdateLog(next, heading, body);
      continue;
    }

    next = `${next.slice(0, range.bodyStart)}\n\n${body}\n${next.slice(range.end)}`;
  }

  const nextMemoDate = extractMemoDate(next);
  const nextMemoDateLines = extractMemoDateLines(next);
  if (originalMemoDate && nextMemoDate !== originalMemoDate) {
    throw new Error("Refusing to change 기준일.");
  }
  if (JSON.stringify(nextMemoDateLines) !== JSON.stringify(originalMemoDateLines)) {
    throw new Error("Refusing to add, remove, or duplicate 기준일 lines.");
  }

  return next.endsWith("\n") ? next : `${next}\n`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.input || !args.report) {
    console.log(usage());
    process.exit(args.help ? 0 : 1);
  }

  const payload = readJson(args.input);
  const reportPath = path.resolve(args.report);
  const reportText = fs.readFileSync(reportPath, "utf8");
  const updated = applySectionUpdates(reportText, payload, { allowInsert: args.allowInsert });
  const target = path.resolve(args.output || args.report);
  fs.writeFileSync(target, updated, "utf8");
  console.log(`Updated ${target}`);
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
  ALLOWED_SECTIONS,
  applySectionUpdates,
};
