#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--input") {
      result.input = argv[index + 1];
      index += 1;
    } else if (arg === "--sections") {
      result.sections = argv[index + 1];
      index += 1;
    } else if (arg === "--facts") {
      result.facts = argv[index + 1];
      index += 1;
    } else if (arg === "--output") {
      result.output = argv[index + 1];
      index += 1;
    } else if (arg === "--cache-out") {
      result.cacheOut = argv[index + 1];
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
    "  node build-sec-reference.js --input sec-filing-export.json --sections sec-sections.json --facts sec-companyfacts.json --output sec-reference.md [--cache-out sec-cache.json]",
  ].join("\n");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(filePath), "utf8"));
}

function writeText(filePath, text) {
  fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
  fs.writeFileSync(path.resolve(filePath), text, "utf8");
}

function escapeCell(value) {
  if (value === null || value === undefined || value === "") {
    return "not separately disclosed";
  }
  return String(value).replace(/\|/g, "\\|").replace(/\n+/g, " ").trim();
}

function truncate(value, maxLength) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 3)}...`;
}

function firstFact(metricPayload) {
  if (!metricPayload || metricPayload.status !== "found") {
    return null;
  }
  const unitEntries = Object.entries(metricPayload.units || {});
  for (const [, facts] of unitEntries) {
    if (facts && facts.length > 0) {
      return facts[0];
    }
  }
  return null;
}

function filingRoleLabel(filing) {
  if (filing.missing) {
    return `Latest ${filing.requestedForm}`;
  }
  return `Latest ${filing.requestedForm}`;
}

function renderMarkdown(exportPayload, sectionsPayload, factsPayload) {
  const company = exportPayload.company || {};
  const titleName = company.name || company.ticker || `CIK${company.cik10 || ""}`;
  const asOf = new Date().toISOString().slice(0, 10);
  const lines = [];

  lines.push(`# ${titleName} SEC Reference`);
  lines.push("");
  lines.push("<!-- US_SEC_REFERENCE_DIGEST_EXAMPLE -->");
  lines.push("");
  lines.push("## Reference Cache Metadata");
  lines.push("");
  lines.push(`- 회사명: ${company.name || "not separately disclosed"}`);
  lines.push(`- 티커: \`${company.ticker || "not separately disclosed"}\``);
  lines.push(`- CIK: \`${company.cik10 || company.cik || "not separately disclosed"}\``);
  lines.push(`- 기준일: ${asOf}`);
  lines.push(`- 생성일: ${exportPayload.generatedAt || asOf}`);
  lines.push(`- SEC fair access: declared User-Agent, cached requests, below 10 requests/second`);
  lines.push("");

  lines.push("## Filing Set");
  lines.push("");
  lines.push("| 역할 | Form | Accession | Filed | Period | URL |");
  lines.push("| --- | --- | --- | --- | --- | --- |");
  for (const filing of exportPayload.selectedFilings || []) {
    lines.push(
      `| ${escapeCell(filingRoleLabel(filing))} | ${escapeCell(filing.form || filing.requestedForm)} | ${escapeCell(filing.accessionNumber)} | ${escapeCell(filing.filingDate)} | ${escapeCell(filing.reportDate)} | ${escapeCell(filing.primaryDocumentUrl || filing.indexUrl)} |`
    );
  }
  lines.push("");

  lines.push("## XBRL Core Facts");
  lines.push("");
  lines.push("| Metric | Latest value | Unit | Period | Form | Filed | Concept | Accession |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const [metric, payload] of Object.entries(factsPayload.concepts || {})) {
    const fact = firstFact(payload);
    if (!fact) {
      lines.push(`| ${escapeCell(metric)} | not separately disclosed | not separately disclosed | not separately disclosed | not separately disclosed | not separately disclosed | ${escapeCell((payload.conceptsTried || []).join(", "))} | not separately disclosed |`);
      continue;
    }
    const period = fact.start ? `${fact.start} to ${fact.end}` : fact.end;
    lines.push(`| ${escapeCell(metric)} | ${escapeCell(fact.val)} | ${escapeCell(fact.unit)} | ${escapeCell(period)} | ${escapeCell(fact.form)} | ${escapeCell(fact.filed)} | ${escapeCell(`${fact.taxonomy}:${fact.concept}`)} | ${escapeCell(fact.accn)} |`);
  }
  lines.push("");

  lines.push("## Section Coverage");
  lines.push("");
  lines.push("| Item | Title | Status | Content length | Numeric blocks |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const item of sectionsPayload.items || []) {
    lines.push(`| ${escapeCell(item.key)} | ${escapeCell(item.detectedTitle || item.expectedTitle)} | ${escapeCell(item.status)} | ${escapeCell(item.contentLength)} | ${escapeCell(item.numericBlockCount)} |`);
  }
  lines.push("");

  lines.push("## Key Section Digest");
  lines.push("");
  lines.push("| Item | Title | Preview | Status |");
  lines.push("| --- | --- | --- | --- |");
  for (const item of (sectionsPayload.items || []).filter((entry) => entry.status !== "missing").slice(0, 12)) {
    lines.push(`| ${escapeCell(item.key)} | ${escapeCell(item.detectedTitle || item.expectedTitle)} | ${escapeCell(truncate(item.preview, 220))} | ${escapeCell(item.status)} |`);
  }
  lines.push("");

  lines.push("## Not Separately Disclosed / Needs Review Log");
  lines.push("");
  const weakSections = (sectionsPayload.items || []).filter((item) => item.status === "missing" || item.status === "needs_review" || item.status === "partial");
  for (const item of weakSections.slice(0, 15)) {
    lines.push(`- ${item.key} ${item.expectedTitle}: ${item.status}`);
  }
  const missingFacts = Object.entries(factsPayload.concepts || {}).filter(([, payload]) => payload.status !== "found");
  for (const [metric, payload] of missingFacts) {
    lines.push(`- ${metric}: not separately disclosed in standard SEC companyfacts (${(payload.conceptsTried || []).join(", ")})`);
  }
  if (weakSections.length === 0 && missingFacts.length === 0) {
    lines.push("- 기준 artifact에서 즉시 재확인 필요 항목 없음");
  }
  lines.push("");

  lines.push("## Source Map");
  lines.push("");
  lines.push("| Claim or metric | Source type | Document or concept | Filed | Accession | URL | Status |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- |");
  for (const row of exportPayload.sourceMap || []) {
    lines.push(`| ${escapeCell(row.claim)} | ${escapeCell(row.sourceType)} | ${escapeCell(row.documentOrConcept)} | ${escapeCell(row.filed)} | ${escapeCell(row.accession)} | ${escapeCell(row.url)} | ${escapeCell(row.status)} |`);
  }
  for (const [metric, payload] of Object.entries(factsPayload.concepts || {})) {
    const fact = firstFact(payload);
    if (!fact) {
      continue;
    }
    lines.push(`| ${escapeCell(metric)} | SEC companyfacts | ${escapeCell(`${fact.taxonomy}:${fact.concept}`)} | ${escapeCell(fact.filed)} | ${escapeCell(fact.accn)} | ${escapeCell(factsPayload.sourceUrl)} | found |`);
  }
  lines.push("");

  lines.push("## Next Update Checklist");
  lines.push("");
  lines.push("- 새 10-Q 또는 10-K accession이 있는지 SEC submissions API에서 확인");
  lines.push("- 새 8-K의 `items` 값이 실적, 자본정책, 리스크 이벤트와 관련되는지 확인");
  lines.push("- `needs_review` 또는 `partial` 섹션은 원문 filing HTML에서 재확인");
  lines.push("- companyfacts 표준 concept이 비어 있는 지표는 filing table 또는 custom taxonomy 여부 확인");

  return `${lines.join("\n")}\n`;
}

function buildCache(exportPayload, sectionsPayload, factsPayload) {
  return {
    generatedAt: new Date().toISOString(),
    company: exportPayload.company || {},
    filings: (exportPayload.selectedFilings || []).map((filing) => ({
      requestedForm: filing.requestedForm,
      form: filing.form,
      accessionNumber: filing.accessionNumber || null,
      filingDate: filing.filingDate || null,
      reportDate: filing.reportDate || null,
      primaryDocumentUrl: filing.primaryDocumentUrl || null,
      status: filing.missing ? "missing" : "selected",
    })),
    xbrl: Object.fromEntries(
      Object.entries(factsPayload.concepts || {}).map(([metric, payload]) => [
        metric,
        {
          status: payload.status,
          taxonomy: payload.taxonomy,
          selectedConcept: payload.selectedConcept,
          latestFact: firstFact(payload),
        },
      ])
    ),
    sectionCoverage: {
      form: sectionsPayload.form,
      summary: sectionsPayload.summary,
      weakItems: (sectionsPayload.items || [])
        .filter((item) => item.status !== "parsed")
        .map((item) => ({
          key: item.key,
          expectedTitle: item.expectedTitle,
          status: item.status,
        })),
    },
    sourceMap: exportPayload.sourceMap || [],
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.input || !args.sections || !args.facts || !args.output) {
    console.log(usage());
    process.exit(args.help ? 0 : 1);
  }

  const exportPayload = readJson(args.input);
  const sectionsPayload = readJson(args.sections);
  const factsPayload = readJson(args.facts);
  writeText(args.output, renderMarkdown(exportPayload, sectionsPayload, factsPayload));
  if (args.cacheOut) {
    writeText(args.cacheOut, `${JSON.stringify(buildCache(exportPayload, sectionsPayload, factsPayload), null, 2)}\n`);
  }
}

try {
  main();
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exit(1);
}
