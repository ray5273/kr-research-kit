#!/usr/bin/env node

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  assignLeadershipLabel,
  assignSetupLabel,
  buildCautionFlags,
  compareWithPriorReport,
  computeBuyabilityScore,
  computeMinerviniStylePassCount,
  percentileRank,
  rankBuyableCandidates,
  rankLeaders,
  screenMarketLeaders,
} = require("./screen-kr-market-leaders");

function fixtureCache() {
  return {
    date: "2026-06-25",
    universe: {
      scope: "KOSPI + KOSDAQ integrated",
      totalListed: 6,
      includedOrdinaryStocks: 5,
      attemptedSymbols: 5,
      rsEligibleCount: 4,
      failedCount: 1,
    },
    entries: [
      {
        ticker: "000001",
        name: "단기전자",
        market: "KOSPI",
        industry: "전기전자",
        latestDate: "2026-06-25",
        barsFetched: 260,
        return1: 0.12,
        return7: 0.24,
        return30: -0.05,
        return60: -0.08,
        return120: 0.02,
        return252: 0.04,
        return63: -0.08,
        return126: 0.02,
        rsPercentile: 42,
        volumeRatio20: 2.4,
        priceVs52WeekHighRatio: 0.82,
        priceVs52WeekLowRatio: 1.35,
        dataQuality: [],
      },
      {
        ticker: "000002",
        name: "중기소재",
        market: "KOSDAQ",
        industry: "화학",
        latestDate: "2026-06-25",
        barsFetched: 260,
        return1: 0.01,
        return7: 0.03,
        return30: 0.34,
        return60: 0.58,
        return120: 0.44,
        return252: 0.49,
        return63: 0.58,
        return126: 0.44,
        rsPercentile: 88,
        volumeRatio20: 1.3,
        priceVs52WeekHighRatio: 0.94,
        priceVs52WeekLowRatio: 1.8,
        dataQuality: [],
      },
      {
        ticker: "000003",
        name: "구조바이오",
        market: "KOSDAQ",
        industry: "제약",
        latestDate: "2026-06-25",
        barsFetched: 260,
        return1: 0.00,
        return7: 0.02,
        return30: 0.12,
        return60: 0.18,
        return120: 0.72,
        return252: 1.15,
        return63: 0.18,
        return126: 0.72,
        rsPercentile: 96,
        volumeRatio20: 0.9,
        priceVs52WeekHighRatio: 0.98,
        priceVs52WeekLowRatio: 2.2,
        dataQuality: [],
      },
      {
        ticker: "000004",
        name: "부족신규",
        market: "KOSPI",
        industry: "서비스",
        latestDate: "2026-06-25",
        barsFetched: 40,
        return1: 0.02,
        return7: 0.05,
        return30: 0.10,
        return60: null,
        return120: null,
        return252: null,
        return63: null,
        return126: null,
        rsPercentile: null,
        volumeRatio20: null,
        priceVs52WeekHighRatio: null,
        priceVs52WeekLowRatio: null,
        dataQuality: ["252거래일 미만", "거래량비율 산출불가"],
      },
      {
        ticker: "000005",
        name: "실패종목",
        market: "KOSDAQ",
        error: "HTTP 404",
      },
    ],
  };
}

function testPercentileRank() {
  const rows = [
    { ticker: "A", value: 10 },
    { ticker: "B", value: 5 },
    { ticker: "C", value: -1 },
  ];
  const percentiles = percentileRank(rows, "value");
  assert.equal(percentiles.get("A"), 100);
  assert.equal(percentiles.get("C"), 0);
}

function testLabelsAndScores() {
  assert.equal(assignLeadershipLabel({ shortScore: 90, intermediateScore: 80, structuralScore: 82 }), "전구간 주도");
  assert.equal(assignLeadershipLabel({ shortScore: 35, intermediateScore: 82, structuralScore: 68 }), "중기 주도");
  assert.equal(assignLeadershipLabel({ shortScore: 88, intermediateScore: 40, structuralScore: 45 }), "단기 급등");
  assert.equal(assignLeadershipLabel({ shortScore: 40, intermediateScore: 70, structuralScore: 82 }), "구조적 주도");

  const checks = computeMinerviniStylePassCount({
    return120: 0.2,
    return252: 0.5,
    rsPercentile: 80,
    priceVs52WeekHighRatio: 0.9,
    priceVs52WeekLowRatio: 1.4,
    volumeRatio20: 0.7,
  });
  assert.equal(checks.available, 6);
  assert.equal(checks.passed, 5);

  const breakout = {
    return1: 0.03,
    return7: 0.08,
    return30: 0.22,
    return60: 0.34,
    return120: 0.48,
    rsPercentile: 94,
    volumeRatio20: 2.1,
    highProximityPct: 98,
    barsFetched: 260,
    structuralScore: 82,
    intermediateScore: 78,
    dataQuality: [],
  };
  assert.equal(assignSetupLabel(breakout), "돌파 후보");
  assert(computeBuyabilityScore(breakout) >= 80);

  const pullback = {
    return1: -0.01,
    return7: -0.04,
    return30: 0.18,
    return60: 0.32,
    return120: 0.62,
    rsPercentile: 91,
    volumeRatio20: 1.0,
    highProximityPct: 90,
    barsFetched: 260,
    structuralScore: 86,
    intermediateScore: 74,
    dataQuality: [],
  };
  assert.equal(assignSetupLabel(pullback), "눌림 후보");

  const overheated = {
    ...breakout,
    return1: 0.24,
    return7: 0.56,
    volumeRatio20: 11,
  };
  assert.equal(assignSetupLabel(overheated), "과열 주의");
  assert(computeBuyabilityScore(overheated) < computeBuyabilityScore(breakout));

  const weakData = {
    ...breakout,
    barsFetched: 40,
    volumeRatio20: null,
    dataQuality: ["252거래일 미만", "거래량비율 산출불가"],
  };
  assert(buildCautionFlags(weakData).includes("252거래일 미만"));
  assert.equal(assignSetupLabel(weakData), "데이터 검증 필요");
}

function testRanking() {
  const ranked = rankLeaders(fixtureCache(), {
    KOSPI: { return7: 0.01, return30: 0.02, return60: 0.03 },
    KOSDAQ: { return7: 0.02, return30: 0.03, return60: 0.04 },
  });
  assert.equal(ranked.shortTerm[0].ticker, "000001");
  assert.equal(ranked.intermediate[0].ticker, "000002");
  assert.equal(ranked.structural[0].ticker, "000003");
  assert.equal(ranked.entries.some((entry) => entry.ticker === "000005"), false);
  const missing = ranked.entries.find((entry) => entry.ticker === "000004");
  assert(missing.dataQualityNote.includes("252거래일 미만"));
  assert(missing.cautionFlags.length > 0);

  const buyability = rankBuyableCandidates(ranked.entries, { minBuyability: 50, excludeCaution: true });
  assert(buyability.buyable.every((entry) => entry.cautionFlags.length === 0));
  assert(buyability.buyable.every((entry) => !["과열 주의", "데이터 검증 필요"].includes(entry.setupLabel)));
  assert(buyability.pullback.some((entry) => entry.setupLabel === "눌림 후보"));
}

function testPriorComparison() {
  const current = {
    rankings: {
      composite: [
        { ticker: "000002", name: "중기소재", market: "KOSDAQ", compositeScore: 90, buyabilityScore: 82, setupLabel: "돌파 후보", rsPercentile: 93 },
        { ticker: "000003", name: "구조바이오", market: "KOSDAQ", compositeScore: 88, buyabilityScore: 78, setupLabel: "눌림 후보", rsPercentile: 91 },
      ],
    },
  };
  const prior = {
    rankings: {
      composite: [
        { ticker: "000003", name: "구조바이오", setupLabel: "관찰", rsPercentile: 88 },
      ],
    },
    entries: [
      { ticker: "000003", name: "구조바이오", setupLabel: "관찰", rsPercentile: 88 },
    ],
  };
  const comparison = compareWithPriorReport(current, prior);
  assert.equal(comparison.available, true);
  assert.equal(comparison.newEntrants[0].ticker, "000002");
  assert.equal(comparison.labelUpgrades[0].ticker, "000003");
  assert.equal(comparison.rs90Breakouts[0].ticker, "000002");
}

async function testScreenSmoke() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "kr-market-leaders-"));
  const cachePath = path.join(tempDir, "cache.json");
  const priorPath = path.join(tempDir, "prior.json");
  const jsonOut = path.join(tempDir, "leaders.json");
  const mdOut = path.join(tempDir, "leaders.md");
  fs.writeFileSync(cachePath, `${JSON.stringify(fixtureCache(), null, 2)}\n`);
  fs.writeFileSync(priorPath, `${JSON.stringify({
    date: "2026-06-24",
    rankings: { composite: [{ ticker: "000001", name: "단기전자" }] },
    entries: [{ ticker: "000001", name: "단기전자", setupLabel: "관찰", rsPercentile: 42 }],
  }, null, 2)}\n`);

  await screenMarketLeaders({
    date: "2026-06-25",
    cacheIn: cachePath,
    priorJson: priorPath,
    jsonOut,
    mdOut,
    top: 3,
    skipBackdrop: true,
  });

  const json = JSON.parse(fs.readFileSync(jsonOut, "utf8"));
  const markdown = fs.readFileSync(mdOut, "utf8");
  assert.equal(json.rankings.composite.length, 4);
  assert(Array.isArray(json.rankings.buyable));
  assert(Array.isArray(json.rankings.newEntrants));
  assert(json.entries.every((entry) => Object.prototype.hasOwnProperty.call(entry, "buyabilityScore")));
  assert(markdown.includes("## Composite Leaders"));
  assert(markdown.includes("## Buyable Candidates"));
  assert(markdown.includes("## Pullback Watchlist"));
  assert(markdown.includes("## Breakout Watchlist"));
  assert(markdown.includes("## Excluded / Caution Flags"));
  assert(markdown.includes("## New Entrants"));
  assert(markdown.includes("기술적 시장 리더십 스크린"));
}

async function main() {
  testPercentileRank();
  testLabelsAndScores();
  testRanking();
  testPriorComparison();
  await testScreenSmoke();
  console.log("test-market-leaders: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
