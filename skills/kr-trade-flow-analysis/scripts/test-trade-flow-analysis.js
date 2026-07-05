#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const fixtures = path.join(root, "tests", "fixtures");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kr-trade-flow-"));

function run(args) {
  const result = spawnSync(process.execPath, args, { cwd: path.resolve(root, "..", ".."), encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`Command failed: node ${args.join(" ")}\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  }
  return result.stdout;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

const customsOut = path.join(tmp, "customs.json");
run([
  path.join(root, "scripts", "normalize-trade-flow.js"),
  "--source", "customs",
  "--input", path.join(fixtures, "customs-monthly.csv"),
  "--output", customsOut,
  "--source-label", "관세청 수출입무역통계",
]);
const customs = readJson(customsOut);
assert.strictEqual(customs.rowCount, 2);
assert.strictEqual(customs.rows[0].period, "2026-01");
assert.strictEqual(customs.rows[0].hsCode, "284190");
assert.strictEqual(customs.rows[0].partner, "China");
assert.strictEqual(customs.rows[0].valueUsd, 120000000);

const comtradeOut = path.join(tmp, "comtrade.json");
run([
  path.join(root, "scripts", "normalize-trade-flow.js"),
  "--source", "un-comtrade",
  "--input", path.join(fixtures, "un-comtrade.csv"),
  "--output", comtradeOut,
]);
const comtrade = readJson(comtradeOut);
assert.strictEqual(comtrade.rows[0].reporter, "Korea, Rep.");
assert.strictEqual(comtrade.rows[0].direction, "export");
assert.strictEqual(comtrade.rows[0].quantity, 9000);

const manualOut = path.join(tmp, "manual.json");
run([
  path.join(root, "scripts", "normalize-trade-flow.js"),
  "--source", "manual",
  "--input", path.join(fixtures, "manual-minimal.csv"),
  "--output", manualOut,
]);
const manual = readJson(manualOut);
assert.strictEqual(manual.rows[0].notes, "manual proxy row");

const cases = [
  ["score-lnft-high.json", "high-confidence inference"],
  ["score-sector-medium.json", "medium-confidence proxy"],
  ["score-contradicted.json", "contradicted"],
];

for (const [fixture, expectedGrade] of cases) {
  const out = path.join(tmp, `${fixture}.out.json`);
  run([
    path.join(root, "scripts", "score-trade-inference.js"),
    "--input", path.join(fixtures, fixture),
    "--output", out,
  ]);
  const score = readJson(out);
  assert.strictEqual(score.grade, expectedGrade, fixture);
  if (expectedGrade !== "confirmed disclosure") {
    assert(score.labelsRequired.includes("Trade Flow Inference"));
  }
}

console.log("kr-trade-flow-analysis tests passed");
