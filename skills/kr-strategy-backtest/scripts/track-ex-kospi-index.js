#!/usr/bin/env node
'use strict';

/*
 * Continuously track the KOSPI ex-heavyweights index (default: 삼성전자·삼성전자우·SK하이닉스
 * removed) as ACTUAL index points, without running the full ~2,470-ticker 10y pipeline.
 *
 * It fetches only the KOSPI level (^KS11) and the excluded tickers from Yahoo, sources
 * current index weights from Naver's marketValue endpoint (all KOSPI pages summed for the
 * denominator), and reuses the committed reconstructExKospi():
 *
 *   M_ex(t) = K(t) - Σ wᵢ·K(T)·pᵢ(t)/pᵢ(T)
 *
 * On each run it writes a dated JSON + Markdown snapshot and can append the latest reading
 * to an NDJSON log so the level/return can be tracked over time.
 *
 * Weight sourcing precedence: --kospi-total-marketcap override → live Naver → a committed
 * largecap market-cap snapshot (--weights-from-snapshot) when Naver is unreachable.
 *
 * NOTE: this is a current-weight, constant-share approximation (a comparison index, not a
 * tradeable one) and uses the current ordinary-share universe, so it carries survivor bias.
 */

const fs = require('fs');
const path = require('path');
const {
  yahooBars,
  yahooBarsAuto,
  reconstructExKospi,
  fetchNaverKospiCaps,
  metrics,
} = require('./run-kr-trend-following-10y.js');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const DAY = 86400000;
const EXCLUDE_NAMES = { '005930': '삼성전자', '005935': '삼성전자우', '000660': 'SK하이닉스' };
const DEFAULTS = {
  excludeTickers: '005930,005935,000660',
  years: 5,
  snapshot: 'analysis-example/kr-market/strategies/trend-following-10y/largecap-momentum-backtest-2026-07-10.json',
};

function fail(message) { throw new Error(message); }
function ensureDir(dir) { fs.mkdirSync(dir, { recursive: true }); }
function seoulToday() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
function shiftDate(iso, days) { return new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10); }

function parseArgs(argv) {
  const out = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i += 1) {
    const k = argv[i];
    if (k === '--exclude-tickers') out.excludeTickers = argv[++i];
    else if (k === '--years') out.years = Number(argv[++i]);
    else if (k === '--start') out.start = argv[++i];
    else if (k === '--end') out.end = argv[++i];
    else if (k === '--warmup-start') out.warmupStart = argv[++i];
    else if (k === '--kospi-total-marketcap') out.kospiTotalMarketCap = Number(argv[++i]);
    else if (k === '--weights-from-snapshot') out.snapshot = argv[++i];
    else if (k === '--no-naver') out.noNaver = true;
    else if (k === '--output-dir') out.outputDir = argv[++i];
    else if (k === '--log') out.log = argv[++i];
    else if (k === '--help' || k === '-h') out.help = true;
    else fail(`Unknown argument: ${k}`);
  }
  return out;
}

function usage() {
  return [
    'Usage:',
    '  node track-ex-kospi-index.js [options]',
    '',
    'Options:',
    '  --exclude-tickers 005930,005935,000660   Tickers to strip out of the KOSPI level',
    '  --years N                                Lookback window in years (default 5)',
    '  --start / --end / --warmup-start         Explicit dates (override --years)',
    '  --kospi-total-marketcap KRW              Force the weight denominator (skips Naver total)',
    '  --weights-from-snapshot PATH             Fallback market-cap snapshot for weights',
    '  --no-naver                               Skip Naver; use the snapshot for weights',
    '  --output-dir DIR                         Where to write the dated JSON + MD',
    '  --log PATH.ndjson                        Append the latest reading for time-series tracking',
  ].join('\n');
}

// Weights = capᵢ / total KOSPI cap. Live Naver first; committed snapshot as an offline fallback.
async function resolveWeights(options, excludeTickers) {
  if (!options.noNaver) {
    try {
      const capInfo = await fetchNaverKospiCaps(excludeTickers);
      return finalizeWeights(options, excludeTickers, capInfo.caps, capInfo.total, capInfo.source);
    } catch (error) {
      process.stderr.write(`Naver weights unavailable (${error.message}); falling back to snapshot\n`);
    }
  }
  const snapPath = path.isAbsolute(options.snapshot) ? options.snapshot : path.join(ROOT, options.snapshot);
  if (!fs.existsSync(snapPath)) fail(`weight snapshot not found: ${snapPath}`);
  const snap = JSON.parse(fs.readFileSync(snapPath, 'utf8'));
  const top = snap.universe?.top300;
  if (!Array.isArray(top)) fail(`snapshot ${snapPath} has no universe.top300`);
  const kospiTotal = top.filter(x => x.market === 'KOSPI').reduce((s, x) => s + Number(x.marketValueRaw), 0);
  const caps = {};
  for (const ticker of excludeTickers) {
    const entry = top.find(x => x.ticker === ticker);
    if (!entry) fail(`ticker ${ticker} not in snapshot ${snapPath}`);
    caps[ticker] = Number(entry.marketValueRaw);
  }
  return finalizeWeights(options, excludeTickers, caps, kospiTotal, `committed snapshot ${path.relative(ROOT, snapPath)} (KOSPI top300 summed)`);
}

function finalizeWeights(options, excludeTickers, caps, total, source) {
  const denom = Number.isFinite(options.kospiTotalMarketCap) && options.kospiTotalMarketCap > 0 ? options.kospiTotalMarketCap : total;
  if (!(denom > 0)) fail('KOSPI total market cap resolved to zero');
  const weights = {};
  for (const ticker of excludeTickers) weights[ticker] = caps[ticker] / denom;
  return { weights, caps, total: denom, source: Number.isFinite(options.kospiTotalMarketCap) && options.kospiTotalMarketCap > 0 ? `${source} (denominator overridden by --kospi-total-marketcap)` : source };
}

function annualReturns(levels) {
  const groups = new Map();
  for (const p of levels) { const y = p.date.slice(0, 4); if (!groups.has(y)) groups.set(y, []); groups.get(y).push({ date: p.date, equity: p.level }); }
  return Object.fromEntries([...groups].map(([y, eq]) => [y, metrics(eq).totalReturn]));
}

function pct(x) { return Number.isFinite(x) ? `${(x * 100).toFixed(2)}%` : 'N/A'; }
function pts(x) { return Number.isFinite(x) ? Math.round(x).toLocaleString('ko-KR') : 'N/A'; }

function buildMarkdown(artifact) {
  const { window: w, levels: L, summary: S, annual, excluded, weightSource, generatedAt } = artifact;
  const kRows = Object.keys(annual.kospi).map(y => `|${y}|${pct(annual.kospi[y])}|${pct(annual.ex[y])}|`).join('\n');
  const label = excluded.map(t => EXCLUDE_NAMES[t] || t).join('·');
  return [
    `# KOSPI ex-${label} 추적 (실제 지수 포인트)`, '',
    '> 실제 KOSPI 지수(^KS11)에서 제외 종목의 시총 기여분을 차감한 재구성 지수입니다. 현재 가중치·주식수 불변을 가정한 근사이며, 현재 유니버스 기준이라 생존자 편향이 있습니다. 거래 가능한 지수가 아닙니다.', '',
    '## 현재 스냅샷', '', '|항목|값|', '|---|---|',
    `|생성시각|${generatedAt}|`,
    `|기간|${w.start} ~ ${w.end} (${w.sessions} 세션)|`,
    `|KOSPI 실제 지수|${pts(L.kospiStart)}p → **${pts(L.kospiEnd)}p**|`,
    `|반도체 제외 기여분|${pts(L.exStart)}p → **${pts(L.exEnd)}p**|`,
    `|반도체 3종목 기여|${pts(L.semiStart)}p (${pct(L.semiPctStart)}) → **${pts(L.semiEnd)}p (${pct(L.semiPctEnd)})**|`,
    `|가중치 출처|${weightSource}|`, '',
    '## 성과 지표', '', '|지표|KOSPI|제외|', '|---|---:|---:|',
    `|누적 수익률|${pct(S.kospi.totalReturn)}|${pct(S.ex.totalReturn)}|`,
    `|CAGR|${pct(S.kospi.cagr)}|${pct(S.ex.cagr)}|`,
    `|연환산 변동성|${pct(S.kospi.annualizedVolatility)}|${pct(S.ex.annualizedVolatility)}|`,
    `|Sharpe (무위험 0%)|${S.kospi.sharpeZeroRf?.toFixed(2) ?? 'N/A'}|${S.ex.sharpeZeroRf?.toFixed(2) ?? 'N/A'}|`,
    `|최대 낙폭|${pct(S.kospi.maxDrawdown)}|${pct(S.ex.maxDrawdown)}|`, '',
    '## 연도별 수익률', '', '|연도|KOSPI|제외|', '|---|---:|---:|', kRows, '',
  ].join('\n');
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) { console.log(usage()); return; }
  if (!Number.isFinite(options.years) || options.years <= 0) fail('--years must be a positive number');

  const excludeTickers = String(options.excludeTickers).split(',').map(s => s.trim()).filter(Boolean);
  if (!excludeTickers.length) fail('--exclude-tickers resolved to an empty list');

  const end = options.end || seoulToday();
  const start = options.start || shiftDate(end, -Math.round(options.years * 365.25));
  const warmupStart = options.warmupStart || shiftDate(start, -90);

  const { weights, caps, total, source } = await resolveWeights(options, excludeTickers);

  const kospi = await yahooBars('^KS11', warmupStart, end);
  const excludedSeries = [];
  for (const ticker of excludeTickers) {
    const res = await yahooBarsAuto(ticker, warmupStart, end);
    excludedSeries.push({ ticker, bars: res.bars, symbol: res.symbol });
  }

  const calendar = kospi.bars.map(x => x.date).filter(d => d >= start && d <= end);
  if (calendar.length < 2) fail('not enough KOSPI sessions in the requested window');

  const label = excludeTickers.map(t => EXCLUDE_NAMES[t] || t).join('·');
  const ex = reconstructExKospi(calendar, kospi, excludedSeries, weights, { name: `KOSPI ex-${label}`, source, total, caps });

  // real index points come straight from reconstructExKospi().indexLevels
  const series = ex.indexLevels.map(p => ({ date: p.date, kospi: +p.kospi.toFixed(2), ex: +p.level.toFixed(2) }));
  const first = series[0], last = series.at(-1);
  const kospiEquity = series.map(p => ({ date: p.date, equity: p.kospi }));
  const exEquity = series.map(p => ({ date: p.date, equity: p.ex }));

  const levels = {
    kospiStart: first.kospi, kospiEnd: last.kospi,
    exStart: first.ex, exEnd: last.ex,
    semiStart: first.kospi - first.ex, semiEnd: last.kospi - last.ex,
    semiPctStart: (first.kospi - first.ex) / first.kospi,
    semiPctEnd: (last.kospi - last.ex) / last.kospi,
  };

  const artifact = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    excluded: excludeTickers,
    window: { start: calendar[0], end: calendar.at(-1), sessions: calendar.length },
    weights, marketCaps: caps, totalKospiMarketCap: total, weightSource: source,
    levels,
    summary: { kospi: metrics(kospiEquity), ex: metrics(exEquity) },
    annual: { kospi: annualReturns(series.map(p => ({ date: p.date, level: p.kospi }))), ex: annualReturns(series.map(p => ({ date: p.date, level: p.ex }))) },
    series,
  };

  const outputDir = options.outputDir ? (path.isAbsolute(options.outputDir) ? options.outputDir : path.join(ROOT, options.outputDir))
    : path.join(ROOT, 'analysis-example', 'kr-market', 'strategies', 'ex-kospi-index');
  ensureDir(outputDir);
  const jsonPath = path.join(outputDir, `ex-kospi-index-${artifact.window.end}.json`);
  const mdPath = path.join(outputDir, `ex-kospi-index-${artifact.window.end}.md`);
  fs.writeFileSync(jsonPath, `${JSON.stringify(artifact, null, 2)}\n`);
  fs.writeFileSync(mdPath, buildMarkdown(artifact));

  if (options.log) {
    const logPath = path.isAbsolute(options.log) ? options.log : path.join(ROOT, options.log);
    ensureDir(path.dirname(logPath));
    const reading = {
      date: artifact.window.end, generatedAt: artifact.generatedAt, excluded: excludeTickers,
      kospiLevel: last.kospi, exLevel: last.ex,
      semiContribPts: levels.semiEnd, semiContribPct: levels.semiPctEnd,
      exTotalReturn: artifact.summary.ex.totalReturn, kospiTotalReturn: artifact.summary.kospi.totalReturn,
      weightSource: source,
    };
    fs.appendFileSync(logPath, `${JSON.stringify(reading)}\n`);
  }

  console.log(JSON.stringify({
    json: jsonPath, markdown: mdPath, log: options.log || null,
    window: artifact.window, weightSource: source,
    levels, summary: artifact.summary,
  }, null, 2));
}

if (require.main === module) {
  main().catch(error => { console.error(`ex-KOSPI tracker failed: ${error.stack || error.message}`); process.exit(1); });
}

module.exports = { resolveWeights, annualReturns, buildMarkdown };
