#!/usr/bin/env node

/**
 * portfolio-snapshot.js
 *
 * Fallback script for kr-portfolio-monitor when kiwoom-mcp is not configured.
 * Reads a portfolio JSON file, fetches 30-day OHLCV from Yahoo Finance for
 * each position, computes SMA20 and RSI14, and prints a dated markdown snapshot.
 *
 * Usage:
 *   node portfolio-snapshot.js --input portfolio.json [--output snapshot.md]
 *
 * Input JSON format: see examples/kr/portfolio-sample.json
 */

const fs = require("fs");
const https = require("https");
const path = require("path");

function parseArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--input") {
      result.input = argv[i + 1];
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
    "  node portfolio-snapshot.js --input portfolio.json [--output snapshot.md]",
    "",
    "Input JSON fields per position:",
    "  ticker      Yahoo Finance symbol (e.g. 066970.KQ) or bare KRX code",
    "  name        Korean company name",
    "  quantity    Number of shares held",
    "  avgCost     Average acquisition price per share (KRW)",
    "",
    "Optional fields:",
    "  currentPrice  Override fetched price with a known value",
    "  unrealizedPnl Override computed P&L with a known value",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Yahoo Finance helpers (reuses the pattern from fetch-kr-chart.js)
// ---------------------------------------------------------------------------

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 Codex kr-research-kit",
          Accept: "application/json",
        },
      },
      (response) => {
        if (
          response.statusCode >= 300 &&
          response.statusCode < 400 &&
          response.headers.location
        ) {
          response.resume();
          fetchJson(response.headers.location).then(resolve).catch(reject);
          return;
        }
        if (response.statusCode !== 200) {
          response.resume();
          reject(
            new Error(
              `HTTP ${response.statusCode} fetching ${url}`
            )
          );
          return;
        }
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
          } catch (err) {
            reject(new Error(`JSON parse error: ${err.message}`));
          }
        });
      }
    );
    req.on("error", reject);
  });
}

function formatDateInSeoul(timestampSeconds) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(new Date(timestampSeconds * 1000));
  const y = parts.find((p) => p.type === "year").value;
  const m = parts.find((p) => p.type === "month").value;
  const d = parts.find((p) => p.type === "day").value;
  return `${y}-${m}-${d}`;
}

function buildCandidateSymbols(ticker) {
  const raw = String(ticker).trim();
  if (raw.includes(".")) return [raw.toUpperCase()];
  return [`${raw}.KS`, `${raw}.KQ`];
}

async function fetchBarsForSymbol(symbol, range) {
  const url = new URL(
    `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`
  );
  url.searchParams.set("range", range);
  url.searchParams.set("interval", "1d");
  url.searchParams.set("includeAdjustedClose", "true");

  const payload = await fetchJson(url.toString());
  if (payload.chart?.error) {
    throw new Error(
      payload.chart.error.description ||
        payload.chart.error.code ||
        "Yahoo Finance error"
    );
  }
  const result = payload.chart?.result?.[0];
  if (!result) throw new Error("No chart result from Yahoo Finance.");

  const timestamps = result.timestamp || [];
  const quote = result.indicators?.quote?.[0];
  if (!quote) throw new Error("No quote data in Yahoo Finance response.");

  const bars = timestamps
    .map((ts, i) => ({
      date: formatDateInSeoul(ts),
      open: quote.open?.[i] ?? null,
      high: quote.high?.[i] ?? null,
      low: quote.low?.[i] ?? null,
      close: quote.close?.[i] ?? null,
      volume: quote.volume?.[i] ?? null,
    }))
    .filter((b) => b.close !== null && Number.isFinite(b.close))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (bars.length === 0) throw new Error("No usable bars from Yahoo Finance.");

  return { bars, resolvedSymbol: symbol };
}

async function fetchBarsWithFallback(ticker, range) {
  const candidates = buildCandidateSymbols(ticker);
  let lastErr = null;
  for (const symbol of candidates) {
    try {
      return await fetchBarsForSymbol(symbol, range);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error(`Unable to fetch data for ${ticker}.`);
}

// ---------------------------------------------------------------------------
// Technical indicator helpers
// ---------------------------------------------------------------------------

function computeSMA(closes, period) {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  return slice.reduce((s, v) => s + v, 0) / period;
}

/**
 * Wilder RSI14 using the last `period + 1` or more bars.
 * Returns null if there are fewer than period+1 bars.
 */
function computeRSI(closes, period) {
  if (closes.length < period + 1) return null;

  const relevant = closes.slice(-(period * 3)); // use up to 3× history for warmup
  const diffs = [];
  for (let i = 1; i < relevant.length; i += 1) {
    diffs.push(relevant[i] - relevant[i - 1]);
  }

  let avgGain =
    diffs.slice(0, period).reduce((s, d) => s + Math.max(d, 0), 0) / period;
  let avgLoss =
    diffs.slice(0, period).reduce((s, d) => s + Math.max(-d, 0), 0) / period;

  for (let i = period; i < diffs.length; i += 1) {
    const gain = Math.max(diffs[i], 0);
    const loss = Math.max(-diffs[i], 0);
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function fmtInt(n) {
  if (n === null || n === undefined || !Number.isFinite(n)) return "N/A";
  return new Intl.NumberFormat("ko-KR").format(Math.round(n));
}

function fmtPct(n, decimals) {
  if (n === null || n === undefined || !Number.isFinite(n)) return "N/A";
  const d = decimals !== undefined ? decimals : 1;
  const sign = n >= 0 ? "+" : "−";
  return `${sign}${Math.abs(n).toFixed(d)}%`;
}

function fmtPnl(n) {
  if (n === null || n === undefined || !Number.isFinite(n)) return "N/A";
  const sign = n >= 0 ? "+" : "−";
  return `${sign}${new Intl.NumberFormat("ko-KR").format(Math.abs(Math.round(n)))}`;
}

function statusFlag(rsi, smaDevPct) {
  const flags = [];
  if (Number.isFinite(rsi)) {
    if (rsi > 70) flags.push("⚠️ RSI 과매수");
    else if (rsi < 30) flags.push("⚠️ RSI 과매도");
  }
  if (Number.isFinite(smaDevPct)) {
    if (smaDevPct > 5) flags.push("⚠️ SMA20 +5%↑");
    else if (smaDevPct < -5) flags.push("⚠️ SMA20 −5%↓");
  }
  return flags.length > 0 ? flags.join(" / ") : "정상";
}

// ---------------------------------------------------------------------------
// Snapshot assembly
// ---------------------------------------------------------------------------

function nowKst() {
  const fmt = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return fmt.format(new Date()).replace("T", " ") + " KST";
}

function buildSnapshot(positions, dateStr) {
  const header = `# 포트폴리오 스냅샷 — ${dateStr}\n\n조회 기준: Yahoo Finance (kiwoom-mcp 미연결)\n`;

  const totalPnl = positions.reduce((s, p) => s + (p.unrealizedPnl || 0), 0);
  const totalCost = positions.reduce(
    (s, p) => s + (p.avgCost || 0) * (p.quantity || 0),
    0
  );
  const totalReturnPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : null;

  const summaryLine =
    `총 미실현손익: ${fmtPnl(totalPnl)}원 (${fmtPct(totalReturnPct)}) | 보유 종목 ${positions.length}개\n`;

  const tableHeader =
    "| 티커 | 종목명 | 현재가 | 1일변동 | SMA20 괴리 | RSI14 | 미실현손익 | 수익률 | 상태 |\n" +
    "|---|---|---|---|---|---|---|---|---|\n";

  const sorted = [...positions].sort(
    (a, b) => (b.unrealizedPnl || 0) - (a.unrealizedPnl || 0)
  );

  const tableRows = sorted
    .map((p) => {
      const rsiStr =
        p.rsi14 !== null && Number.isFinite(p.rsi14)
          ? p.rsi14.toFixed(1)
          : "N/A";
      return (
        `| ${p.resolvedTicker || p.ticker} | ${p.name} | ${fmtInt(p.currentPrice)} | ` +
        `${fmtPct(p.dayChangePct)} | ${fmtPct(p.smaDevPct)} | ` +
        `${rsiStr} | ${fmtPnl(p.unrealizedPnl)} | ${fmtPct(p.returnPct)} | ${p.status} |`
      );
    })
    .join("\n");

  const flagged = sorted.filter((p) => p.status !== "정상" && p.status !== "데이터 부족");

  let cautionSection = "";
  if (flagged.length > 0) {
    const items = flagged.map((p) => {
      const detail = p.status.replace(/⚠️ /g, "").replace(/ \/ /g, ", ");
      return `- **${p.name} (${p.resolvedTicker || p.ticker})**: ${detail} — \`/kr-stock-update ${p.resolvedTicker || p.ticker}\` 또는 \`/kr-stock-analysis ${p.resolvedTicker || p.ticker}\` 로 점검 권장`;
    });
    cautionSection = "\n## 주의 포지션\n\n" + items.join("\n") + "\n";
  }

  const nextSection =
    "\n## 다음 단계\n\n" +
    "- 심층 분석: /kr-stock-analysis [티커]\n" +
    "- 기존 메모 업데이트: /kr-stock-update [티커]\n";

  return [
    header,
    summaryLine,
    "\n",
    tableHeader,
    tableRows,
    "\n",
    cautionSection,
    nextSection,
  ].join("");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function processPosition(raw) {
  const ticker = String(raw.ticker || "").trim();
  const name = String(raw.name || ticker);
  const quantity = Number(raw.quantity) || 0;
  const avgCost = Number(raw.avgCost) || 0;

  let bars = [];
  let resolvedTicker = ticker;
  let fetchError = null;

  try {
    const result = await fetchBarsWithFallback(ticker, "1mo");
    bars = result.bars;
    resolvedTicker = result.resolvedSymbol;
  } catch (err) {
    fetchError = err.message;
  }

  const closes = bars.map((b) => b.close);
  const currentPrice =
    raw.currentPrice !== undefined
      ? Number(raw.currentPrice)
      : closes.length > 0
      ? closes[closes.length - 1]
      : null;

  const prevClose = closes.length >= 2 ? closes[closes.length - 2] : null;
  const dayChangePct =
    currentPrice !== null && prevClose !== null
      ? ((currentPrice - prevClose) / prevClose) * 100
      : null;

  const sma20 = computeSMA(closes, 20);
  const smaDevPct =
    sma20 !== null && currentPrice !== null
      ? ((currentPrice - sma20) / sma20) * 100
      : null;

  const rsi14 = computeRSI(closes, 14);

  const unrealizedPnl =
    raw.unrealizedPnl !== undefined
      ? Number(raw.unrealizedPnl)
      : currentPrice !== null && avgCost > 0
      ? (currentPrice - avgCost) * quantity
      : null;

  const returnPct =
    unrealizedPnl !== null && avgCost > 0 && quantity > 0
      ? (unrealizedPnl / (avgCost * quantity)) * 100
      : null;

  const dataOk = closes.length >= 15;
  const status = dataOk ? statusFlag(rsi14, smaDevPct) : "데이터 부족";

  return {
    ticker,
    resolvedTicker,
    name,
    quantity,
    avgCost,
    currentPrice,
    dayChangePct,
    sma20,
    smaDevPct,
    rsi14,
    unrealizedPnl,
    returnPct,
    status,
    fetchError,
    barCount: closes.length,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || !args.input) {
    console.log(usage());
    process.exit(args.help ? 0 : 1);
  }

  const inputPath = path.resolve(args.input);
  if (!fs.existsSync(inputPath)) {
    console.error(`Error: Input file not found: ${inputPath}`);
    process.exit(1);
  }

  let portfolio;
  try {
    portfolio = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  } catch (err) {
    console.error(`Error: Failed to parse input JSON: ${err.message}`);
    process.exit(1);
  }

  if (!Array.isArray(portfolio) || portfolio.length === 0) {
    console.error(
      "Error: Input JSON must be a non-empty array of position objects."
    );
    process.exit(1);
  }

  console.error(
    `Fetching data for ${portfolio.length} position(s) from Yahoo Finance…`
  );

  const results = [];
  for (const raw of portfolio) {
    process.stderr.write(`  ${raw.ticker || "?"} (${raw.name || ""})… `);
    try {
      const pos = await processPosition(raw);
      results.push(pos);
      if (pos.fetchError) {
        process.stderr.write(`ERROR: ${pos.fetchError}\n`);
      } else {
        process.stderr.write(`OK (${pos.barCount} bars)\n`);
      }
    } catch (err) {
      process.stderr.write(`FATAL: ${err.message}\n`);
    }
  }

  const dateStr = nowKst();
  const snapshot = buildSnapshot(results, dateStr);

  if (args.output) {
    const outPath = path.resolve(args.output);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, snapshot);
    console.error(`Snapshot written to: ${outPath}`);
  }

  console.log(snapshot);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`Fatal error: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { computeSMA, computeRSI };
