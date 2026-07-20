#!/usr/bin/env node

// kr-market-sentiment: 한국 시장 투심 바닥 지표 수집기
//
// KOSPI(주지표)·KOSDAQ(보조지표)·원/달러 환율을 Yahoo Finance에서 받아 기술적
// 지표(52주 낙폭, 200일선 이격도, RSI14, 20/60일선)를 계산하고, 수동 입력 JSON
// (PBR·Fwd PER·VKOSPI·외국인 수급·신용잔고·ADR·예탁금)을 병합해 단일
// indicators.json으로 산출한다. 채점(score-sentiment-bottom.js)의 입력이 된다.
//
// - Node stdlib only (fs, https, path, Intl).
// - 네트워크 실패는 crash 대신 DATA_GAP 지표로 기록해 수동 데이터만으로도 채점 가능.

const fs = require("fs");
const https = require("https");
const path = require("path");

const KOSPI_SYMBOL = "^KS11";
const KOSDAQ_SYMBOL = "^KQ11";
const USDKRW_SYMBOL = "KRW=X";

// 수동 입력 지표의 허용 id → 카테고리/라벨 매핑. score 스크립트의 임계값 키와 1:1.
const MANUAL_INDICATOR_META = {
  kospi_pbr: { category: "밸류에이션", label: "KOSPI 후행 PBR", unit: "배" },
  kospi_fwd_per: { category: "밸류에이션", label: "KOSPI 12M 선행 PER", unit: "배" },
  vkospi: { category: "변동성/공포", label: "VKOSPI (변동성지수)", unit: "pt" },
  foreign_flow: { category: "수급", label: "외국인 매매 추세", unit: "" },
  credit_trend: { category: "수급", label: "신용융자 잔고 추세", unit: "" },
  deposits_trend: { category: "수급", label: "투자자예탁금 추세", unit: "" },
  adr20: { category: "시장 폭", label: "ADR 등락비율(20일)", unit: "%" },
};

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith("--")) throw new Error(`Unexpected argument: ${key}`);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) args[key.slice(2)] = true;
    else { args[key.slice(2)] = next; i += 1; }
  }
  return args;
}

function usage() {
  return [
    "Usage:",
    "  node fetch-market-indicators.js [--manual manual-indicators.json] [--output indicators.json]",
    "  node fetch-market-indicators.js --fixture tests/fixtures/yahoo-fixture.json --manual ... --output ...",
    "",
    "Notes:",
    "  - KOSPI(^KS11) 주지표, KOSDAQ(^KQ11) 보조지표, 원/달러(KRW=X)를 Yahoo에서 받습니다.",
    "  - --manual 로 PBR·Fwd PER·VKOSPI·외국인 수급·신용잔고·ADR·예탁금을 병합합니다.",
    "  - 네트워크 실패 시 해당 지표는 DATA_GAP 으로 기록되고 나머지로 채점을 계속합니다.",
    "  - --fixture 는 오프라인 테스트용 Yahoo 응답 묶음(JSON)입니다.",
  ].join("\n");
}

function todayKst() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function formatDateInSeoul(timestampSeconds) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(timestampSeconds * 1000));
}

function writeJsonAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(temporary, filePath);
}

function round(value, digits = 2) {
  if (value == null || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function fetchJson(url, redirectDepth = 0) {
  return new Promise((resolve, reject) => {
    if (redirectDepth > 5) {
      reject(new Error("Too many redirects from Yahoo Finance chart endpoint."));
      return;
    }
    const request = https.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 kr-research-kit market-sentiment",
        Accept: "application/json",
      },
    }, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        fetchJson(new URL(response.headers.location, url).toString(), redirectDepth + 1).then(resolve).catch(reject);
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
    });
    request.setTimeout(30_000, () => {
      request.destroy(new Error("Timeout after 30s from Yahoo Finance chart endpoint."));
    });
    request.on("error", reject);
  });
}

function parseBars(result) {
  const timestamps = result.timestamp || [];
  const quote = result.indicators?.quote?.[0];
  if (!quote) throw new Error("Yahoo Finance response did not include quote data.");
  return timestamps
    .map((timestamp, index) => ({
      date: formatDateInSeoul(timestamp),
      close: quote.close?.[index] ?? null,
    }))
    .filter((bar) => bar.close !== null && bar.close !== undefined && Number.isFinite(bar.close));
}

async function fetchSymbolBars(symbol, { range = "1y", interval = "1d", fixtureMap = null } = {}) {
  let payload;
  if (fixtureMap) {
    if (!fixtureMap[symbol]) throw new Error(`Fixture missing symbol ${symbol}`);
    payload = fixtureMap[symbol];
  } else {
    const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`);
    url.searchParams.set("range", range);
    url.searchParams.set("interval", interval);
    payload = await fetchJson(url);
  }
  if (payload.chart?.error) {
    throw new Error(payload.chart.error.description || payload.chart.error.code || "Yahoo Finance chart error.");
  }
  const result = payload.chart?.result?.[0];
  if (!result) throw new Error("Yahoo Finance returned no chart result.");
  const bars = parseBars(result);
  if (bars.length === 0) throw new Error("Yahoo Finance returned no usable bars.");
  return bars;
}

// ---- Technical math (stdlib only) --------------------------------------

function sma(closes, period) {
  if (closes.length < period) return null;
  const slice = closes.slice(closes.length - period);
  return slice.reduce((sum, value) => sum + value, 0) / period;
}

// Wilder-smoothed RSI over `period` closes.
function rsi(closes, period = 14) {
  if (closes.length < period + 1) return null;
  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= period; i += 1) {
    const change = closes[i] - closes[i - 1];
    if (change >= 0) gainSum += change; else lossSum -= change;
  }
  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;
  for (let i = period + 1; i < closes.length; i += 1) {
    const change = closes[i] - closes[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

// 지수 바 배열에서 기술적 지표를 계산한다.
function computeIndexTechnicals(bars) {
  const closes = bars.map((bar) => bar.close);
  const lastClose = closes[closes.length - 1];
  const asOfDate = bars[bars.length - 1].date;
  // 52주 = 최근 252 거래일(또는 가용 전체) 창.
  const window = closes.slice(Math.max(0, closes.length - 252));
  const high52w = Math.max(...window);
  const low52w = Math.min(...window);
  const sma200 = sma(closes, 200);
  const sma60 = sma(closes, 60);
  const sma20 = sma(closes, 20);
  return {
    asOfDate,
    lastClose: round(lastClose, 2),
    high52w: round(high52w, 2),
    low52w: round(low52w, 2),
    drawdownFrom52wHigh: high52w ? round((lastClose / high52w - 1) * 100, 2) : null,
    reboundFrom52wLow: low52w ? round((lastClose / low52w - 1) * 100, 2) : null,
    sma20: round(sma20, 2),
    sma60: round(sma60, 2),
    sma200: round(sma200, 2),
    distanceFromSma200: sma200 ? round((lastClose / sma200 - 1) * 100, 2) : null,
    rsi14: round(rsi(closes, 14), 1),
    barsUsed: bars.length,
  };
}

// ---- Manual indicators --------------------------------------------------

function readManual(filePath) {
  const resolved = path.resolve(filePath);
  const parsed = JSON.parse(fs.readFileSync(resolved, "utf8"));
  const bag = parsed.indicators && typeof parsed.indicators === "object" ? parsed.indicators : parsed;
  const out = {};
  for (const [id, meta] of Object.entries(MANUAL_INDICATOR_META)) {
    const entry = bag[id];
    if (entry == null) continue;
    const value = entry && typeof entry === "object" ? entry.value : entry;
    if (value == null || value === "") continue;
    out[id] = {
      id,
      category: meta.category,
      label: meta.label,
      unit: meta.unit,
      value,
      asOfDate: (entry && entry.asOfDate) || parsed.asOfDate || null,
      source: (entry && entry.source) || null,
      detail: (entry && entry.detail) || null,
      origin: "manual",
    };
  }
  return { indicators: out, asOfDate: parsed.asOfDate || null };
}

// ---- Assembly -----------------------------------------------------------

async function buildIndicators(options = {}) {
  const asOfDate = options.date || todayKst();
  const warnings = [];
  const markets = {};
  const auto = [];

  const symbolPlan = [
    { key: "kospi", symbol: KOSPI_SYMBOL, label: "KOSPI", role: "primary" },
    { key: "kosdaq", symbol: KOSDAQ_SYMBOL, label: "KOSDAQ", role: "secondary" },
    { key: "usdkrw", symbol: USDKRW_SYMBOL, label: "원/달러 환율", role: "context" },
  ];

  for (const plan of symbolPlan) {
    try {
      const bars = await fetchSymbolBars(plan.symbol, { fixtureMap: options.fixtureMap });
      const tech = computeIndexTechnicals(bars);
      markets[plan.key] = { symbol: plan.symbol, label: plan.label, role: plan.role, origin: "auto", ...tech };
    } catch (error) {
      markets[plan.key] = { symbol: plan.symbol, label: plan.label, role: plan.role, origin: "auto", status: "DATA_GAP", error: error.message };
      warnings.push(`${plan.label}(${plan.symbol}) 데이터 수집 실패: ${error.message}`);
    }
  }

  // 자동 지표(채점 대상)로 승격: KOSPI 낙폭/RSI/200일선, KOSDAQ 낙폭/RSI, 환율.
  const pushAuto = (id, category, label, value, unit, sourceMarket) => {
    if (value == null) return;
    auto.push({ id, category, label, value, unit, asOfDate: sourceMarket.asOfDate, source: `Yahoo Finance ${sourceMarket.symbol}`, origin: "auto" });
  };
  if (markets.kospi && !markets.kospi.status) {
    pushAuto("kospi_drawdown", "지수 기술적", "KOSPI 52주 고점 대비 낙폭", markets.kospi.drawdownFrom52wHigh, "%", markets.kospi);
    pushAuto("kospi_rsi14", "지수 기술적", "KOSPI RSI14", markets.kospi.rsi14, "", markets.kospi);
    pushAuto("kospi_vs_sma200", "지수 기술적", "KOSPI 200일선 이격도", markets.kospi.distanceFromSma200, "%", markets.kospi);
  }
  if (markets.kosdaq && !markets.kosdaq.status) {
    pushAuto("kosdaq_drawdown", "지수 기술적", "KOSDAQ 52주 고점 대비 낙폭", markets.kosdaq.drawdownFrom52wHigh, "%", markets.kosdaq);
    pushAuto("kosdaq_rsi14", "지수 기술적", "KOSDAQ RSI14", markets.kosdaq.rsi14, "", markets.kosdaq);
  }
  if (markets.usdkrw && !markets.usdkrw.status) {
    pushAuto("usdkrw_level", "매크로 배경", "원/달러 환율 수준", markets.usdkrw.lastClose, "원", markets.usdkrw);
  }

  let manual = { indicators: {}, asOfDate: null };
  if (options.manual) {
    try {
      manual = readManual(options.manual);
    } catch (error) {
      warnings.push(`수동 지표 파일 로드 실패: ${error.message}`);
    }
  }
  const manualList = Object.values(manual.indicators);
  if (!manualList.length) {
    warnings.push("수동 지표(PBR·VKOSPI·외국인 수급·신용잔고 등)가 없어 밸류에이션·수급 신호가 비어 있습니다. --manual 파일을 채우면 판단 신뢰도가 크게 올라갑니다.");
  }

  const indicators = [...auto, ...manualList];

  return {
    schemaVersion: 1,
    reportType: "kr-market-sentiment-indicators",
    asOfDate,
    generatedAt: new Date().toISOString(),
    primaryMarket: "KOSPI",
    markets,
    indicators,
    coverage: {
      autoCount: auto.length,
      manualCount: manualList.length,
      totalCount: indicators.length,
    },
    warnings,
  };
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help || args.h) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  let fixtureMap = null;
  if (args.fixture) {
    fixtureMap = JSON.parse(fs.readFileSync(path.resolve(args.fixture), "utf8"));
  }
  const date = args.date || todayKst();
  const result = await buildIndicators({ date, manual: args.manual, fixtureMap });
  const outPath = path.resolve(args.output || `analysis-example/kr-market/sentiment-indicators-${date}.json`);
  writeJsonAtomic(outPath, result);
  process.stdout.write(`${JSON.stringify({ jsonPath: outPath, asOfDate: result.asOfDate, coverage: result.coverage, warnings: result.warnings }, null, 2)}\n`);
}

if (require.main === module) {
  main().catch((error) => { console.error(`Error: ${error.message}`); process.exit(1); });
}

module.exports = {
  MANUAL_INDICATOR_META,
  buildIndicators,
  computeIndexTechnicals,
  readManual,
  rsi,
  sma,
  todayKst,
};
