#!/usr/bin/env node
'use strict';

// Converts the preserved cache-backed Top-500 simulation into a clearly
// labelled free-data proxy report. It must never be used for WRDS/PIT claims.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const arg = name => { const i = process.argv.indexOf(name); return i < 0 ? null : process.argv[i + 1]; };
const die = message => { throw new Error(message); };
const sha = input => crypto.createHash('sha256').update(input).digest('hex');
const mean = xs => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = xs => xs.length < 2 ? null : Math.sqrt(xs.reduce((a, b) => a + (b - mean(xs)) ** 2, 0) / (xs.length - 1));
const pct = x => x == null || !Number.isFinite(x) ? 'N/A' : `${(x * 100).toFixed(2)}%`;
const money = x => Math.round(x || 0).toLocaleString('en-US');

function bars(file) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8')).chart.result?.[0];
  if (!data?.timestamp) die(`Invalid Yahoo cache: ${file}`);
  const quote = data.indicators.quote[0], adjusted = data.indicators.adjclose[0].adjclose;
  return data.timestamp.map((timestamp, i) => ({ date: new Date(timestamp * 1000).toISOString().slice(0, 10), close: adjusted[i] }))
    .filter(row => row.close > 0);
}
function metric(points) {
  if (points.length < 2) return null;
  const returns = points.slice(1).map((x, i) => x.equity / points[i].equity - 1), years = Math.max((Date.parse(points.at(-1).date) - Date.parse(points[0].date)) / 31557600000, 1 / 252);
  let peak = -Infinity, mdd = 0; for (const point of points) { peak = Math.max(peak, point.equity); mdd = Math.min(mdd, point.equity / peak - 1); }
  const volatility = sd(returns);
  return { startEquity: points[0].equity, endEquity: points.at(-1).equity, totalReturn: points.at(-1).equity / points[0].equity - 1,
    cagr: (points.at(-1).equity / points[0].equity) ** (1 / years) - 1, annualizedVolatility: volatility && volatility * Math.sqrt(252),
    sharpeZeroRf: volatility ? mean(returns) / volatility * Math.sqrt(252) : null, maxDrawdown: mdd, sessions: points.length };
}
function annual(points) {
  const byYear = new Map(); for (const point of points) { const year = point.date.slice(0, 4); if (!byYear.has(year)) byYear.set(year, { start: point.equity, end: point.equity }); else byYear.get(year).end = point.equity; }
  return [...byYear].map(([year, value]) => ({ year, return: value.end / value.start - 1 }));
}
function report(cadence, source, benchmark, provenance) {
  const equity = source.equity.map(row => ({ date: row.date, equity: row.equity })), benchmarkByDate = new Map(benchmark.map(row => [row.date, row.close]));
  let base = null; const spyEquity = equity.map(row => { const close = benchmarkByDate.get(row.date); if (!close) return null; if (!base) base = close; return { date: row.date, equity: 1000000 * close / base }; }).filter(Boolean);
  const oosStart = '2024-07-17', oos = equity.filter(row => row.date >= oosStart), spyOos = spyEquity.filter(row => row.date >= oosStart);
  return { schemaVersion: 1, generatedAt: new Date().toISOString(), mode: 'free-current-listing-proxy', cadence, sourcePeriod: { start: equity[0].date, end: equity.at(-1).date }, outOfSampleStart: oosStart,
    provenance, strategyRules: { minerviniTemplate: true, rsWeights: { threeMonth: .4, sixMonth: .3, twelveMonth: .3 }, fundamentals: 'SEC companyfacts filing-date proxy; revenue and diluted EPS YoY', holdings: 10, regime: 'SPY 200-day SMA ±3% hysteresis', volatilityTarget: '.18 annualized / 60 sessions', execution: 'next adjusted open', oneWayCostBps: 10 },
    universe: { source: 'current free screener snapshot', requestedTopN: 500, usableSymbols: source.usable, warning: 'Survivorship-biased current-membership universe. It is not CRSP/Compustat point-in-time and has no reliable delisting coverage.' },
    fullPeriod: { strategy: metric(equity), spy: metric(spyEquity) }, outOfSample: { strategy: metric(oos), spy: metric(spyOos) }, annualReturns: annual(equity), dailyEquity: equity, spyDailyEquity: spyEquity,
    trades: source.trades, sourceWarnings: ['The original cache does not retain per-rebalance holdings, so a monthly top-10 ledger cannot be reconstructed.', 'Yahoo adjusted prices are a total-return proxy; SEC companyfacts may be revised after the original filing date.', 'No CRSP DLRET or historical point-in-time market-cap universe is present.'], sourceSummary: source.summary };
}
function markdown(result, filename) {
  const row = (strategy, spy) => `|CAGR|${pct(strategy?.cagr)}|${pct(spy?.cagr)}|\n|연환산 변동성|${pct(strategy?.annualizedVolatility)}|${pct(spy?.annualizedVolatility)}|\n|Sharpe (무위험 0%)|${strategy?.sharpeZeroRf?.toFixed(2) ?? 'N/A'}|${spy?.sharpeZeroRf?.toFixed(2) ?? 'N/A'}|\n|최대 낙폭|${pct(strategy?.maxDrawdown)}|${pct(spy?.maxDrawdown)}|\n|누적 수익률|${pct(strategy?.totalReturn)}|${pct(spy?.totalReturn)}|`;
  const years = result.annualReturns.map(x => `|${x.year}|${pct(x.return)}|`).join('\n');
  const trades = result.trades.slice(0, 10).map(x => `|${x.date}|${x.side}|${x.ticker}|${money(x.notional)}|${money(x.cost)}|`).join('\n');
  return `# 미국 상위 500 Minervini·실적·레짐 — 무료 프록시 (${result.cadence === 'weekly' ? '주간' : '월간'})\n\n> **중요: WRDS point-in-time 검증이 아닙니다.** 2026-07-17에 확보한 현재 상장 무료 스크리너 상위 500을 과거 전체 기간에 적용한 생존자 편향 시뮬레이션입니다. 상장폐지 수익률, 당시의 시총 상위 500, 확정적인 공시 이용 시점은 검증하지 못합니다. 투자 권유가 아닙니다.\n\n## 규칙\n\n- Minervini Trend Template, 3/6/12개월 RS 40/30/30, SEC companyfacts의 매출·희석 EPS 개선 프록시를 50:50으로 합산해 상위 10개를 동일비중 보유했다.\n- SPY 전일 종가의 200일선 ±3% 히스테리시스와 60일 변동성 목표 연 18%, 다음 수정 시가 체결 및 편도 10bp 비용을 적용했다.\n- 사용 가능 종목: 현재 무료 스크리너 상위 500 중 ${result.universe.usableSymbols}개. 기간은 ${result.sourcePeriod.start}~${result.sourcePeriod.end}; OOS는 ${result.outOfSampleStart} 이후다.\n\n## 성과와 SPY 비교\n\n|지표|전략|SPY (Yahoo 수정주가)|\n|---|---:|---:|\n${row(result.fullPeriod.strategy, result.fullPeriod.spy)}\n|거래 수|${result.trades.length}|—|\n\n## OOS (${result.outOfSampleStart} 이후)\n\n|지표|전략|SPY|\n|---|---:|---:|\n${row(result.outOfSample.strategy, result.outOfSample.spy)}\n\n## 연도별 전략 성과\n\n|연도|수익률|\n|---|---:|\n${years}\n\n## 거래 표본\n\n|체결일|방향|종목|거래대금|비용|\n|---|---|---|---:|---:|\n${trades}\n\n## 데이터 한계\n\n- 현재 상장 종목만 사용하는 생존자 편향이 있으므로 성과를 실제 과거 상위 500 성과로 해석하면 안 된다.\n- 원 캐시는 리밸런싱별 보유 상위 10 원장을 보존하지 않아 월별 후보 목록은 재구성하지 않았다.\n- 상장폐지 수익률(DLRET), 당시 발행주식수/시총, CRSP-Compustat 식별자 이력은 포함하지 않는다. 이 항목은 WRDS 모드에서만 검증된다.\n- 상세 원장은 [${filename}](${filename})에 보존했다.\n`;
}
function main() {
  const sourceDir = arg('--source-dir'), cacheDir = arg('--cache-dir'), outDir = arg('--out-dir');
  if (!sourceDir || !cacheDir || !outDir) die('Usage: --source-dir existing-free-results --cache-dir cached-top500 --out-dir output-dir');
  const spyFile = path.join(cacheDir, 'yahoo', 'SPY.json'); if (!fs.existsSync(spyFile)) die(`Missing cached SPY file: ${spyFile}`);
  const screener = '/private/tmp/us-screener.json', provenance = { sourceDir, cacheDir, cacheAsOf: '2026-07-17', spySha256: sha(fs.readFileSync(spyFile)), screenerSha256: fs.existsSync(screener) ? sha(fs.readFileSync(screener)) : null };
  fs.mkdirSync(outDir, { recursive: true });
  for (const cadence of ['weekly', 'monthly']) {
    const input = path.join(sourceDir, `${cadence}-backtest-2026-07-15.json`); if (!fs.existsSync(input)) die(`Missing cached ${cadence} source result: ${input}`);
    const result = report(cadence, JSON.parse(fs.readFileSync(input, 'utf8')), bars(spyFile), { ...provenance, sourceResultSha256: sha(fs.readFileSync(input)) });
    const basename = `${cadence}-free-proxy-backtest-${result.sourcePeriod.end}`, json = path.join(outDir, `${basename}.json`), md = path.join(outDir, `${basename}.md`);
    fs.writeFileSync(json, JSON.stringify(result, null, 2)); fs.writeFileSync(md, markdown(result, path.basename(json))); console.log(JSON.stringify({ cadence, json, md, fullPeriod: result.fullPeriod, outOfSample: result.outOfSample }));
  }
}
if (require.main === module) main();
