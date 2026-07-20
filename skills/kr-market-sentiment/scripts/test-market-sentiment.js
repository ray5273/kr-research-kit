#!/usr/bin/env node

// Offline tests for kr-market-sentiment. No network, no npm — pure fixtures.

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  buildIndicators,
  computeIndexTechnicals,
  readManual,
  rsi,
  sma,
} = require("./fetch-market-indicators");
const {
  NUMERIC_RULES,
  scoreNumeric,
  scoreCategorical,
  scoreIndicator,
  scoreAll,
  judgeComposite,
  renderMarkdown,
  CATEGORICAL_RULES,
} = require("./score-sentiment-bottom");

const fixturesDir = path.join(__dirname, "..", "tests", "fixtures");
const yahooFixture = JSON.parse(fs.readFileSync(path.join(fixturesDir, "yahoo-fixture.json"), "utf8"));
const manualPath = path.join(fixturesDir, "manual-indicators-sample.json");

let passed = 0;
const checks = [];
function check(name, fn) {
  checks.push({ name, fn });
}

// ---- Technical math -----------------------------------------------------

check("sma computes trailing average", () => {
  assert.strictEqual(sma([1, 2, 3, 4], 4), 2.5);
  assert.strictEqual(sma([1, 2], 4), null);
});

check("rsi is 100 for monotonic gains, low for monotonic losses", () => {
  const up = Array.from({ length: 30 }, (_, i) => 100 + i);
  const down = Array.from({ length: 30 }, (_, i) => 200 - i);
  assert.strictEqual(rsi(up, 14), 100);
  assert.ok(rsi(down, 14) < 1);
});

check("computeIndexTechnicals derives drawdown/sma/rsi from bars", () => {
  const bars = yahooFixture["^KS11"].chart.result[0].timestamp.map((t, i) => ({
    date: new Date(t * 1000).toISOString().slice(0, 10),
    close: yahooFixture["^KS11"].chart.result[0].indicators.quote[0].close[i],
  }));
  const tech = computeIndexTechnicals(bars);
  assert.ok(tech.drawdownFrom52wHigh < 0, "fixture ends in a drawdown");
  assert.ok(tech.rsi14 > 0 && tech.rsi14 < 100, "rsi within range");
  assert.ok(tech.sma200 != null, "252 bars → sma200 available");
  assert.ok(tech.distanceFromSma200 < 0, "price below 200d in fixture");
});

// ---- Numeric scoring bands ----------------------------------------------

check("scoreNumeric maps PBR bands (lowIsBottom)", () => {
  const rule = NUMERIC_RULES.kospi_pbr;
  assert.strictEqual(scoreNumeric(rule, 0.80), 2);   // below → deep value
  assert.strictEqual(scoreNumeric(rule, 0.90), 1);
  assert.strictEqual(scoreNumeric(rule, 1.00), 0);
  assert.strictEqual(scoreNumeric(rule, 1.10), -1);
  assert.strictEqual(scoreNumeric(rule, 1.40), -2);
});

check("scoreNumeric maps VKOSPI bands (highIsBottom)", () => {
  const rule = NUMERIC_RULES.vkospi;
  assert.strictEqual(scoreNumeric(rule, 12), -2);
  assert.strictEqual(scoreNumeric(rule, 18), -1);
  assert.strictEqual(scoreNumeric(rule, 24), 0);
  assert.strictEqual(scoreNumeric(rule, 31), 1);
  assert.strictEqual(scoreNumeric(rule, 40), 2);   // above → extreme fear
});

check("scoreNumeric maps RSI oversold to strong-bottom", () => {
  assert.strictEqual(scoreNumeric(NUMERIC_RULES.kospi_rsi14, 25), 2);
  assert.strictEqual(scoreNumeric(NUMERIC_RULES.kospi_rsi14, 72), -2);
});

check("scoreNumeric rejects non-numeric", () => {
  assert.strictEqual(scoreNumeric(NUMERIC_RULES.kospi_pbr, "n/a"), null);
});

// ---- Categorical scoring ------------------------------------------------

check("scoreCategorical maps foreign flow + rejects unknown", () => {
  assert.strictEqual(scoreCategorical(CATEGORICAL_RULES.foreign_flow, "net_buy_turn"), 2);
  assert.strictEqual(scoreCategorical(CATEGORICAL_RULES.foreign_flow, "large_buying"), -2);
  assert.strictEqual(scoreCategorical(CATEGORICAL_RULES.foreign_flow, "wat"), null);
});

check("scoreIndicator returns null for unknown id", () => {
  assert.strictEqual(scoreIndicator({ id: "made_up", value: 1 }), null);
  const scored = scoreIndicator({ id: "kospi_pbr", value: 0.9, category: "밸류에이션", label: "PBR" });
  assert.strictEqual(scored.signal, 1);
  assert.strictEqual(scored.weight, NUMERIC_RULES.kospi_pbr.weight);
});

// ---- readManual ---------------------------------------------------------

check("readManual loads known ids and drops empty", () => {
  const { indicators } = readManual(manualPath);
  assert.ok(indicators.kospi_pbr, "PBR present");
  assert.strictEqual(indicators.kospi_pbr.origin, "manual");
  assert.strictEqual(indicators.foreign_flow.value, "selling_slowing");

  const tmp = path.join(os.tmpdir(), `manual-${process.pid}.json`);
  fs.writeFileSync(tmp, JSON.stringify({ asOfDate: "2026-01-01", indicators: { kospi_pbr: { value: "" }, vkospi: 22, bogus: 5 } }));
  const parsed = readManual(tmp);
  assert.ok(!parsed.indicators.kospi_pbr, "empty value dropped");
  assert.strictEqual(parsed.indicators.vkospi.value, 22, "scalar shorthand accepted");
  assert.ok(!parsed.indicators.bogus, "unknown id ignored");
  fs.rmSync(tmp);
});

// ---- buildIndicators (integration, offline via fixtureMap) --------------

let indicatorsDoc;
check("buildIndicators merges auto + manual from fixture", async () => {
  indicatorsDoc = await buildIndicators({ date: "2026-07-20", manual: manualPath, fixtureMap: yahooFixture });
  assert.strictEqual(indicatorsDoc.markets.kospi.role, "primary");
  assert.ok(indicatorsDoc.coverage.autoCount >= 5, "auto indicators from 3 symbols");
  assert.strictEqual(indicatorsDoc.coverage.manualCount, 7);
  const ids = indicatorsDoc.indicators.map((i) => i.id);
  assert.ok(ids.includes("kospi_drawdown") && ids.includes("kospi_pbr"));
});

check("buildIndicators records DATA_GAP when a symbol is missing", async () => {
  const partial = { "^KS11": yahooFixture["^KS11"], "^KQ11": yahooFixture["^KQ11"] }; // no KRW=X
  const doc = await buildIndicators({ date: "2026-07-20", fixtureMap: partial });
  assert.strictEqual(doc.markets.usdkrw.status, "DATA_GAP");
  assert.ok(doc.warnings.some((w) => w.includes("원/달러")));
  // No manual file → warning about empty valuation/flow.
  assert.ok(doc.warnings.some((w) => w.includes("수동 지표")));
});

// ---- scoreAll -----------------------------------------------------------

check("scoreAll produces a bottom-leaning composite for oversold fixture", () => {
  const result = scoreAll(indicatorsDoc);
  assert.ok(result.composite > 0.6, `expected bottom-leaning composite, got ${result.composite}`);
  assert.strictEqual(result.tally.overheatSignals, 0);
  assert.strictEqual(result.judgment.emoji, "🟢");
  // deposits_trend is context-only (weight 0) — scored but not in weighted count.
  assert.ok(result.tally.scoredCount > result.tally.weightedCount);
});

check("confirmation gate is unmet without foreign net-buy turn", () => {
  const result = scoreAll(indicatorsDoc);
  assert.strictEqual(result.confirmation.foreignNetBuyTurn, false);
  assert.ok(result.confirmedCount < 2);
});

check("confirmation flips when flows turn and index recovers", () => {
  const doc = JSON.parse(JSON.stringify(indicatorsDoc));
  doc.indicators.find((i) => i.id === "foreign_flow").value = "net_buy_turn";
  doc.indicators.find((i) => i.id === "kospi_rsi14").value = 46;
  doc.markets.kospi.lastClose = doc.markets.kospi.sma20 + 5;
  const result = scoreAll(doc);
  assert.strictEqual(result.confirmation.foreignNetBuyTurn, true);
  assert.strictEqual(result.confirmation.aboveSma20, true);
  assert.strictEqual(result.confirmation.rsiRecovering, true);
  assert.strictEqual(result.confirmedCount, 3);
});

check("judgeComposite bands are ordered", () => {
  assert.strictEqual(judgeComposite(1.5).emoji, "🔵");
  assert.strictEqual(judgeComposite(0.8).emoji, "🟢");
  assert.strictEqual(judgeComposite(0.3).emoji, "🟡");
  assert.strictEqual(judgeComposite(0).emoji, "⚪");
  assert.strictEqual(judgeComposite(-1).emoji, "🔴");
  assert.strictEqual(judgeComposite(null).emoji, "⚫");
});

check("renderMarkdown emits required sections", () => {
  const result = scoreAll(indicatorsDoc);
  const md = renderMarkdown(result, indicatorsDoc);
  for (const heading of ["종합 판단", "확정 신호 체크리스트", "지표별 상세", "지수 스냅샷", "해석 원칙"]) {
    assert.ok(md.includes(heading), `missing section: ${heading}`);
  }
});

(async () => {
  for (const { name, fn } of checks) {
    await fn();
    passed += 1;
    process.stdout.write(`  ok ${name}\n`);
  }
  process.stdout.write(`\nAll ${passed} kr-market-sentiment checks passed.\n`);
})().catch((error) => { console.error(error); process.exit(1); });
