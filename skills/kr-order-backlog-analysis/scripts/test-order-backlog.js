#!/usr/bin/env node

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const skillRoot = path.resolve(__dirname, "..");
const renderer = path.join(__dirname, "render-order-backlog.js");
const fixture = path.resolve(skillRoot, "../../examples/kr-order-backlog-analysis/backlog-sample.json");
const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "kr-order-backlog-test-"));

function run(args) {
  return spawnSync(process.execPath, [renderer, ...args], { encoding: "utf8" });
}

try {
  const pngOut = path.join(outputDir, "sample.png");
  const summaryOut = path.join(outputDir, "summary.json");
  const result = run(["--input", fixture, "--png-out", pngOut, "--summary-out", summaryOut]);
  assert.strictEqual(result.status, 0, result.stderr);
  assert.ok(fs.statSync(pngOut).size > 5000, "PNG output is unexpectedly small");
  assert.deepStrictEqual([...fs.readFileSync(pngOut).subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);

  const summary = JSON.parse(fs.readFileSync(summaryOut, "utf8"));
  assert.strictEqual(summary.chartLanguage, "ko");
  assert.strictEqual(summary.bucketAmount, 8500);
  assert.strictEqual(summary.datedAmount, 6600);
  assert.strictEqual(summary.undatedAmount, 1900);
  assert.strictEqual(summary.projectCumulativeAmount, 6600);
  assert.strictEqual(summary.finalDisclosedYear, 2028);
  assert.strictEqual(summary.reconciliationGap, 0);
  assert.strictEqual(summary.coverageRatio, 2.8333);

  const totalOnlyPath = path.join(outputDir, "valid-total-only.json");
  const totalOnly = JSON.parse(fs.readFileSync(fixture, "utf8"));
  totalOnly.basis = "official-total-only";
  totalOnly.buckets = [{ label: "연도 미공시", amount: 8500, contractCount: 0, status: "undated" }];
  fs.writeFileSync(totalOnlyPath, JSON.stringify(totalOnly));
  const totalOnlyResult = run([
    "--input",
    totalOnlyPath,
    "--png-out",
    path.join(outputDir, "valid-total-only.png"),
    "--summary-out",
    path.join(outputDir, "valid-total-only-summary.json"),
  ]);
  assert.strictEqual(totalOnlyResult.status, 0, totalOnlyResult.stderr);
  const totalOnlySummary = JSON.parse(fs.readFileSync(path.join(outputDir, "valid-total-only-summary.json"), "utf8"));
  assert.strictEqual(totalOnlySummary.finalDisclosedYear, null);
  assert.strictEqual(totalOnlySummary.undatedAmount, 8500);
  assert.strictEqual(totalOnlySummary.projectCumulativeAmount, 0);

  const invalidPath = path.join(outputDir, "invalid-total-only.json");
  const invalid = JSON.parse(fs.readFileSync(fixture, "utf8"));
  invalid.basis = "official-total-only";
  fs.writeFileSync(invalidPath, JSON.stringify(invalid));
  const invalidResult = run(["--input", invalidPath, "--png-out", path.join(outputDir, "invalid.png")]);
  assert.notStrictEqual(invalidResult.status, 0, "total-only input with synthetic year buckets should fail");
  assert.match(invalidResult.stderr, /synthetic year splits are prohibited/);

  process.stdout.write("kr-order-backlog-analysis tests passed\n");
} finally {
  fs.rmSync(outputDir, { recursive: true, force: true });
}
