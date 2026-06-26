#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const {
  buildUniverseCache,
  computeReturnFromBars,
  fetchYahooChart,
} = require("../../kr-stock-chart/scripts/build-kr-universe-rs-cache");

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const DEFAULT_TOP = 20;
const DEFAULT_MIN_BUYABILITY = 70;
const RETURN_FIELDS = ["return1", "return7", "return30", "return60", "return120", "return252"];

function parseArgs(argv) {
  const result = {
    top: DEFAULT_TOP,
    minBuyability: DEFAULT_MIN_BUYABILITY,
    concurrency: 12,
    range: "2y",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--date") {
      result.date = argv[index + 1];
      index += 1;
    } else if (arg === "--limit") {
      result.limit = Number(argv[index + 1]);
      index += 1;
    } else if (arg === "--top") {
      result.top = Number(argv[index + 1]);
      index += 1;
    } else if (arg === "--cache-in") {
      result.cacheIn = argv[index + 1];
      index += 1;
    } else if (arg === "--prior-json") {
      result.priorJson = argv[index + 1];
      index += 1;
    } else if (arg === "--min-buyability") {
      result.minBuyability = Number(argv[index + 1]);
      index += 1;
    } else if (arg === "--exclude-caution") {
      result.excludeCaution = true;
    } else if (arg === "--json-out") {
      result.jsonOut = argv[index + 1];
      index += 1;
    } else if (arg === "--md-out") {
      result.mdOut = argv[index + 1];
      index += 1;
    } else if (arg === "--concurrency") {
      result.concurrency = Number(argv[index + 1]);
      index += 1;
    } else if (arg === "--range") {
      result.range = argv[index + 1];
      index += 1;
    } else if (arg === "--skip-backdrop") {
      result.skipBackdrop = true;
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
    "  node screen-kr-market-leaders.js --date YYYY-MM-DD [--limit 30]",
    "",
    "Options:",
    "  --date         As-of date in YYYY-MM-DD. Defaults to current Seoul date.",
    "  --limit        Limit universe for smoke tests.",
    "  --top          Rows per table (default: 20).",
    "  --cache-in     Read an existing universe cache instead of fetching.",
    "  --prior-json   Prior leaders JSON for new-entrant comparison.",
    "  --min-buyability  Minimum buyability score for buyable table (default: 70).",
    "  --exclude-caution  Exclude entries with caution flags from buyable table.",
    "  --json-out     Override JSON output path.",
    "  --md-out       Override Markdown output path.",
    "  --concurrency  Yahoo fetch concurrency when building cache (default: 12).",
    "  --range        Yahoo chart range when building cache (default: 2y).",
    "  --skip-backdrop  Skip KOSPI/KOSDAQ backdrop fetch for offline smoke tests.",
  ].join("\n");
}

function formatSeoulDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function defaultCachePath(date) {
  return path.join(REPO_ROOT, ".tmp", "kr-market-leaders", `${date}.json`);
}

function defaultJsonOut(date) {
  return path.join(REPO_ROOT, "analysis-example", "kr-market", `leaders-${date}.json`);
}

function defaultMdOut(date) {
  return path.join(REPO_ROOT, "analysis-example", "kr-market", `leaders-${date}.md`);
}

function defaultPriorSearchDir() {
  return path.join(REPO_ROOT, "analysis-example", "kr-market");
}

function findPriorJson(date, searchDir = defaultPriorSearchDir()) {
  if (!fs.existsSync(searchDir)) {
    return null;
  }
  const candidates = fs.readdirSync(searchDir)
    .map((file) => {
      const match = /^leaders-(\d{4}-\d{2}-\d{2})\.json$/.exec(file);
      return match ? { date: match[1], path: path.join(searchDir, file) } : null;
    })
    .filter(Boolean)
    .filter((item) => item.date < date)
    .sort((left, right) => right.date.localeCompare(left.date));
  return candidates.length ? candidates[0].path : null;
}

function loadPriorReport(args, date) {
  const priorPath = args.priorJson ? path.resolve(args.priorJson) : findPriorJson(date);
  if (!priorPath) {
    return { prior: null, priorPath: null };
  }
  return {
    prior: JSON.parse(fs.readFileSync(priorPath, "utf8")),
    priorPath,
  };
}

function round(value, digits = 4) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
}

function percentileRank(entries, field, { higherIsBetter = true } = {}) {
  const ranked = entries
    .filter((entry) => Number.isFinite(entry[field]))
    .sort((left, right) => higherIsBetter ? right[field] - left[field] : left[field] - right[field]);
  const denominator = Math.max(ranked.length - 1, 1);
  const percentiles = new Map();
  ranked.forEach((entry, index) => {
    percentiles.set(entry.ticker, ranked.length === 1 ? 100 : ((ranked.length - 1 - index) / denominator) * 100);
  });
  return percentiles;
}

function averagePresent(values) {
  const present = values.filter(Number.isFinite);
  return present.length ? present.reduce((sum, value) => sum + value, 0) / present.length : null;
}

function weightedAveragePresent(items) {
  const present = items.filter((item) => Number.isFinite(item.value) && Number.isFinite(item.weight) && item.weight > 0);
  const totalWeight = present.reduce((sum, item) => sum + item.weight, 0);
  if (!present.length || totalWeight === 0) {
    return null;
  }
  return present.reduce((sum, item) => sum + (item.value * item.weight), 0) / totalWeight;
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function scaleRange(value, min, max, targetMax = 100) {
  if (!Number.isFinite(value)) {
    return null;
  }
  return clamp(((value - min) / (max - min)) * targetMax, 0, targetMax);
}

function computeMinerviniStylePassCount(entry) {
  const checks = [
    Number.isFinite(entry.return120) ? entry.return120 > 0 : null,
    Number.isFinite(entry.return252) ? entry.return252 > 0 : null,
    Number.isFinite(entry.rsPercentile) ? entry.rsPercentile >= 70 : null,
    Number.isFinite(entry.priceVs52WeekHighRatio) ? entry.priceVs52WeekHighRatio >= 0.75 : null,
    Number.isFinite(entry.priceVs52WeekLowRatio) ? entry.priceVs52WeekLowRatio >= 1.3 : null,
    Number.isFinite(entry.volumeRatio20) ? entry.volumeRatio20 >= 0.8 : null,
  ];
  return {
    passed: checks.filter((value) => value === true).length,
    available: checks.filter((value) => value !== null).length,
  };
}

function buildCautionFlags(entry) {
  const flags = new Set();
  const dataQuality = Array.isArray(entry.dataQuality) ? entry.dataQuality : [];

  if (!Number.isFinite(entry.volumeRatio20) || entry.latestVolume === 0) {
    flags.add("거래량 검증 필요");
  }
  if (Number.isFinite(entry.barsFetched) && entry.barsFetched < 252) {
    flags.add("252거래일 미만");
  }
  if (dataQuality.some((item) => /252거래일|거래량|최근거래일|산출불가/.test(String(item)))) {
    flags.add("데이터 품질 확인");
  }
  if (dataQuality.some((item) => /최근거래일/.test(String(item)))) {
    flags.add("최근거래일 불일치");
  }

  const extremeReturn = RETURN_FIELDS.some((field) => {
    const value = entry[field];
    return Number.isFinite(value) && (value >= 5 || value <= -0.8);
  });
  if (extremeReturn) {
    flags.add("극단 수익률");
  }

  const zeroReturnCount = RETURN_FIELDS.filter((field) => entry[field] === 0).length;
  if (zeroReturnCount >= 4 && (!Number.isFinite(entry.volumeRatio20) || entry.volumeRatio20 === 0)) {
    flags.add("정지/재상장 의심");
  }

  return [...flags];
}

function computeBuyabilityScore(entry) {
  const highProximity = Number.isFinite(entry.highProximityPct)
    ? entry.highProximityPct
    : Number.isFinite(entry.priceVs52WeekHighRatio)
      ? entry.priceVs52WeekHighRatio * 100
      : null;
  const cautionFlags = Array.isArray(entry.cautionFlags) ? entry.cautionFlags : buildCautionFlags(entry);

  let score = 0;
  score += scaleRange(entry.rsPercentile, 70, 100, 25) || 0;
  score += Number.isFinite(entry.return30) && entry.return30 > 0 ? 10 : 0;
  score += Number.isFinite(entry.return60) && entry.return60 > 0 ? 10 : 0;
  score += Number.isFinite(entry.return120) && entry.return120 > 0 ? 10 : 0;
  score += Number.isFinite(highProximity) ? scaleRange(highProximity, 85, 100, 20) || 0 : 0;

  if (Number.isFinite(entry.volumeRatio20)) {
    if (entry.volumeRatio20 >= 1.2 && entry.volumeRatio20 <= 5) {
      score += 15;
    } else if (entry.volumeRatio20 >= 0.8 && entry.volumeRatio20 < 1.2) {
      score += 7;
    } else if (entry.volumeRatio20 > 5 && entry.volumeRatio20 < 10) {
      score += 5;
    }
  }

  if (cautionFlags.length === 0) {
    score += 10;
  }

  if (Number.isFinite(entry.return1) && entry.return1 >= 0.2) {
    score -= 15;
  }
  if (Number.isFinite(entry.return7) && entry.return7 >= 0.5) {
    score -= 20;
  }
  if (Number.isFinite(entry.volumeRatio20) && entry.volumeRatio20 >= 10) {
    score -= 20;
  }
  if (cautionFlags.length) {
    score -= Math.min(35, cautionFlags.length * 12);
  }

  return round(clamp(score), 2);
}

function assignSetupLabel(entry) {
  const cautionFlags = Array.isArray(entry.cautionFlags) ? entry.cautionFlags : buildCautionFlags(entry);
  const highProximity = Number.isFinite(entry.highProximityPct)
    ? entry.highProximityPct
    : Number.isFinite(entry.priceVs52WeekHighRatio)
      ? entry.priceVs52WeekHighRatio * 100
      : null;
  const volumeConfirmed = Number.isFinite(entry.volumeRatio20) && entry.volumeRatio20 >= 1.2 && entry.volumeRatio20 <= 5;
  const overheated = (Number.isFinite(entry.return1) && entry.return1 >= 0.2)
    || (Number.isFinite(entry.return7) && entry.return7 >= 0.5)
    || (Number.isFinite(entry.volumeRatio20) && entry.volumeRatio20 >= 10);

  if (cautionFlags.length) {
    return "데이터 검증 필요";
  }
  if (overheated || (Number.isFinite(entry.structuralScore) && entry.structuralScore < 50 && Number.isFinite(entry.return7) && entry.return7 >= 0.2)) {
    return "과열 주의";
  }
  if (Number.isFinite(highProximity) && highProximity >= 95 && Number.isFinite(entry.rsPercentile) && entry.rsPercentile >= 90 && volumeConfirmed) {
    return "돌파 후보";
  }
  if ((Number.isFinite(entry.structuralScore) && entry.structuralScore >= 75)
    && (Number.isFinite(entry.intermediateScore) && entry.intermediateScore >= 65)
    && (Number.isFinite(entry.return7) && entry.return7 < 0.2)
    && (!Number.isFinite(entry.return1) || entry.return1 < 0.2)
    && Number.isFinite(entry.rsPercentile) && entry.rsPercentile >= 80) {
    return "눌림 후보";
  }
  return "관찰";
}

function normalizeEntry(entry, percentiles, backdrop) {
  const marketReturn30 = backdrop?.[entry.market]?.return30;
  const marketReturn60 = backdrop?.[entry.market]?.return60;
  const minerviniStyle = computeMinerviniStylePassCount(entry);
  const highProximity = Number.isFinite(entry.priceVs52WeekHighRatio) ? entry.priceVs52WeekHighRatio * 100 : null;
  const dataQuality = Array.isArray(entry.dataQuality) ? entry.dataQuality : [];

  const shortScore = averagePresent([
    percentiles.return1.get(entry.ticker),
    percentiles.return7.get(entry.ticker),
    Number.isFinite(entry.volumeRatio20) ? Math.min(entry.volumeRatio20 / 2, 1) * 100 : null,
    Number.isFinite(entry.return7) && Number.isFinite(backdrop?.[entry.market]?.return7)
      ? Math.max(Math.min((entry.return7 - backdrop[entry.market].return7) * 500 + 50, 100), 0)
      : null,
  ]);
  const intermediateScore = averagePresent([
    percentiles.return30.get(entry.ticker),
    percentiles.return60.get(entry.ticker),
    Number.isFinite(entry.return30) && Number.isFinite(marketReturn30)
      ? Math.max(Math.min((entry.return30 - marketReturn30) * 300 + 50, 100), 0)
      : null,
    Number.isFinite(entry.return60) && Number.isFinite(marketReturn60)
      ? Math.max(Math.min((entry.return60 - marketReturn60) * 250 + 50, 100), 0)
      : null,
  ]);
  const structuralScore = averagePresent([
    percentiles.return120.get(entry.ticker),
    percentiles.return252.get(entry.ticker),
    entry.rsPercentile,
    Number.isFinite(highProximity) ? Math.min(highProximity, 100) : null,
    minerviniStyle.available ? (minerviniStyle.passed / minerviniStyle.available) * 100 : null,
  ]);
  const compositeScore = weightedAveragePresent([
    { value: shortScore, weight: 0.2 },
    { value: intermediateScore, weight: 0.4 },
    { value: structuralScore, weight: 0.4 },
  ]);
  const scoredEntry = {
    ...entry,
    shortScore: round(shortScore, 2),
    intermediateScore: round(intermediateScore, 2),
    structuralScore: round(structuralScore, 2),
    compositeScore: round(compositeScore, 2),
    highProximityPct: round(highProximity ?? entry.highProximityPct, 2),
  };
  const cautionFlags = buildCautionFlags(scoredEntry);
  const buyabilityScore = computeBuyabilityScore({ ...scoredEntry, cautionFlags });

  return {
    ...entry,
    returns: Object.fromEntries(RETURN_FIELDS.map((field) => [field.replace("return", ""), round(entry[field])])),
    percentiles: Object.fromEntries(RETURN_FIELDS.map((field) => [field.replace("return", ""), round(percentiles[field].get(entry.ticker), 2)])),
    shortScore: scoredEntry.shortScore,
    intermediateScore: scoredEntry.intermediateScore,
    structuralScore: scoredEntry.structuralScore,
    compositeScore: scoredEntry.compositeScore,
    buyabilityScore,
    highProximityPct: scoredEntry.highProximityPct,
    minerviniStyle,
    leadershipLabel: assignLeadershipLabel({ shortScore, intermediateScore, structuralScore }),
    setupLabel: assignSetupLabel({ ...scoredEntry, cautionFlags }),
    cautionFlags,
    dataQualityNote: dataQuality.length ? dataQuality.join("; ") : "정상",
  };
}

function assignLeadershipLabel(scores) {
  const short = Number.isFinite(scores.shortScore) ? scores.shortScore : -Infinity;
  const intermediate = Number.isFinite(scores.intermediateScore) ? scores.intermediateScore : -Infinity;
  const structural = Number.isFinite(scores.structuralScore) ? scores.structuralScore : -Infinity;
  const strongCount = [short, intermediate, structural].filter((score) => score >= 75).length;
  if (strongCount >= 3) {
    return "전구간 주도";
  }
  if (structural >= 75 && intermediate >= 65) {
    return "구조적 주도";
  }
  if (intermediate >= 75) {
    return "중기 주도";
  }
  if (short >= 75) {
    return "단기 급등";
  }
  return "관찰";
}

function rankLeaders(cache, backdrop = {}) {
  const eligible = (cache.entries || []).filter((entry) => !entry.error && entry.latestDate);
  const percentiles = Object.fromEntries(RETURN_FIELDS.map((field) => [field, percentileRank(eligible, field)]));
  const entries = eligible.map((entry) => normalizeEntry(entry, percentiles, backdrop));
  const sortBy = (field) => [...entries]
    .filter((entry) => Number.isFinite(entry[field]))
    .sort((left, right) => right[field] - left[field] || String(left.ticker).localeCompare(String(right.ticker)));

  return {
    entries,
    shortTerm: sortBy("shortScore"),
    intermediate: sortBy("intermediateScore"),
    structural: sortBy("structuralScore"),
    composite: sortBy("compositeScore"),
  };
}

function rankBuyableCandidates(entries, options = {}) {
  const minBuyability = Number.isFinite(options.minBuyability) ? options.minBuyability : DEFAULT_MIN_BUYABILITY;
  const base = [...entries].filter((entry) => Number.isFinite(entry.buyabilityScore));
  const buyable = base
    .filter((entry) => entry.buyabilityScore >= minBuyability)
    .filter((entry) => entry.setupLabel !== "과열 주의" && entry.setupLabel !== "데이터 검증 필요")
    .filter((entry) => !options.excludeCaution || !(entry.cautionFlags || []).length)
    .sort((left, right) => right.buyabilityScore - left.buyabilityScore
      || (right.compositeScore ?? -Infinity) - (left.compositeScore ?? -Infinity)
      || String(left.ticker).localeCompare(String(right.ticker)));

  const byBuyability = (label) => base
    .filter((entry) => entry.setupLabel === label)
    .sort((left, right) => right.buyabilityScore - left.buyabilityScore
      || (right.compositeScore ?? -Infinity) - (left.compositeScore ?? -Infinity)
      || String(left.ticker).localeCompare(String(right.ticker)));

  return {
    buyable,
    pullback: byBuyability("눌림 후보"),
    breakout: byBuyability("돌파 후보"),
    caution: base
      .filter((entry) => (entry.cautionFlags || []).length || entry.setupLabel === "과열 주의" || entry.setupLabel === "데이터 검증 필요")
      .sort((left, right) => right.compositeScore - left.compositeScore || String(left.ticker).localeCompare(String(right.ticker))),
  };
}

function compareWithPriorReport(current, prior) {
  if (!prior || !prior.rankings) {
    return {
      available: false,
      message: "비교 기준 없음",
      newEntrants: [],
      labelUpgrades: [],
      rs90Breakouts: [],
    };
  }

  const currentComposite = (current.rankings?.composite || []).slice(0, DEFAULT_TOP);
  const priorComposite = (prior.rankings?.composite || []).slice(0, DEFAULT_TOP);
  const priorTopTickers = new Set(priorComposite.map((entry) => entry.ticker));
  const priorByTicker = new Map((prior.entries || []).map((entry) => [entry.ticker, entry]));
  const labelStrength = new Map([
    ["관찰", 0],
    ["데이터 검증 필요", 0],
    ["과열 주의", 1],
    ["단기 급등", 2],
    ["중기 주도", 3],
    ["구조적 주도", 4],
    ["눌림 후보", 4],
    ["돌파 후보", 5],
    ["전구간 주도", 6],
  ]);

  const newEntrants = currentComposite
    .filter((entry) => !priorTopTickers.has(entry.ticker))
    .map((entry) => ({
      ticker: entry.ticker,
      name: entry.name,
      market: entry.market,
      compositeScore: entry.compositeScore,
      buyabilityScore: entry.buyabilityScore,
      setupLabel: entry.setupLabel,
      rsPercentile: round(entry.rsPercentile, 2),
    }));

  const labelUpgrades = currentComposite
    .map((entry) => {
      const previous = priorByTicker.get(entry.ticker);
      if (!previous) {
        return null;
      }
      const previousLabel = previous.setupLabel || previous.leadershipLabel || "관찰";
      const currentLabel = entry.setupLabel || entry.leadershipLabel || "관찰";
      if ((labelStrength.get(currentLabel) ?? 0) <= (labelStrength.get(previousLabel) ?? 0)) {
        return null;
      }
      return {
        ticker: entry.ticker,
        name: entry.name,
        from: previousLabel,
        to: currentLabel,
        buyabilityScore: entry.buyabilityScore,
      };
    })
    .filter(Boolean);

  const rs90Breakouts = currentComposite
    .filter((entry) => Number.isFinite(entry.rsPercentile) && entry.rsPercentile >= 90)
    .filter((entry) => {
      const previous = priorByTicker.get(entry.ticker);
      return !previous || !Number.isFinite(previous.rsPercentile) || previous.rsPercentile < 90;
    })
    .map((entry) => ({
      ticker: entry.ticker,
      name: entry.name,
      rsPercentile: round(entry.rsPercentile, 2),
      setupLabel: entry.setupLabel,
    }));

  return {
    available: true,
    newEntrants,
    labelUpgrades,
    rs90Breakouts,
  };
}

function formatPercent(value, digits = 1) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(digits)}%` : "-";
}

function formatScore(value, digits = 1) {
  return Number.isFinite(value) ? value.toFixed(digits) : "-";
}

function formatRatio(value, digits = 2) {
  return Number.isFinite(value) ? `${value.toFixed(digits)}x` : "-";
}

function mdTable(rows, top) {
  const header = "| # | Ticker | Name | Market | 1D | 7D | 30D | 60D | 120D | 252D | RS %ile | Vol | 52W High | Label | Data |";
  const divider = "|---:|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|";
  const body = rows.slice(0, top).map((entry, index) => [
    index + 1,
    entry.ticker,
    entry.name,
    entry.market,
    formatPercent(entry.return1),
    formatPercent(entry.return7),
    formatPercent(entry.return30),
    formatPercent(entry.return60),
    formatPercent(entry.return120),
    formatPercent(entry.return252),
    formatScore(entry.rsPercentile),
    formatRatio(entry.volumeRatio20),
    Number.isFinite(entry.highProximityPct) ? `${entry.highProximityPct.toFixed(1)}%` : "-",
    entry.leadershipLabel,
    entry.dataQualityNote,
  ].join(" | "));
  return [header, divider, ...body.map((line) => `| ${line} |`)].join("\n");
}

function mdCandidateTable(rows, top) {
  const header = "| # | Ticker | Name | Market | Buyability | Setup | 7D | 30D | 60D | 120D | RS %ile | Vol | 52W High | Flags |";
  const divider = "|---:|---|---|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---|";
  const body = rows.slice(0, top).map((entry, index) => [
    index + 1,
    entry.ticker,
    entry.name,
    entry.market,
    formatScore(entry.buyabilityScore),
    entry.setupLabel,
    formatPercent(entry.return7),
    formatPercent(entry.return30),
    formatPercent(entry.return60),
    formatPercent(entry.return120),
    formatScore(entry.rsPercentile),
    formatRatio(entry.volumeRatio20),
    Number.isFinite(entry.highProximityPct) ? `${entry.highProximityPct.toFixed(1)}%` : "-",
    (entry.cautionFlags || []).length ? entry.cautionFlags.join("; ") : "정상",
  ].join(" | "));
  return [header, divider, ...body.map((line) => `| ${line} |`)].join("\n");
}

function renderNewEntrants(comparison) {
  if (!comparison?.available) {
    return [
      "- 비교 기준: 없음. 기준일 이전 leaders-*.json 파일이 없어 신규 진입 여부를 판정하지 않았습니다.",
      "- 따라서 신규 진입, 라벨 승격, RS 90 신규 돌파는 이번 파일에서 판정하지 않았습니다.",
    ].join("\n");
  }

  const lines = [];
  const newEntrants = comparison.newEntrants || [];
  const labelUpgrades = comparison.labelUpgrades || [];
  const rs90Breakouts = comparison.rs90Breakouts || [];
  lines.push(`- 신규 top20 진입: ${newEntrants.length ? newEntrants.map((entry) => `${entry.name}(${entry.ticker}, ${entry.setupLabel})`).join(", ") : "없음"}.`);
  lines.push(`- 라벨 승격: ${labelUpgrades.length ? labelUpgrades.map((entry) => `${entry.name}(${entry.ticker}, ${entry.from} -> ${entry.to})`).join(", ") : "없음"}.`);
  lines.push(`- RS 90 신규 돌파: ${rs90Breakouts.length ? rs90Breakouts.map((entry) => `${entry.name}(${entry.ticker}, RS ${formatScore(entry.rsPercentile)})`).join(", ") : "없음"}.`);
  return lines.join("\n");
}

function summarizeThemes(entries) {
  const counts = new Map();
  entries.slice(0, 20).forEach((entry) => {
    const label = entry.industry || entry.product || "미분류";
    counts.set(label, (counts.get(label) || 0) + 1);
  });
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5)
    .map(([label, count]) => `${label}(${count})`);
}

function renderBackdrop(backdrop) {
  const rows = ["| Market | 1D | 7D | 30D | 60D |", "|---|---:|---:|---:|---:|"];
  for (const market of ["KOSPI", "KOSDAQ"]) {
    const item = backdrop[market] || {};
    rows.push(`| ${market} | ${formatPercent(item.return1)} | ${formatPercent(item.return7)} | ${formatPercent(item.return30)} | ${formatPercent(item.return60)} |`);
  }
  return rows.join("\n");
}

function renderMarkdown(result, top) {
  const themes = summarizeThemes(result.rankings.composite);
  return [
    `# KRX Market Leaders - ${result.date}`,
    "",
    "| Field | Value |",
    "|---|---|",
    `| 기준일 | ${result.date} |`,
    `| 생성시각 | ${result.generatedAt} |`,
    `| Universe scope | ${result.universe.scope || "KOSPI + KOSDAQ integrated"} |`,
    `| Listed / included / attempted | ${result.universe.totalListed ?? "-"} / ${result.universe.includedOrdinaryStocks ?? "-"} / ${result.universe.attemptedSymbols ?? "-"} |`,
    `| Eligible / failed fetch | ${result.universe.eligibleCount ?? "-"} / ${result.universe.failedCount ?? "-"} |`,
    `| Source cache | ${result.sourceCachePath} |`,
    "",
    "## Market Backdrop",
    "",
    renderBackdrop(result.marketBackdrop),
    "",
    "## Buyable Candidates",
    "",
    "- 가격/거래량 기반의 매수 검토 후보 필터입니다. 매수 추천이 아니며, 공시/실적/밸류에이션은 반영하지 않았습니다.",
    "",
    mdCandidateTable(result.rankings.buyable, top),
    "",
    "## Pullback Watchlist",
    "",
    mdCandidateTable(result.rankings.pullback, top),
    "",
    "## Breakout Watchlist",
    "",
    mdCandidateTable(result.rankings.breakout, top),
    "",
    "## Excluded / Caution Flags",
    "",
    mdCandidateTable(result.rankings.caution, top),
    "",
    "## 1D/7D 단기 주도주",
    "",
    mdTable(result.rankings.shortTerm, top),
    "",
    "## 30D/60D 중기 주도주",
    "",
    mdTable(result.rankings.intermediate, top),
    "",
    "## 120D/252D 구조적 주도주",
    "",
    mdTable(result.rankings.structural, top),
    "",
    "## Composite Leaders",
    "",
    mdTable(result.rankings.composite, top),
    "",
    "## New Entrants",
    "",
    renderNewEntrants(result.priorComparison),
    "",
    "## Interpretation",
    "",
    `- Composite 상위권의 KRX 업종/제품 라벨 힌트: ${themes.length ? themes.join(", ") : "산출불가"}.`,
    "- 단기 표는 이벤트성 급등과 거래량 확장을 포착하므로, 30D/60D 및 구조적 표와 함께 확인해야 합니다.",
    "- 구조적 표는 120D/252D RS, 52주 고가 근접도, 제한적 Minervini-style 체크를 함께 본 기술적 리더십 화면입니다.",
    "",
    "## Limitations",
    "",
    "- 이 자료는 가격/거래량 기반 기술적 시장 리더십 스크린이며 매수 추천이 아닙니다.",
    "- 재무제표, DART 공시, 수급, 밸류에이션, 애널리스트 의견은 통합하지 않았습니다.",
    "- Yahoo/KRX 수집 지연 또는 종목별 데이터 누락이 있을 수 있으므로 `Data` 열을 확인해야 합니다.",
    "",
  ].join("\n");
}

async function fetchMarketBackdrop(date) {
  const specs = [
    ["KOSPI", "^KS11"],
    ["KOSDAQ", "^KQ11"],
  ];
  const result = {};
  await Promise.all(specs.map(async ([market, symbol]) => {
    try {
      const bars = (await fetchYahooChart(symbol, "1y")).filter((bar) => bar.date <= date);
      result[market] = {
        return1: computeReturnFromBars(bars, 1),
        return7: computeReturnFromBars(bars, 7),
        return30: computeReturnFromBars(bars, 30),
        return60: computeReturnFromBars(bars, 60),
      };
    } catch (error) {
      result[market] = { error: error.message };
    }
  }));
  return result;
}

async function loadOrBuildCache(args) {
  if (args.cacheIn) {
    const cachePath = path.resolve(args.cacheIn);
    return {
      cache: JSON.parse(fs.readFileSync(cachePath, "utf8")),
      cachePath,
      reused: true,
    };
  }
  const date = args.date || formatSeoulDate();
  return buildUniverseCache({
    date,
    cacheOut: defaultCachePath(date),
    limit: args.limit,
    concurrency: args.concurrency,
    range: args.range,
  });
}

async function screenMarketLeaders(args) {
  const { cache, cachePath, reused } = await loadOrBuildCache(args);
  const date = args.date || cache.date || formatSeoulDate();
  const backdrop = args.skipBackdrop ? {} : await fetchMarketBackdrop(date);
  const ranked = rankLeaders(cache, backdrop);
  const buyabilityRankings = rankBuyableCandidates(ranked.entries, {
    minBuyability: args.minBuyability,
    excludeCaution: args.excludeCaution,
  });
  const { prior, priorPath } = loadPriorReport(args, date);
  const result = {
    date,
    generatedAt: new Date().toISOString(),
    sourceCachePath: cachePath,
    sourceCacheReused: reused,
    priorJsonPath: priorPath,
    universe: {
      ...(cache.universe || {}),
      eligibleCount: ranked.entries.length,
      failedCount: (cache.entries || []).filter((entry) => entry.error).length,
    },
    marketBackdrop: backdrop,
    rankings: {
      shortTerm: ranked.shortTerm,
      intermediate: ranked.intermediate,
      structural: ranked.structural,
      composite: ranked.composite,
      buyable: buyabilityRankings.buyable,
      pullback: buyabilityRankings.pullback,
      breakout: buyabilityRankings.breakout,
      caution: buyabilityRankings.caution,
      newEntrants: [],
    },
    entries: ranked.entries,
  };
  result.priorComparison = compareWithPriorReport(result, prior);
  result.rankings.newEntrants = result.priorComparison.newEntrants;

  const jsonOut = path.resolve(args.jsonOut || defaultJsonOut(date));
  const mdOut = path.resolve(args.mdOut || defaultMdOut(date));
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.mkdirSync(path.dirname(mdOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify(result, null, 2)}\n`);
  fs.writeFileSync(mdOut, renderMarkdown(result, args.top), "utf8");
  return { result, jsonOut, mdOut };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    process.exit(0);
  }
  if (args.date && !/^\d{4}-\d{2}-\d{2}$/.test(args.date)) {
    throw new Error("--date must be YYYY-MM-DD.");
  }
  if (!Number.isInteger(args.top) || args.top < 1) {
    throw new Error("--top must be a positive integer.");
  }
  if (args.limit !== undefined && (!Number.isInteger(args.limit) || args.limit < 1)) {
    throw new Error("--limit must be a positive integer.");
  }
  if (!Number.isFinite(args.minBuyability) || args.minBuyability < 0 || args.minBuyability > 100) {
    throw new Error("--min-buyability must be a number between 0 and 100.");
  }

  const { result, jsonOut, mdOut } = await screenMarketLeaders(args);
  console.log(JSON.stringify({
    status: "ok",
    date: result.date,
    markdown: mdOut,
    json: jsonOut,
    universe: result.universe,
    topComposite: result.rankings.composite.slice(0, 5).map((entry) => ({
      ticker: entry.ticker,
      name: entry.name,
      score: entry.compositeScore,
      label: entry.leadershipLabel,
      setupLabel: entry.setupLabel,
      buyabilityScore: entry.buyabilityScore,
    })),
    topBuyable: result.rankings.buyable.slice(0, 5).map((entry) => ({
      ticker: entry.ticker,
      name: entry.name,
      score: entry.buyabilityScore,
      setupLabel: entry.setupLabel,
    })),
  }, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  });
}

module.exports = {
  percentileRank,
  computeMinerviniStylePassCount,
  computeBuyabilityScore,
  assignSetupLabel,
  buildCautionFlags,
  rankBuyableCandidates,
  compareWithPriorReport,
  findPriorJson,
  assignLeadershipLabel,
  rankLeaders,
  renderMarkdown,
  screenMarketLeaders,
};
