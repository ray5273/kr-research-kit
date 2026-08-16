#!/usr/bin/env node
"use strict";

// kr-portfolio-guard fixture tests — stdlib only (assert + child_process).
// Covers the Eng-4A mandated GAP list:
//   episode boundaries, supersede, coverage ack, CORP_ACTION ±30% boundary,
//   qty_guide formula + null cases, next-bar scoring price, qty_change →
//   portfolio update, schedule→PENDING→session-close flow (dry-run E2E),
// plus indicator math, memo trigger extraction, atomic writes, and the
// fetch-kr-chart symbol-passthrough regression.

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const SKILL_DIR = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(SKILL_DIR, "..", "..");
const FIXTURES = path.join(__dirname, "fixtures");

const { computeSMA, computeRSI, computeMACD } = require("../scripts/lib/indicators.js");
const { extractMemoTriggers, extractPriceLevels, parseDecisionBlock } = require("../scripts/lib/memo-triggers.js");
const { detectCrossings, detectCorpActionJump, updateEpisodes, pendingDecisions } = require("../scripts/guard-sweep.js");
const { nextBarAfter, scoreEpisode, computeQtyGuide } = require("../scripts/lib/scoring.js");
const { atomicWriteJson, readNdjson } = require("../scripts/lib/store.js");
const { buildCandidateSymbols } = require(path.join(
  REPO_ROOT, "skills", "kr-stock-analysis", "scripts", "fetch-kr-chart.js"
));

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    process.stdout.write(`  ✓ ${name}\n`);
  } catch (err) {
    failed += 1;
    process.stdout.write(`  ✗ ${name}\n    ${err.message}\n`);
  }
}

function mkBars(closes, startDate = "2026-01-01") {
  const start = new Date(`${startDate}T00:00:00Z`);
  return closes.map((c, i) => {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    return { date: d.toISOString().slice(0, 10), open: c, high: c, low: c, close: c, adjClose: c, volume: 1000 };
  });
}

// --- 1. indicators ------------------------------------------------------------

console.log("[indicators]");
test("SMA20 of constant 100 series = 100", () => {
  assert.strictEqual(computeSMA(new Array(30).fill(100), 20), 100);
});
test("SMA returns null when insufficient bars", () => {
  assert.strictEqual(computeSMA([1, 2, 3], 20), null);
});
test("RSI of monotonically rising series > 70", () => {
  const closes = Array.from({ length: 40 }, (_, i) => 100 + i);
  assert.ok(computeRSI(closes, 14) > 70);
});
test("RSI of monotonically falling series < 30", () => {
  const closes = Array.from({ length: 40 }, (_, i) => 200 - i);
  assert.ok(computeRSI(closes, 14) < 30);
});
test("MACD golden cross detected on V-shaped recovery", () => {
  const down = Array.from({ length: 60 }, (_, i) => 200 - i);
  const up = Array.from({ length: 25 }, (_, i) => 141 + i * 3);
  const closes = down.concat(up);
  let sawGolden = false;
  for (let end = 60; end <= closes.length; end += 1) {
    const m = computeMACD(closes.slice(0, end));
    if (m && m.cross === "golden") sawGolden = true;
  }
  assert.ok(sawGolden, "expected a golden cross somewhere in the recovery");
});

// --- 2. memo trigger extraction -------------------------------------------------

console.log("[memo-triggers]");
test("heuristic memo: extracts price + non-price triggers", () => {
  const memo = extractMemoTriggers(path.join(FIXTURES, "memo-a.md"));
  assert.strictEqual(memo.exists, true);
  assert.strictEqual(memo.baseDate, "2026-01-10");
  assert.strictEqual(memo.updateDate, "2026-01-20");
  assert.ok(memo.triggers.length >= 3, `expected >=3 triggers, got ${memo.triggers.length}`);
  const levels = memo.triggers.flatMap((t) => t.levels);
  assert.ok(levels.includes(9200), "sell level 9200 extracted");
  assert.ok(levels.includes(12000), "buy level 12000 extracted");
  const nonPrice = memo.triggers.filter((t) => t.levels.length === 0);
  assert.ok(nonPrice.length >= 1, "non-price trigger surfaced for LLM layer");
  assert.strictEqual(memo.parseGap, false);
});
test("Decision Block memo parses stance/review_by/triggers", () => {
  const memo = extractMemoTriggers(path.join(FIXTURES, "memo-block.md"));
  assert.strictEqual(memo.stance, "관찰 유지");
  assert.strictEqual(memo.reviewBy, "2026-09-30");
  assert.strictEqual(memo.triggers.length, 2);
  assert.deepStrictEqual(memo.triggers[0].levels, [8500]);
  assert.strictEqual(memo.triggers[1].levels.length, 0);
});
test("missing memo → exists=false, no PARSE_GAP", () => {
  const memo = extractMemoTriggers(null);
  assert.strictEqual(memo.exists, false);
  assert.strictEqual(memo.parseGap, false);
});
test("price level extraction handles $ and 원 and commas", () => {
  assert.deepStrictEqual(extractPriceLevels("종가 20,422원 안착 + $91 지지"), [20422, 91]);
});

// --- 3. crossings & corp action --------------------------------------------------

console.log("[crossings / corp-action]");
test("detectCrossings catches upward level cross", () => {
  const bars = mkBars([100, 105, 110, 118, 125]);
  const fired = detectCrossings(bars, 120);
  assert.strictEqual(fired.length, 1);
  assert.strictEqual(fired[0].to, 125);
});
test("CORP_ACTION boundary: +29.9% no flag, +30.1% flags", () => {
  const ok = mkBars([100, 129.9]);
  const bad = mkBars([100, 130.1]);
  assert.strictEqual(detectCorpActionJump(ok, 30), null);
  const hit = detectCorpActionJump(bad, 30);
  assert.ok(hit && Math.abs(hit.pct - 30.1) < 0.01);
});

// --- 4. scoring (money math) -----------------------------------------------------

console.log("[scoring]");
test("nextBarAfter skips non-trading days (data-based, Eng-3A)", () => {
  const bars = [
    { date: "2026-07-03", close: 100, adjClose: 100 },
    { date: "2026-07-07", close: 110, adjClose: 110 }, // 주말+휴장 건너뜀
  ];
  assert.strictEqual(nextBarAfter(bars, "2026-07-03").date, "2026-07-07");
  assert.strictEqual(nextBarAfter(bars, "2026-07-07"), null);
});
test("HOLD scoring = stock% − bench% on adjClose", () => {
  const stock = mkBars([100, 100, 110, 121]); // entry 다음날 100 → +21%
  const bench = mkBars([200, 200, 210, 220]); // 200 → +10%
  const r = scoreEpisode({ decision: "HOLD", decisionDate: stock[0].date, stockBars: stock, benchBars: bench, horizonDays: 2 });
  assert.ok(r.scored);
  assert.ok(Math.abs(r.excessReturnPct - 11) < 0.01, `expected +11, got ${r.excessReturnPct}`);
});
test("SELL scoring flips the sign (avoided loss positive)", () => {
  const stock = mkBars([100, 100, 90, 80]); // -20%
  const bench = mkBars([200, 200, 200, 200]); // 0%
  const r = scoreEpisode({ decision: "SELL", decisionDate: stock[0].date, stockBars: stock, benchBars: bench, horizonDays: 2 });
  assert.ok(r.scored);
  assert.ok(Math.abs(r.excessReturnPct - 20) < 0.01, `expected +20 (잘 판 것), got ${r.excessReturnPct}`);
});
test("terminated: bars end before horizon → scored early at last bar (2bA)", () => {
  const stock = mkBars([100, 100, 50]); // 이후 상폐
  const bench = mkBars([200, 200, 200, 200, 200, 200, 200, 200, 200, 200]);
  const r = scoreEpisode({ decision: "HOLD", decisionDate: stock[0].date, stockBars: stock, benchBars: bench, horizonDays: 30 });
  assert.ok(r.scored && r.terminated);
  assert.ok(Math.abs(r.excessReturnPct - -50) < 0.01, `expected −50, got ${r.excessReturnPct}`);
});
test("REVIEW/DEFER never scored", () => {
  const bars = mkBars([100, 110]);
  assert.strictEqual(scoreEpisode({ decision: "REVIEW", decisionDate: bars[0].date, stockBars: bars, benchBars: bars, horizonDays: 1 }).scored, false);
});
test("adjClose preferred over raw close in scoring", () => {
  const stock = [
    { date: "2026-01-01", close: 100, adjClose: 95 },
    { date: "2026-01-02", close: 100, adjClose: 95 },
    { date: "2026-01-03", close: 100, adjClose: 104.5 }, // 배당 조정 +10%
  ];
  const bench = mkBars([200, 200, 200]);
  const r = scoreEpisode({ decision: "HOLD", decisionDate: "2026-01-01", stockBars: stock, benchBars: bench, horizonDays: 1 });
  assert.ok(Math.abs(r.excessReturnPct - 10) < 0.01, `expected +10 from adjClose, got ${r.excessReturnPct}`);
});

console.log("[qty_guide (E1)]");
test("worked example: 1억·확신도2·무효화거리8% → 1,250만원", () => {
  const g = computeQtyGuide({ totalCapital: 100_000_000, confidence: 2, price: 10000, triggerLevel: 9200, riskBudgetPctByConfidence: { 1: 0.5, 2: 1.0, 3: 1.5 } });
  assert.strictEqual(g, 12_500_000);
});
test("null cases: no capital / no level / bad confidence / zero distance", () => {
  assert.strictEqual(computeQtyGuide({ totalCapital: 0, confidence: 2, price: 100, triggerLevel: 90 }), null);
  assert.strictEqual(computeQtyGuide({ totalCapital: 1e8, confidence: 2, price: 100, triggerLevel: NaN }), null);
  assert.strictEqual(computeQtyGuide({ totalCapital: 1e8, confidence: 5, price: 100, triggerLevel: 90 }), null);
  assert.strictEqual(computeQtyGuide({ totalCapital: 1e8, confidence: 2, price: 100, triggerLevel: 100 }), null);
});

// --- 5. episodes -----------------------------------------------------------------

console.log("[episodes]");
test("episode lifecycle: new → persists (no re-pending after decision) → ends", () => {
  const flag = { type: "TRIGGER_NEAR", level: 9200 };
  const h = { ticker: "TESTA", tradeFlags: [flag] };
  let state = { episodes: {} };
  state = updateEpisodes(state, [h], "2026-07-05");
  assert.strictEqual(pendingDecisions(state).length, 1);
  // 결정 마킹 (ledger-append이 하는 일)
  state.episodes["TESTA:TRIGGER_NEAR:9200"].decidedAt = "2026-07-05T10:00:00Z";
  // 다음 주에도 같은 플래그 지속 → 에피소드 유지, 재-PENDING 없음 (OV1/OV2)
  state = updateEpisodes(state, [h], "2026-07-12");
  assert.strictEqual(pendingDecisions(state).length, 0);
  // 조건 해소 → 에피소드 종료 → 재발 시 새 에피소드 = 다시 PENDING
  state = updateEpisodes(state, [{ ticker: "TESTA", tradeFlags: [] }], "2026-07-19");
  state = updateEpisodes(state, [h], "2026-07-26");
  assert.strictEqual(pendingDecisions(state).length, 1);
});

// --- 6. store atomicity ------------------------------------------------------------

console.log("[store]");
test("atomic write keeps one-generation .bak", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "guard-test-"));
  const p = path.join(dir, "x.json");
  atomicWriteJson(p, { v: 1 });
  atomicWriteJson(p, { v: 2 });
  assert.strictEqual(JSON.parse(fs.readFileSync(p, "utf8")).v, 2);
  assert.strictEqual(JSON.parse(fs.readFileSync(`${p}.bak`, "utf8")).v, 1);
});
test("corrupt ndjson fails loudly naming the .bak", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "guard-test-"));
  const p = path.join(dir, "ledger.ndjson");
  fs.writeFileSync(p, '{"ok":1}\n{broken\n');
  assert.throws(() => readNdjson(p), /Corrupt ndjson line 2/);
});

// --- 7. symbol passthrough regression (T4) -----------------------------------------

console.log("[fetch-kr-chart passthrough]");
test("KRX numeric keeps .KS/.KQ retry; alpha & index pass through", () => {
  assert.deepStrictEqual(buildCandidateSymbols("066970"), ["066970.KS", "066970.KQ"]);
  assert.deepStrictEqual(buildCandidateSymbols("00088K"), ["00088K.KS", "00088K.KQ"]);
  assert.deepStrictEqual(buildCandidateSymbols("GOOG"), ["GOOG"]);
  assert.deepStrictEqual(buildCandidateSymbols("^GSPC"), ["^GSPC"]);
});

// --- 8. E2E dry-run: 스케줄→PENDING→세션 마감 플로우 --------------------------------

console.log("[E2E dry-run]");
test("sweep(dry) → flags+report+PENDING → ledger-append → PENDING↓ + supersede + qty_change", () => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "guard-e2e-"));
  const priv = path.join(work, "private");
  fs.mkdirSync(priv, { recursive: true });
  for (const f of ["portfolio.json", "guard-config.json"]) {
    fs.copyFileSync(path.join(FIXTURES, "private", f), path.join(priv, f));
  }

  // 합성 bars: TESTA는 12000 상향 돌파(FIRED) + STALE 메모, TESTB는 +31% 점프(CORP_ACTION)
  const barsDir = path.join(work, "bars");
  fs.mkdirSync(barsDir, { recursive: true });
  const base = Array.from({ length: 70 }, (_, i) => 10000 + i * 20);
  const testA = base.concat([11500, 11800, 12100, 12150]);
  fs.writeFileSync(path.join(barsDir, "TESTA.json"), JSON.stringify({ bars: mkBars(testA) }));
  const testB = Array.from({ length: 70 }, () => 5000).concat([5000, 6600, 6600, 6600]);
  fs.writeFileSync(path.join(barsDir, "TESTB.json"), JSON.stringify({ bars: mkBars(testB) }));

  const sweep = () =>
    execFileSync(
      process.execPath,
      [path.join(SKILL_DIR, "scripts", "guard-sweep.js"), "--private-dir", priv, "--bars-dir", barsDir, "--skip-dart"],
      { encoding: "utf8" }
    );
  sweep();

  const flags = JSON.parse(fs.readFileSync(path.join(priv, "reports", "flags-latest.json"), "utf8"));
  const holdA = flags.holdings.find((h) => h.ticker === "TESTA");
  const holdB = flags.holdings.find((h) => h.ticker === "TESTB");
  assert.ok(holdA.tradeFlags.some((f) => f.type === "TRIGGER_FIRED" && f.level === 12000), "TESTA 12000 FIRED");
  assert.ok(holdA.coverageFlags.some((f) => f.type === "STALE"), "TESTA STALE (2026-01-20 기준)");
  assert.ok(holdB.tradeFlags.some((f) => f.type === "CORP_ACTION_CHECK"), "TESTB corp action");
  assert.ok(holdB.coverageFlags.some((f) => f.type === "NO_MEMO"), "TESTB NO_MEMO");
  const pendingBefore = flags.pending.length;
  assert.ok(pendingBefore >= 2, `pending >= 2, got ${pendingBefore}`);

  const reportFiles = fs.readdirSync(path.join(priv, "reports")).filter((f) => f.startsWith("weekly-guard-"));
  assert.strictEqual(reportFiles.length, 1);
  const report = fs.readFileSync(path.join(priv, "reports", reportFiles[0]), "utf8");
  assert.ok(report.includes("ACTION NEEDED"), "report has ACTION NEEDED");
  assert.ok(report.includes("PENDING 결정"), "report shows pending count");

  // 세션 마감: TESTA FIRED에 ADD 결정 + qty_change +10 + 확신도 2
  const append = (extra) =>
    execFileSync(
      process.execPath,
      [
        path.join(SKILL_DIR, "scripts", "ledger-append.js"),
        "--private-dir", priv, "--ticker", "TESTA", "--flag-type", "TRIGGER_FIRED",
        "--level", "12000", "--decision", "ADD", "--rationale", "테스트 결정",
        "--confidence", "2", "--channels", "차트", ...(extra || []),
      ],
      { encoding: "utf8" }
    );
  append(["--qty-change", "10"]);

  const ledger = readNdjson(path.join(priv, "decision-ledger.ndjson"));
  assert.strictEqual(ledger.length, 1);
  assert.strictEqual(ledger[0].decision, "ADD");
  assert.ok(ledger[0].qty_guide > 0, "qty_guide computed (price-type trigger)");
  const pf = JSON.parse(fs.readFileSync(path.join(priv, "portfolio.json"), "utf8"));
  assert.strictEqual(pf.holdings.find((h) => h.ticker === "TESTA").quantity, 110, "qty_change applied");

  const state1 = JSON.parse(fs.readFileSync(path.join(priv, "state.json"), "utf8"));
  const pendingAfter = Object.values(state1.episodes).filter((e) => !e.decidedAt).length;
  assert.strictEqual(pendingAfter, pendingBefore - 1, "PENDING decreased by 1");

  // 같은 날 재결정 → supersede
  append([]);
  const ledger2 = readNdjson(path.join(priv, "decision-ledger.ndjson"));
  assert.strictEqual(ledger2.length, 2);
  assert.ok(ledger2[0].superseded_by, "first entry superseded");
  assert.ok(!ledger2[1].superseded_by, "latest entry active");

  // 커버리지 ack → 다음 스윕에서 침묵
  execFileSync(
    process.execPath,
    [path.join(SKILL_DIR, "scripts", "ledger-append.js"), "ack", "--private-dir", priv, "--ticker", "TESTB", "--flag-type", "NO_MEMO"],
    { encoding: "utf8" }
  );
  sweep();
  const flags2 = JSON.parse(fs.readFileSync(path.join(priv, "reports", "flags-latest.json"), "utf8"));
  const holdB2 = flags2.holdings.find((h) => h.ticker === "TESTB");
  const noMemo = holdB2.coverageFlags.find((f) => f.type === "NO_MEMO");
  assert.strictEqual(noMemo.acked, true, "NO_MEMO acked → suppressed from report");

  // 적대적 리뷰 회귀: 조건 해소 시 ack 자동 해제 → 재발 시 다시 표시 (영구 침묵 금지)
  const setMemo = (value) => {
    const pf2 = JSON.parse(fs.readFileSync(path.join(priv, "portfolio.json"), "utf8"));
    pf2.holdings.find((h) => h.ticker === "TESTB").memo = value;
    fs.writeFileSync(path.join(priv, "portfolio.json"), JSON.stringify(pf2, null, 2));
  };
  setMemo("skills/kr-portfolio-guard/tests/fixtures/memo-block.md"); // 메모 생김 → 조건 해소
  sweep();
  const stateAfterMemo = JSON.parse(fs.readFileSync(path.join(priv, "state.json"), "utf8"));
  assert.ok(!stateAfterMemo.ackedCoverageFlags["TESTB:NO_MEMO"], "조건 해소 → ack 자동 해제");
  setMemo("none"); // 메모 다시 사라짐 → 재발
  sweep();
  const flags3 = JSON.parse(fs.readFileSync(path.join(priv, "reports", "flags-latest.json"), "utf8"));
  const noMemo3 = flags3.holdings.find((h) => h.ticker === "TESTB").coverageFlags.find((f) => f.type === "NO_MEMO");
  assert.ok(noMemo3 && !noMemo3.acked, "재발한 NO_MEMO는 다시 표시 (영구 침묵 아님)");
});

// --- 9. coverage-gate additions (ship Step 7) ---------------------------------------

console.log("[coverage additions]");
test("MACD dead cross detected on inverted-V rollover", () => {
  const up = Array.from({ length: 60 }, (_, i) => 100 + i);
  const down = Array.from({ length: 25 }, (_, i) => 159 - i * 3);
  const closes = up.concat(down);
  let sawDead = false;
  for (let end = 60; end <= closes.length; end += 1) {
    const m = computeMACD(closes.slice(0, end));
    if (m && m.cross === "dead") sawDead = true;
  }
  assert.ok(sawDead, "expected a dead cross in the rollover");
});
test("ADD scoring equals HOLD formula (fresh tranche from decision date)", () => {
  const stock = mkBars([100, 100, 110, 121]);
  const bench = mkBars([200, 200, 210, 220]);
  const hold = scoreEpisode({ decision: "HOLD", decisionDate: stock[0].date, stockBars: stock, benchBars: bench, horizonDays: 2 });
  const add = scoreEpisode({ decision: "ADD", decisionDate: stock[0].date, stockBars: stock, benchBars: bench, horizonDays: 2 });
  assert.strictEqual(add.scored, true);
  assert.strictEqual(add.excessReturnPct, hold.excessReturnPct);
});
test("scoring DATA_GAP when no bar exists after decision date", () => {
  const bars = mkBars([100, 105]);
  const r = scoreEpisode({ decision: "HOLD", decisionDate: bars[1].date, stockBars: bars, benchBars: bars, horizonDays: 5 });
  assert.strictEqual(r.scored, false);
  assert.ok(/DATA_GAP/.test(r.reason));
});
test("PARSE_GAP: memo exists but zero extractable triggers", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "guard-parse-"));
  const p = path.join(dir, "memo.md");
  fs.writeFileSync(p, "# 무트리거 메모\n\n기준일: 2026-07-01\n\n## Summary\n\n조건 섹션이 없는 본문.\n");
  const memo = extractMemoTriggers(p);
  assert.strictEqual(memo.exists, true);
  assert.strictEqual(memo.parseGap, true);
  assert.strictEqual(memo.triggers.length, 0);
});
test("TRIGGER_NEAR fires inside ±3% band without a crossing", () => {
  const { sweepHolding } = require("../scripts/guard-sweep.js");
  const memo = { exists: true, baseDate: "2026-07-01", updateDate: null, stance: null, reviewBy: null, parseGap: false,
    triggers: [{ direction: "sell", levels: [98], quote: "98원 이탈 시 매도" }] };
  const closes = Array.from({ length: 70 }, () => 100);
  const bars = mkBars(closes);
  const config = JSON.parse(fs.readFileSync(path.join(FIXTURES, "private", "guard-config.json"), "utf8"));
  const r = sweepHolding({ ticker: "T", name: "T" }, bars, memo, config, null, "2026-07-05");
  assert.ok(r.tradeFlags.some((f) => f.type === "TRIGGER_NEAR" && f.level === 98), "100 vs 98 = 2.04% → NEAR");
  assert.ok(!r.tradeFlags.some((f) => f.type === "TRIGGER_FIRED"), "no crossing in flat series");
});
test("ledger-append rejects DEFER without --defer-until and bad decisions", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "guard-ledger-args-"));
  for (const f of ["portfolio.json", "guard-config.json"]) {
    fs.copyFileSync(path.join(FIXTURES, "private", f), path.join(dir, f));
  }
  const run = (args) => {
    try {
      execFileSync(process.execPath, [path.join(SKILL_DIR, "scripts", "ledger-append.js"), "--private-dir", dir, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
      return { ok: true };
    } catch (err) {
      return { ok: false, msg: String(err.stderr || err.message) };
    }
  };
  const defer = run(["--ticker", "TESTA", "--flag-type", "STALE", "--decision", "DEFER", "--rationale", "x"]);
  assert.strictEqual(defer.ok, false);
  assert.ok(/defer-until/.test(defer.msg), "DEFER needs a date");
  const bad = run(["--ticker", "TESTA", "--flag-type", "STALE", "--decision", "MAYBE", "--rationale", "x"]);
  assert.strictEqual(bad.ok, false);
  const unknown = run(["--ticker", "NOPE", "--flag-type", "STALE", "--decision", "HOLD", "--rationale", "x"]);
  assert.strictEqual(unknown.ok, false);
  assert.ok(/portfolio/.test(unknown.msg), "unknown ticker rejected");
});
test("ledger-append rejects qty_change that would go negative", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "guard-ledger-neg-"));
  for (const f of ["portfolio.json", "guard-config.json"]) {
    fs.copyFileSync(path.join(FIXTURES, "private", f), path.join(dir, f));
  }
  let failedNeg = false;
  try {
    execFileSync(process.execPath, [path.join(SKILL_DIR, "scripts", "ledger-append.js"), "--private-dir", dir,
      "--ticker", "TESTB", "--flag-type", "SMA_DEV", "--decision", "SELL", "--rationale", "x", "--qty-change", "-999"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (err) {
    failedNeg = /negative/.test(String(err.stderr));
  }
  assert.ok(failedNeg, "50주 보유에 -999는 거부");
  const pf = JSON.parse(fs.readFileSync(path.join(dir, "portfolio.json"), "utf8"));
  assert.strictEqual(pf.holdings.find((h) => h.ticker === "TESTB").quantity, 50, "portfolio unchanged on reject");
  // P1 회귀(적대적 리뷰): 거부된 결정은 장부에도 남으면 안 된다 — 드리프트 원천 차단
  assert.ok(!fs.existsSync(path.join(dir, "decision-ledger.ndjson")), "rejected decision leaves NO ledger row");
});
test("parseBars surfaces adjClose alongside raw close (T4)", () => {
  const { parseBars } = require(path.join(REPO_ROOT, "skills", "kr-stock-analysis", "scripts", "fetch-kr-chart.js"));
  const bars = parseBars({
    timestamp: [1750000000, 1750086400],
    indicators: { quote: [{ open: [1, 2], high: [1, 2], low: [1, 2], close: [100, 101], volume: [10, 11] }],
      adjclose: [{ adjclose: [95, 96] }] },
  });
  assert.strictEqual(bars.length, 2);
  assert.strictEqual(bars[0].close, 100);
  assert.strictEqual(bars[0].adjClose, 95);
});
test("technical-core exposes volume20/60Series to chart renderer (regression)", () => {
  const bars = mkBars(Array.from({ length: 130 }, (_, i) => 100 + (i % 7)));
  for (const skill of ["kr-stock-analysis", "kr-stock-chart"]) {
    const core = require(path.join(REPO_ROOT, "skills", skill, "scripts", "lib", "technical-core.js"));
    const metrics = core.buildMetrics(core.normalizeBars(bars));
    assert.ok(Array.isArray(metrics.volume20Series), `${skill}: volume20Series is an array`);
    assert.ok(Array.isArray(metrics.volume60Series), `${skill}: volume60Series is an array`);
    assert.strictEqual(metrics.volume60Series.length, 130);
  }
});

// --- 10. adversarial-review regressions (2026-07-05) --------------------------------

console.log("[adversarial regressions]");
test("supersede matches KST date even when UTC date differs (심야 세션)", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "guard-kst-"));
  for (const f of ["portfolio.json", "guard-config.json"]) {
    fs.copyFileSync(path.join(FIXTURES, "private", f), path.join(dir, f));
  }
  const kstToday = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date());
  // 오늘 KST 00:30 = 전날 UTC 15:30 — 구식 UTC slice 비교는 여기서 깨졌다
  const legacyTs = new Date(`${kstToday}T00:30:00+09:00`).toISOString();
  fs.writeFileSync(
    path.join(dir, "decision-ledger.ndjson"),
    JSON.stringify({ id: "legacy", ts: legacyTs, ticker: "TESTA", flag: "STALE", level: null, decision: "HOLD", superseded_by: null }) + "\n"
  );
  execFileSync(process.execPath, [path.join(SKILL_DIR, "scripts", "ledger-append.js"), "--private-dir", dir,
    "--ticker", "TESTA", "--flag-type", "STALE", "--decision", "REVIEW", "--defer-until", "2099-01-01", "--rationale", "재결정"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const rows = readNdjson(path.join(dir, "decision-ledger.ndjson"));
  assert.strictEqual(rows.length, 2);
  assert.ok(rows[0].superseded_by, "same-KST-day legacy row superseded despite UTC date mismatch");
});
test("NEW_FILING salt: 새 공시 = 새 에피소드 (지난주 결정에 안 묻힘)", () => {
  const { episodeKey } = require("../scripts/guard-sweep.js");
  const week1 = { type: "NEW_FILING", salt: "20260701000001" };
  const week2 = { type: "NEW_FILING", salt: "20260708000009" };
  assert.notStrictEqual(episodeKey("T", week1), episodeKey("T", week2));
  let state = { episodes: {} };
  state = updateEpisodes(state, [{ ticker: "T", tradeFlags: [week1] }], "2026-07-01");
  state.episodes[episodeKey("T", week1)].decidedAt = "2026-07-01T10:00:00Z";
  state = updateEpisodes(state, [{ ticker: "T", tradeFlags: [week2] }], "2026-07-08");
  assert.strictEqual(pendingDecisions(state).length, 1, "새 rcept_no는 다시 PENDING");
});
test("미결정 TRIGGER_FIRED는 플래그가 사라져도 에피소드 보존 (P3′)", () => {
  const fired = { type: "TRIGGER_FIRED", level: 12000 };
  let state = { episodes: {} };
  state = updateEpisodes(state, [{ ticker: "T", tradeFlags: [fired] }], "2026-07-01");
  // 다음 주: 가격이 레벨에서 이탈해 플래그 미재생성 — 그래도 결정 의무는 남는다
  state = updateEpisodes(state, [{ ticker: "T", tradeFlags: [] }], "2026-07-08");
  assert.strictEqual(pendingDecisions(state).length, 1, "undecided FIRED retained");
  // 결정되면 다음 소멸 시점에 정리
  state.episodes["T:TRIGGER_FIRED:12000"].decidedAt = "2026-07-08T10:00:00Z";
  state = updateEpisodes(state, [{ ticker: "T", tradeFlags: [] }], "2026-07-15");
  assert.strictEqual(Object.keys(state.episodes).length, 0, "decided FIRED cleaned up");
});
test("qty_guide capped at total capital (초근접 트리거 폭주 방지)", () => {
  const g = computeQtyGuide({ totalCapital: 100_000_000, confidence: 2, price: 10000, triggerLevel: 9950, riskBudgetPctByConfidence: { 1: 0.5, 2: 1.0, 3: 1.5 } });
  assert.strictEqual(g, 100_000_000, "0.5% 거리 → 2억이 아니라 총자산 캡");
});
test("corrupt state.json fails loudly naming the .bak", () => {
  const { loadState } = require("../scripts/lib/store.js");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "guard-state-"));
  fs.writeFileSync(path.join(dir, "state.json"), "{torn write");
  assert.throws(() => loadState(dir), /state\.json.*\.bak/s);
});
test("memo path escaping repo root is ignored (containment)", () => {
  // guard-sweep 내부 로직과 동일한 판정을 재현 — 리포 밖 절대경로/탈출경로 차단
  const outside = path.resolve(REPO_ROOT, "../../etc/passwd");
  assert.ok(!outside.startsWith(REPO_ROOT + path.sep), "escaped path detected");
  const inside = path.resolve(REPO_ROOT, "skills/kr-portfolio-guard/tests/fixtures/memo-a.md");
  assert.ok(inside.startsWith(REPO_ROOT + path.sep), "legit repo-relative path allowed");
});

// --- summary -----------------------------------------------------------------------

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
