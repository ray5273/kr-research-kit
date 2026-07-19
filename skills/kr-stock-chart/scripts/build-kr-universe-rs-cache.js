#!/usr/bin/env node

const fs = require("fs");
const https = require("https");
const path = require("path");

const { normalizeBars } = require("./lib/technical-core");

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const DEFAULT_CONCURRENCY = 12;
const KIND_BASE_URL = "https://kind.krx.co.kr/corpgeneral/corpList.do";

function parseArgs(argv) {
  const result = {
    concurrency: DEFAULT_CONCURRENCY,
    range: "2y",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--date") {
      result.date = argv[index + 1];
      index += 1;
    } else if (arg === "--cache-out") {
      result.cacheOut = argv[index + 1];
      index += 1;
    } else if (arg === "--concurrency") {
      result.concurrency = Number(argv[index + 1]);
      index += 1;
    } else if (arg === "--range") {
      result.range = argv[index + 1];
      index += 1;
    } else if (arg === "--limit") {
      result.limit = Number(argv[index + 1]);
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
    "  node build-kr-universe-rs-cache.js --date YYYY-MM-DD [--cache-out path]",
    "",
    "Options:",
    "  --date         As-of date in YYYY-MM-DD. Uses the latest bar on or before that date.",
    "  --cache-out    Override cache output path. Defaults to .tmp/kr-rs-cache/<date>.json",
    "  --concurrency  Number of Yahoo requests to run in parallel (default: 12)",
    "  --range        Yahoo chart range to fetch (default: 2y)",
    "  --limit        Limit symbols for local testing",
  ].join("\n");
}

function formatSeoulDate(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(date);
}

function resolveCachePath(date, explicitPath) {
  if (explicitPath) {
    return path.resolve(explicitPath);
  }
  return path.join(REPO_ROOT, ".tmp", "kr-rs-cache", `${date}.json`);
}

function fetchBuffer(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const request = https.get(
      url,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 Codex stock-analysis-skill",
          Accept: "*/*",
          ...headers,
        },
      },
      (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          response.resume();
          fetchBuffer(response.headers.location, headers).then(resolve).catch(reject);
          return;
        }

        if (response.statusCode !== 200) {
          response.resume();
          reject(new Error(`HTTP ${response.statusCode} from ${url}`));
          return;
        }

        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => resolve(Buffer.concat(chunks)));
      },
    );

    request.on("error", reject);
  });
}

function decodeHtml(buffer, encoding = "utf-8") {
  return new TextDecoder(encoding).decode(buffer);
}

function stripTags(value) {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function parseCorpListTable(html) {
  const rows = [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];
  const entries = [];

  for (const rowMatch of rows) {
    const rowHtml = rowMatch[1];
    if (!/<td\b/i.test(rowHtml)) {
      continue;
    }
    const cells = [...rowHtml.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) => stripTags(cell[1]));
    if (cells.length < 2) {
      continue;
    }

    const codeMatch = cells.find((cell) => /^\d{6}$/.test(cell));
    if (!codeMatch) {
      continue;
    }

    const codeIndex = cells.indexOf(codeMatch);
    const marketCategory = codeIndex > 0 ? cells[codeIndex - 1] : null;
    const hasExplicitMarketCategory = /^(유가|코스닥|코넥스)$/u.test(marketCategory || "");
    const name = hasExplicitMarketCategory && codeIndex >= 2
      ? cells[codeIndex - 2]
      : codeIndex > 0
        ? cells[codeIndex - 1]
        : cells[0];
    if (!name || !/^\d{6}$/.test(codeMatch)) {
      continue;
    }

    entries.push({
      name,
      marketCategory,
      ticker: codeMatch,
      industry: cells[codeIndex + 1] || null,
      product: cells[codeIndex + 2] || null,
      listingDate: cells[codeIndex + 3] || null,
      closingMonth: cells[codeIndex + 4] || null,
    });
  }

  return entries;
}

function isOrdinaryStockCandidate(entry) {
  const name = String(entry.name || "").replace(/\s+/g, "");
  if (!name) {
    return false;
  }
  if (/리츠|REIT/i.test(name)) {
    return false;
  }
  if (/스팩|SPAC/i.test(name)) {
    return false;
  }
  if (/ETF|ETN|ELW/i.test(name)) {
    return false;
  }
  if (/우선주|우B|우C|[0-9]우|우\)|우$|우선/i.test(name)) {
    return false;
  }
  return true;
}

async function fetchKindMarketListings(marketType, marketName) {
  const url = new URL(KIND_BASE_URL);
  url.searchParams.set("method", "download");
  url.searchParams.set("searchType", "13");
  url.searchParams.set("marketType", marketType);
  const buffer = await fetchBuffer(url.toString(), { Referer: "https://kind.krx.co.kr/corpgeneral/corpList.do" });
  const html = decodeHtml(buffer, "euc-kr");
  return parseCorpListTable(html).map((entry) => ({
    ...entry,
    market: marketName,
    symbol: `${entry.ticker}.${marketName === "KOSPI" ? "KS" : "KQ"}`,
  }));
}

function dedupeListings(entries) {
  const seen = new Set();
  const result = [];
  for (const entry of entries) {
    if (seen.has(entry.ticker)) {
      continue;
    }
    seen.add(entry.ticker);
    result.push(entry);
  }
  return result;
}

function filterBarsToDate(rawBars, asOfDate) {
  return normalizeBars(rawBars).filter((bar) => bar.date <= asOfDate);
}

function computeReturnFromBars(bars, period) {
  if (bars.length <= period) {
    return null;
  }
  const latest = bars[bars.length - 1]?.close;
  const prior = bars[bars.length - 1 - period]?.close;
  if (![latest, prior].every(Number.isFinite) || prior === 0) {
    return null;
  }
  return latest / prior - 1;
}

function averageVolume(bars) {
  const volumes = bars
    .map((bar) => bar.volume)
    .filter((volume) => Number.isFinite(volume));
  if (!volumes.length) {
    return null;
  }
  return volumes.reduce((sum, volume) => sum + volume, 0) / volumes.length;
}

function computeVolumeRatio(bars, period = 20) {
  if (bars.length <= period) {
    return null;
  }
  const latestVolume = bars[bars.length - 1]?.volume;
  const priorAverage = averageVolume(bars.slice(-period - 1, -1));
  if (![latestVolume, priorAverage].every(Number.isFinite) || priorAverage === 0) {
    return null;
  }
  return latestVolume / priorAverage;
}

function computeHighLowStats(bars, period = 252) {
  const window = bars.slice(-period).filter((bar) => Number.isFinite(bar.close));
  const latestClose = bars[bars.length - 1]?.close;
  if (!window.length || !Number.isFinite(latestClose)) {
    return {
      close52WeekHigh: null,
      close52WeekLow: null,
      priceVs52WeekHighRatio: null,
      priceVs52WeekLowRatio: null,
      has52WeekHistory: false,
    };
  }
  const closes = window.map((bar) => bar.close);
  const close52WeekHigh = Math.max(...closes);
  const close52WeekLow = Math.min(...closes);
  return {
    close52WeekHigh,
    close52WeekLow,
    priceVs52WeekHighRatio: close52WeekHigh > 0 ? latestClose / close52WeekHigh : null,
    priceVs52WeekLowRatio: close52WeekLow > 0 ? latestClose / close52WeekLow : null,
    has52WeekHistory: bars.length >= period,
  };
}

function computeRsRawScore(entry) {
  if (![entry.return63, entry.return126, entry.return252].every(Number.isFinite)) {
    return null;
  }
  return (entry.return63 * 0.4) + (entry.return126 * 0.3) + (entry.return252 * 0.3);
}

function assignPercentiles(entries) {
  const eligible = [...entries]
    .filter((entry) => Number.isFinite(entry.rsRawScore))
    .sort((left, right) => right.rsRawScore - left.rsRawScore);

  const denominator = Math.max(eligible.length - 1, 1);
  eligible.forEach((entry, index) => {
    entry.rsPercentile = eligible.length === 1 ? 100 : ((eligible.length - 1 - index) / denominator) * 100;
  });

  return entries;
}

async function fetchYahooChart(symbol, range) {
  const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`);
  url.searchParams.set("range", range);
  url.searchParams.set("interval", "1d");
  url.searchParams.set("includeAdjustedClose", "true");
  url.searchParams.set("events", "div,splits");

  const buffer = await fetchBuffer(url.toString(), { Accept: "application/json" });
  const payload = JSON.parse(buffer.toString("utf8"));

  if (payload.chart?.error) {
    throw new Error(payload.chart.error.description || payload.chart.error.code || "Yahoo Finance chart error.");
  }

  const result = payload.chart?.result?.[0];
  const quote = result?.indicators?.quote?.[0];
  if (!result || !quote) {
    throw new Error("Yahoo Finance returned no chart result.");
  }

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const bars = (result.timestamp || [])
    .map((timestamp, index) => {
      const parts = formatter.formatToParts(new Date(timestamp * 1000));
      const year = parts.find((part) => part.type === "year")?.value;
      const month = parts.find((part) => part.type === "month")?.value;
      const day = parts.find((part) => part.type === "day")?.value;
      return {
        date: `${year}-${month}-${day}`,
        open: quote.open?.[index] ?? null,
        high: quote.high?.[index] ?? null,
        low: quote.low?.[index] ?? null,
        close: quote.close?.[index] ?? null,
        volume: quote.volume?.[index] ?? null,
      };
    })
    .filter((bar) => bar.close !== null && bar.close !== undefined);

  return normalizeBars(bars);
}

async function mapPool(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;

  async function runWorker() {
    while (true) {
      const current = cursor;
      cursor += 1;
      if (current >= items.length) {
        return;
      }
      results[current] = await worker(items[current], current);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => runWorker());
  await Promise.all(workers);
  return results;
}

async function buildUniverseCache(options = {}) {
  const asOfDate = options.date || formatSeoulDate();
  const cachePath = resolveCachePath(asOfDate, options.cacheOut);

  if (fs.existsSync(cachePath)) {
    const cached = JSON.parse(fs.readFileSync(cachePath, "utf8"));
    if (cached.date === asOfDate) {
      return { cache: cached, cachePath, reused: true };
    }
  }

  const marketListings = dedupeListings([
    ...(await fetchKindMarketListings("stockMkt", "KOSPI")),
    ...(await fetchKindMarketListings("kosdaqMkt", "KOSDAQ")),
  ]);

  const includedListings = marketListings.filter(isOrdinaryStockCandidate);
  const finalListings = Number.isFinite(options.limit) ? includedListings.slice(0, options.limit) : includedListings;

  const fetchResults = await mapPool(finalListings, options.concurrency || DEFAULT_CONCURRENCY, async (entry) => {
    try {
      const allBars = await fetchYahooChart(entry.symbol, options.range || "2y");
      const bars = filterBarsToDate(allBars, asOfDate);
      const latestBar = bars[bars.length - 1] || {};
      const highLowStats = computeHighLowStats(bars);
      const result = {
        ticker: entry.ticker,
        symbol: entry.symbol,
        name: entry.name,
        market: entry.market,
        industry: entry.industry,
        product: entry.product,
        latestDate: bars[bars.length - 1]?.date || null,
        latestClose: latestBar.close ?? null,
        latestVolume: latestBar.volume ?? null,
        barsFetched: bars.length,
        return1: computeReturnFromBars(bars, 1),
        return7: computeReturnFromBars(bars, 7),
        return30: computeReturnFromBars(bars, 30),
        return60: computeReturnFromBars(bars, 60),
        return120: computeReturnFromBars(bars, 120),
        return63: computeReturnFromBars(bars, 63),
        return126: computeReturnFromBars(bars, 126),
        return252: computeReturnFromBars(bars, 252),
        volumeRatio20: computeVolumeRatio(bars, 20),
        ...highLowStats,
        dataQuality: bars.length < 252 ? ["252거래일 미만"] : [],
      };
      result.rsRawScore = computeRsRawScore(result);
      return result;
    } catch (error) {
      return {
        ticker: entry.ticker,
        symbol: entry.symbol,
        name: entry.name,
        market: entry.market,
        latestDate: null,
        barsFetched: 0,
        return63: null,
        return126: null,
        return252: null,
        rsRawScore: null,
        error: error.message,
      };
    }
  });

  assignPercentiles(fetchResults);

  const cache = {
    date: asOfDate,
    generatedAt: new Date().toISOString(),
    listingsSource: {
      reference: "https://global.krx.co.kr/contents/GLB/03/0308/0308010000/GLB0308010000.jsp",
      operationalEndpoint: "https://kind.krx.co.kr/corpgeneral/corpList.do?method=download&searchType=13",
    },
    universe: {
      scope: "KOSPI + KOSDAQ integrated",
      totalListed: marketListings.length,
      includedOrdinaryStocks: includedListings.length,
      attemptedSymbols: finalListings.length,
      rsEligibleCount: fetchResults.filter((entry) => Number.isFinite(entry.rsPercentile)).length,
      failedCount: fetchResults.filter((entry) => entry.error).length,
    },
    entries: fetchResults,
  };

  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  fs.writeFileSync(cachePath, `${JSON.stringify(cache, null, 2)}\n`);
  return { cache, cachePath, reused: false };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    process.exit(0);
  }

  if (!args.date) {
    args.date = formatSeoulDate();
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date)) {
    throw new Error("--date must be YYYY-MM-DD.");
  }
  if (!Number.isInteger(args.concurrency) || args.concurrency < 1) {
    throw new Error("--concurrency must be a positive integer.");
  }

  const { cache, cachePath, reused } = await buildUniverseCache(args);
  console.log(JSON.stringify({
    status: reused ? "reused" : "built",
    cachePath,
    date: cache.date,
    universe: cache.universe,
  }, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  });
}

module.exports = {
  KIND_BASE_URL,
  parseCorpListTable,
  isOrdinaryStockCandidate,
  computeReturnFromBars,
  computeRsRawScore,
  assignPercentiles,
  fetchKindMarketListings,
  dedupeListings,
  fetchYahooChart,
  buildUniverseCache,
};
