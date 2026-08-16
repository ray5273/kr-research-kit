#!/usr/bin/env node

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { buildBaseline } = require("./extract-report-baseline");
const { renderUpdateBlock, updateReport } = require("./normalize-update-log");
const { applySectionUpdates } = require("./apply-memo-section-updates");

const scriptDir = __dirname;

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "kr-stock-update-test-"));
}

function writeJson(filePath, payload) {
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function runBaseline(inputPath) {
  return buildBaseline({ input: inputPath });
}

function testBaselineParser() {
  const dir = tmpDir();
  const report = path.join(dir, "memo.md");
  const assetDir = path.join(dir, "assets");
  fs.mkdirSync(assetDir);
  fs.writeFileSync(path.join(assetDir, "chart.png"), "png", "utf8");
  fs.writeFileSync(report, [
    "# Fixture Memo",
    "",
    "기준일: `2026-01-02`",
    "",
    "## Decision Frame",
    "- trigger: earnings miss",
    "",
    "## Summary",
    "Base thesis.",
    "",
    "## DART Recheck",
    "| 주장 | 상태 | 확인값 또는 판단 |",
    "| --- | --- | --- |",
    "| claim | confirmed | filing |",
    "",
    "## Chart and Positioning",
    "![chart](assets/chart.png)",
    "",
    "## Order Backlog and Revenue Visibility",
    "![backlog](assets/sample-order-backlog.png)",
    "",
    "```guard-decision",
    "trigger: price break",
    "review_by: 2026-02-01",
    "```",
    "",
    "## Follow-up Research Prompts",
    "- Is customer concentration not separately disclosed?",
    "",
    "## Update Log",
    "",
    "### 2026-01-10",
    "- eventKey: earnings-q4",
    "- [DART filing](https://dart.example/1)",
    "",
    "### `2026-01-11` Update",
    "- [IR deck](https://ir.example/2)",
    "",
    "### 1. 2026-01-12 Update",
    "- [News](https://news.example/3)",
    "",
  ].join("\n"), "utf8");

  const baseline = runBaseline(report);
  assert.strictEqual(baseline.memoDate, "2026-01-02");
  assert.deepStrictEqual(baseline.existingUpdateDates, ["2026-01-10", "2026-01-11", "2026-01-12"]);
  assert.deepStrictEqual(baseline.existingEventKeys, ["earnings-q4"]);
  assert.strictEqual(baseline.dartRecheck.tableRows.length, 1);
  assert.strictEqual(baseline.guardDecision.trigger, "price break");
  assert.strictEqual(baseline.chartAssets[0].exists, true);
  assert.strictEqual(baseline.orderBacklog.present, true);
  assert.strictEqual(baseline.chartAssets.length, 2);
  assert(baseline.staleSectionAudit.includes("Follow-up Research Prompts"));
}

function testNormalizeV2AndReplacement() {
  const payload = {
    date: "2026-03-04",
    mode: "hybrid",
    classification: "refresh-now",
    thesisDelta: "weaker",
    events: [{ key: "q4-print", label: "Q4 earnings", date: "2026-03-03", materiality: "high" }],
    whatHappened: ["Operating profit missed the memo baseline."],
    whyItMatters: ["The margin bridge is now a thesis issue."],
    whatChangedInThesis: ["Execution risk is higher."],
    whatDidNotChange: ["Balance-sheet risk remains manageable."],
    followUpResolutions: [{ question: "Can margins normalize?", status: "partially resolved", evidence: "new filing disclosed mix drag" }],
    dartRecheck: [{ claim: "Margin recovery", status: "partially supported", note: "Q4 was weaker than claimed" }],
    signalsToWatchNext: ["Next quarterly margin by segment."],
    sources: [{ label: "DART report", url: "https://dart.example/report", date: "2026-03-03", role: "primary filing" }],
  };

  const block = renderUpdateBlock(payload);
  assert(block.includes("Classification: refresh-now"));
  assert(block.includes("eventKey: q4-print"));
  assert(block.includes("#### Follow-up prompt resolutions"));
  assert(block.includes("Source role: primary filing"));

  const report = [
    "# Memo",
    "",
    "기준일: 2026-01-01",
    "",
    "## Summary",
    "Old summary.",
    "",
    "## Update Log",
    "",
    "### `2026-03-04`",
    "",
    "old block",
    "",
  ].join("\n");
  const updated = updateReport(report, payload);
  assert.strictEqual((updated.match(/^### 2026-03-04 Update$/gm) || []).length, 1);
  assert(updated.includes("최근 업데이트일: 2026-03-04"));
  assert(!updated.includes("old block"));

  const noMaterial = renderUpdateBlock({ date: "2026-03-05", classification: "wait-for-event", noMaterialUpdate: true });
  assert(noMaterial.includes("No material company-specific update found after the memo date."));
}

function testSectionUpdater() {
  const report = [
    "# Memo",
    "",
    "기준일: 2026-01-01",
    "최근 업데이트일: 2026-01-10",
    "",
    "## Summary",
    "Old summary.",
    "",
    "## Structured Stance",
    "Old stance.",
    "",
    "## Order Backlog and Revenue Visibility",
    "Old backlog.",
    "",
    "## Sources",
    "- [source](https://example.com)",
    "",
    "## Update Log",
    "",
    "### 2026-01-10 Update",
    "- old",
    "",
  ].join("\n");

  const updated = applySectionUpdates(report, {
    sections: {
      Summary: "New summary.",
      "Structured Stance": "New stance.",
      "Order Backlog and Revenue Visibility": "New backlog with refreshed chart.",
    },
  });
  assert(updated.includes("기준일: 2026-01-01"));
  assert(updated.includes("## Summary\n\nNew summary."));
  assert(updated.includes("## Structured Stance\n\nNew stance."));
  assert(updated.includes("## Order Backlog and Revenue Visibility\n\nNew backlog with refreshed chart."));
  assert(updated.includes("### 2026-01-10 Update"));

  assert.throws(() => applySectionUpdates(report, { sections: { Sources: "bad" } }), /reserved/);
  assert.throws(() => applySectionUpdates(report, { sections: { Risks: "bad" } }), /not an allowed/);
  assert.throws(() => applySectionUpdates(report, { sections: { "DART Recheck": "insert" } }), /Section not found/);

  const inserted = applySectionUpdates(report, { sections: { "DART Recheck": "Inserted recheck." } }, { allowInsert: true });
  assert(inserted.indexOf("## DART Recheck") < inserted.indexOf("## Update Log"));
}

function testCliRoundTrip() {
  const dir = tmpDir();
  const report = path.join(dir, "memo.md");
  const payload = path.join(dir, "update.json");
  fs.writeFileSync(report, "# Memo\n\n기준일: 2026-01-01\n", "utf8");
  writeJson(payload, { date: "2026-01-02", classification: "answer-now", whatHappened: ["Answered from existing memo state."] });
  const updateScript = require("./normalize-update-log");
  const updatePayload = JSON.parse(fs.readFileSync(payload, "utf8"));
  fs.writeFileSync(report, updateScript.updateReport(fs.readFileSync(report, "utf8"), updatePayload), "utf8");
  const updated = fs.readFileSync(report, "utf8");
  assert(updated.includes("최근 업데이트일: 2026-01-02"));
  assert(updated.includes("Classification: answer-now"));
}

testBaselineParser();
testNormalizeV2AndReplacement();
testSectionUpdater();
testCliRoundTrip();

console.log("kr-stock-update script tests passed.");
