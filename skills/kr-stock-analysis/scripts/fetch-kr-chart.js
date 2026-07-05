#!/usr/bin/env node

const fs = require("fs");
const https = require("https");
const path = require("path");

function parseArgs(argv) {
  const result = {
    range: "1y",
    interval: "1d",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--ticker") {
      result.ticker = argv[i + 1];
      i += 1;
    } else if (arg === "--market") {
      result.market = argv[i + 1];
      i += 1;
    } else if (arg === "--range") {
      result.range = argv[i + 1];
      i += 1;
    } else if (arg === "--interval") {
      result.interval = argv[i + 1];
      i += 1;
    } else if (arg === "--name") {
      result.name = argv[i + 1];
      i += 1;
    } else if (arg === "--output") {
      result.output = argv[i + 1];
      i += 1;
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
    "  node fetch-kr-chart.js --ticker 066970 [--market kosdaq|kospi] [--range 1y] [--interval 1d] --name \"LG전자\" [--output chart.json]",
    "  node fetch-kr-chart.js --ticker 005930.KS [--range 1y] [--interval 1d] [--output chart.json]",
    "",
    "Notes:",
    "  - Numeric KRX tickers are resolved to .KS or .KQ symbols.",
    "  - For numeric tickers, the script retries an alternate Yahoo suffix if the first symbol fails.",
    "  - Pass --name when the output will be used to render PNG charts so the company name is printed on the chart title.",
    "  - Output JSON matches the input shape expected by chart-basics.js.",
  ].join("\n");
}

function normalizeMarket(market) {
  if (!market) {
    return null;
  }
  const normalized = String(market).trim().toLowerCase();
  if (normalized === "kospi" || normalized === "ks") {
    return "KS";
  }
  if (normalized === "kosdaq" || normalized === "kq") {
    return "KQ";
  }
  throw new Error(`Unsupported market: ${market}`);
}

function buildCandidateSymbols(ticker, market) {
  const rawTicker = String(ticker).trim();
  if (!rawTicker) {
    throw new Error("Ticker is required.");
  }

  if (rawTicker.includes(".")) {
    return [rawTicker.toUpperCase()];
  }

  // Index symbols (^KS11, ^GSPC) and letter-leading tickers (GOOG, TSLA) are
  // passed through unchanged — the .KS/.KQ retry only applies to bare KRX
  // codes, which always start with a digit (e.g. 066970, 00088K).
  if (rawTicker.startsWith("^") || /^[A-Za-z]/.test(rawTicker)) {
    return [rawTicker.startsWith("^") ? rawTicker : rawTicker.toUpperCase()];
  }

  const normalizedMarket = normalizeMarket(market);
  if (normalizedMarket) {
    const alternate = normalizedMarket === "KS" ? "KQ" : "KS";
    return [`${rawTicker}.${normalizedMarket}`, `${rawTicker}.${alternate}`];
  }

  return [`${rawTicker}.KS`, `${rawTicker}.KQ`];
}

function fetchJson(url, redirectDepth = 0) {
  return new Promise((resolve, reject) => {
    if (redirectDepth > 5) {
      reject(new Error("Too many redirects from Yahoo Finance chart endpoint."));
      return;
    }
    const request = https.get(
      url,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 Codex stock-analysis-skill",
          Accept: "application/json",
        },
      },
      (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          response.resume();
          fetchJson(response.headers.location, redirectDepth + 1).then(resolve).catch(reject);
          return;
        }

        if (response.statusCode !== 200) {
          response.resume();
          reject(new Error(`HTTP ${response.statusCode} from Yahoo Finance chart endpoint.`));
          return;
        }

        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
          } catch (error) {
            reject(new Error(`Failed to parse Yahoo Finance response: ${error.message}`));
          }
        });
      },
    );

    // Unattended weekly runs (kr-portfolio-guard cron) must never hang on a
    // stuck socket — a silent hang is worse than a loud DATA_GAP.
    request.setTimeout(30_000, () => {
      request.destroy(new Error("Timeout after 30s from Yahoo Finance chart endpoint."));
    });

    request.on("error", (error) => {
      reject(error);
    });
  });
}

function formatDateInSeoul(timestampSeconds) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(new Date(timestampSeconds * 1000));
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return `${year}-${month}-${day}`;
}

function parseBars(result) {
  const timestamps = result.timestamp || [];
  const quote = result.indicators?.quote?.[0];
  const adj = result.indicators?.adjclose?.[0]?.adjclose;

  if (!quote) {
    throw new Error("Yahoo Finance response did not include quote data.");
  }

  return timestamps
    .map((timestamp, index) => ({
      date: formatDateInSeoul(timestamp),
      open: quote.open?.[index] ?? null,
      high: quote.high?.[index] ?? null,
      low: quote.low?.[index] ?? null,
      close: quote.close?.[index] ?? null,
      // Dividend/split-adjusted close — scoring paths must use this; raw
      // close stays the trigger-comparison price (memo triggers are quoted raw).
      adjClose: adj?.[index] ?? null,
      volume: quote.volume?.[index] ?? null,
    }))
    .filter((bar) => bar.close !== null && bar.close !== undefined);
}

async function fetchForSymbol(symbol, range, interval) {
  const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`);
  url.searchParams.set("range", range);
  url.searchParams.set("interval", interval);
  url.searchParams.set("includeAdjustedClose", "true");
  url.searchParams.set("events", "div,splits");

  const payload = await fetchJson(url);
  if (payload.chart?.error) {
    throw new Error(payload.chart.error.description || payload.chart.error.code || "Yahoo Finance chart error.");
  }

  const result = payload.chart?.result?.[0];
  if (!result) {
    throw new Error("Yahoo Finance returned no chart result.");
  }

  const bars = parseBars(result);
  if (bars.length === 0) {
    throw new Error("Yahoo Finance returned no usable bars.");
  }

  return {
    symbol,
    bars,
    currency: result.meta?.currency || null,
    exchangeName: result.meta?.exchangeName || null,
  };
}

async function resolveAndFetch(ticker, market, range, interval) {
  const candidates = buildCandidateSymbols(ticker, market);
  let lastError = null;

  for (const candidate of candidates) {
    try {
      return await fetchForSymbol(candidate, range, interval);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Unable to fetch chart data.");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.ticker) {
    console.log(usage());
    process.exit(args.help ? 0 : 1);
  }

  const result = await resolveAndFetch(args.ticker, args.market, args.range, args.interval);
  const output = {
    ticker: result.symbol,
    name: args.name ? String(args.name).trim() : undefined,
    source: "yahoo-finance-chart",
    fetchedAt: new Date().toISOString(),
    range: args.range,
    interval: args.interval,
    currency: result.currency,
    exchangeName: result.exchangeName,
    bars: result.bars,
  };

  const jsonText = JSON.stringify(output, null, 2);

  if (args.output) {
    const absolute = path.resolve(args.output);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, `${jsonText}\n`);
  } else {
    console.log(jsonText);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  });
}

module.exports = { buildCandidateSymbols, parseBars, resolveAndFetch, fetchForSymbol };
