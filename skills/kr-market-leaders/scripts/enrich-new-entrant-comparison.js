#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const DEFAULT_TOP = 20;
const RETURN_FIELDS = ["return1", "return7", "return30", "return60", "return120", "return252"];

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--current-json") {
      args.currentJson = argv[++index];
    } else if (arg === "--prior-json") {
      args.priorJson = argv[++index];
    } else if (arg === "--md") {
      args.md = argv[++index];
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!args.currentJson || !args.priorJson || !args.md) {
    throw new Error("--current-json, --prior-json, and --md are required.");
  }
  return args;
}

function round(value, digits = 4) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
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

function topRankMap(rows = []) {
  return new Map(rows.slice(0, DEFAULT_TOP).map((entry, index) => [entry.ticker, index + 1]));
}

function bestRank(ticker, maps) {
  const ranks = Object.values(maps)
    .map((map) => map.get(ticker))
    .filter(Number.isFinite);
  return ranks.length ? Math.min(...ranks) : "not in top 20";
}

function categoryStrength(category) {
  return {
    none: 0,
    short: 1,
    intermediate: 2,
    structural: 3,
    all: 4,
  }[category || "none"] ?? 0;
}

function leadershipCategory(entry) {
  if (!entry) {
    return "none";
  }
  const short = Number.isFinite(entry.shortScore) ? entry.shortScore : -Infinity;
  const intermediate = Number.isFinite(entry.intermediateScore) ? entry.intermediateScore : -Infinity;
  const structural = Number.isFinite(entry.structuralScore) ? entry.structuralScore : -Infinity;
  const strongCount = [short, intermediate, structural].filter((score) => score >= 75).length;
  if (strongCount >= 3) return "all";
  if (structural >= 75 && intermediate >= 65) return "structural";
  if (intermediate >= 75) return "intermediate";
  if (short >= 75) return "short";
  return "none";
}

function targetUpgrade(category) {
  return category === "all" || category === "intermediate" || category === "structural";
}

function entrantSummary(entry) {
  return {
    ticker: entry.ticker,
    name: entry.name,
    market: entry.market,
    return1: round(entry.return1),
    return7: round(entry.return7),
    return30: round(entry.return30),
    return60: round(entry.return60),
    return120: round(entry.return120),
    return252: round(entry.return252),
    rsPercentile: round(entry.rsPercentile, 2),
    volumeRatio20: round(entry.volumeRatio20, 2),
    highProximityPct: round(entry.highProximityPct, 2),
    currentLabel: entry.leadershipLabel || entry.setupLabel || "-",
    leadershipLabel: entry.leadershipLabel,
    setupLabel: entry.setupLabel,
    compositeScore: entry.compositeScore,
    dataQualityNote: entry.dataQualityNote || "-",
    cautionFlags: entry.cautionFlags || [],
    events: [],
  };
}

function addEvent(eventsByTicker, entry, event) {
  if (!eventsByTicker.has(entry.ticker)) {
    eventsByTicker.set(entry.ticker, entrantSummary(entry));
  }
  eventsByTicker.get(entry.ticker).events.push(event);
}

function summarizeRank(events, field) {
  const ranks = events.map((event) => event[field]).filter((rank) => rank !== "not in top 20");
  return ranks.length ? Math.min(...ranks) : "not in top 20";
}

function compare(current, prior) {
  const lensSpecs = [
    { key: "shortTerm", label: "new short-term top 20" },
    { key: "intermediate", label: "new intermediate top 20" },
    { key: "structural", label: "new structural top 20" },
    { key: "composite", label: "new composite top 20" },
  ];
  const currentTopMaps = Object.fromEntries(lensSpecs.map((spec) => [spec.key, topRankMap(current.rankings?.[spec.key])]));
  const priorTopMaps = Object.fromEntries(lensSpecs.map((spec) => [spec.key, topRankMap(prior.rankings?.[spec.key])]));
  const priorByTicker = new Map((prior.entries || []).map((entry) => [entry.ticker, entry]));
  const eventsByTicker = new Map();

  for (const spec of lensSpecs) {
    for (const entry of (current.rankings?.[spec.key] || []).slice(0, DEFAULT_TOP)) {
      if (!priorTopMaps[spec.key].has(entry.ticker)) {
        addEvent(eventsByTicker, entry, {
          type: `${spec.key}Top20`,
          list: spec.label,
          previousRank: "not in top 20",
          currentRank: currentTopMaps[spec.key].get(entry.ticker),
        });
      }
    }
  }

  const labelUpgrades = [];
  const rs90Breakouts = [];
  const highProximity95Breakouts = [];
  const volumeConfirmedNewLeaders = [];

  for (const entry of current.entries || []) {
    const previous = priorByTicker.get(entry.ticker);
    const from = leadershipCategory(previous);
    const to = leadershipCategory(entry);
    if (targetUpgrade(to) && categoryStrength(to) > categoryStrength(from)) {
      addEvent(eventsByTicker, entry, {
        type: "leadershipUpgrade",
        list: `${from} -> ${to}`,
        previousRank: bestRank(entry.ticker, priorTopMaps),
        currentRank: bestRank(entry.ticker, currentTopMaps),
        from,
        to,
      });
      labelUpgrades.push({ ticker: entry.ticker, name: entry.name, market: entry.market, from, to });
    }

    if (Number.isFinite(entry.rsPercentile) && entry.rsPercentile >= 90
      && (!previous || !Number.isFinite(previous.rsPercentile) || previous.rsPercentile < 90)) {
      addEvent(eventsByTicker, entry, {
        type: "rs90Breakout",
        list: "new RS percentile >= 90",
        previousRank: bestRank(entry.ticker, priorTopMaps),
        currentRank: bestRank(entry.ticker, currentTopMaps),
      });
      rs90Breakouts.push({ ticker: entry.ticker, name: entry.name, rsPercentile: round(entry.rsPercentile, 2) });
    }

    if (Number.isFinite(entry.highProximityPct) && entry.highProximityPct >= 95
      && (!previous || !Number.isFinite(previous.highProximityPct) || previous.highProximityPct < 95)) {
      addEvent(eventsByTicker, entry, {
        type: "highProximity95",
        list: "new 52-week high proximity >= 95%",
        previousRank: bestRank(entry.ticker, priorTopMaps),
        currentRank: bestRank(entry.ticker, currentTopMaps),
      });
      highProximity95Breakouts.push({ ticker: entry.ticker, name: entry.name, highProximityPct: round(entry.highProximityPct, 2) });
    }

    if (Number.isFinite(entry.volumeRatio20) && entry.volumeRatio20 >= 1.5
      && bestRank(entry.ticker, currentTopMaps) !== "not in top 20"
      && (!previous || !Number.isFinite(previous.volumeRatio20) || previous.volumeRatio20 < 1.5)) {
      addEvent(eventsByTicker, entry, {
        type: "volumeConfirmedLeader",
        list: "new volume ratio >= 1.5x with current top 20 lens",
        previousRank: bestRank(entry.ticker, priorTopMaps),
        currentRank: bestRank(entry.ticker, currentTopMaps),
      });
      volumeConfirmedNewLeaders.push({ ticker: entry.ticker, name: entry.name, volumeRatio20: round(entry.volumeRatio20, 2) });
    }
  }

  const newEntrants = [...eventsByTicker.values()]
    .map((entry) => ({
      ...entry,
      newlyEnteredLists: entry.events.map((event) => event.list),
      previousRank: summarizeRank(entry.events, "previousRank"),
      currentRank: summarizeRank(entry.events, "currentRank"),
    }))
    .sort((left, right) => (right.compositeScore ?? -Infinity) - (left.compositeScore ?? -Infinity)
      || (right.rsPercentile ?? -Infinity) - (left.rsPercentile ?? -Infinity)
      || String(left.ticker).localeCompare(String(right.ticker)));

  return {
    available: true,
    newEntrants,
    labelUpgrades,
    rs90Breakouts,
    highProximity95Breakouts,
    volumeConfirmedNewLeaders,
  };
}

function eventSummary(entry) {
  return [...new Set(entry.newlyEnteredLists || [])].join("; ");
}

function renderNewEntrantsSection(comparison) {
  const rows = comparison.newEntrants || [];
  const header = [
    "| # | Ticker | Name | Market | Newly entered | Previous rank | Current rank | Label | 1D | 7D | 30D | 60D | 120D | 252D | RS %ile | Vol | 52W High | Data |",
    "|---:|---|---|---|---|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|",
  ];
  const body = rows.slice(0, DEFAULT_TOP).map((entry, index) => [
    index + 1,
    entry.ticker,
    entry.name,
    entry.market,
    eventSummary(entry),
    entry.previousRank,
    entry.currentRank,
    entry.currentLabel,
    formatPercent(entry.return1),
    formatPercent(entry.return7),
    formatPercent(entry.return30),
    formatPercent(entry.return60),
    formatPercent(entry.return120),
    formatPercent(entry.return252),
    formatScore(entry.rsPercentile),
    formatRatio(entry.volumeRatio20),
    Number.isFinite(entry.highProximityPct) ? `${entry.highProximityPct.toFixed(1)}%` : "-",
    entry.dataQualityNote,
  ].join(" | "));
  return [
    "## 신규 주도주 진입",
    "",
    `- 신규 진입 판정 수: ${rows.length}`,
    `- 신규 전구간 주도: ${comparison.labelUpgrades.filter((entry) => entry.to === "all").map((entry) => `${entry.name}(${entry.ticker})`).join(", ") || "없음"}`,
    `- 신규 RS 90 돌파: ${comparison.rs90Breakouts.map((entry) => `${entry.name}(${entry.ticker})`).join(", ") || "없음"}`,
    `- 신규 52주 고점 근접도 95%+: ${comparison.highProximity95Breakouts.map((entry) => `${entry.name}(${entry.ticker})`).join(", ") || "없음"}`,
    `- 신규 거래량 1.5x+ 상위권: ${comparison.volumeConfirmedNewLeaders.map((entry) => `${entry.name}(${entry.ticker})`).join(", ") || "없음"}`,
    "",
    ...header,
    ...body.map((line) => `| ${line} |`),
    "",
  ].join("\n");
}

function upsertSection(markdown, section) {
  const start = markdown.indexOf("## 신규 주도주 진입");
  if (start >= 0) {
    const next = markdown.indexOf("\n## ", start + 1);
    if (next >= 0) {
      return `${markdown.slice(0, start)}${section}${markdown.slice(next + 1)}`;
    }
    return `${markdown.slice(0, start)}${section}`;
  }
  const interpretation = markdown.indexOf("\n## Interpretation");
  if (interpretation >= 0) {
    return `${markdown.slice(0, interpretation + 1)}${section}${markdown.slice(interpretation + 1)}`;
  }
  return `${markdown.trimEnd()}\n\n${section}`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const currentPath = path.resolve(args.currentJson);
  const priorPath = path.resolve(args.priorJson);
  const mdPath = path.resolve(args.md);
  const current = JSON.parse(fs.readFileSync(currentPath, "utf8"));
  const prior = JSON.parse(fs.readFileSync(priorPath, "utf8"));
  const comparison = compare(current, prior);
  current.priorComparison = {
    ...(current.priorComparison || {}),
    ...comparison,
    priorJsonPath: priorPath,
  };
  current.rankings = current.rankings || {};
  current.rankings.newEntrants = comparison.newEntrants;
  fs.writeFileSync(currentPath, `${JSON.stringify(current, null, 2)}\n`);

  const markdown = fs.readFileSync(mdPath, "utf8");
  fs.writeFileSync(mdPath, upsertSection(markdown, renderNewEntrantsSection(comparison)), "utf8");
  console.log(JSON.stringify({
    status: "ok",
    newEntrants: comparison.newEntrants.length,
    labelUpgrades: comparison.labelUpgrades.length,
    rs90Breakouts: comparison.rs90Breakouts.length,
    highProximity95Breakouts: comparison.highProximity95Breakouts.length,
    volumeConfirmedNewLeaders: comparison.volumeConfirmedNewLeaders.length,
  }, null, 2));
}

if (require.main === module) {
  main();
}
