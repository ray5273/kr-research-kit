#!/usr/bin/env node
'use strict';

// Validation-only implementation for the annual universe methodology.  The
// repository's representative Korean strategy is RS + EPS/revenue + regime;
// this price-only run audits membership, annual rolls and benchmark plumbing
// and must not be presented as the main strategy or model portfolio.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const A = require('./lib/annual-top300-universe.js');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const START = '2016-07-11', END = '2026-07-10', INITIAL = 100000000;
const COST = 0.0025, SELL_TAX = 0.0018, LOOKBACK = 252, TOP_N = 20;
const defaults = {
  universe: path.join(ROOT, 'analysis-example/kr-market/strategies/annual-top300/universe-ledger.json'),
  cache: path.join(ROOT, '.tmp/kr-strategy-backtest/2026-07-10'),
  baseline: path.join(ROOT, 'analysis-example/kr-market/strategies/trend-following-10y/largecap-momentum-backtest-2026-07-10.json'),
  out: path.join(ROOT, 'analysis-example/kr-market/strategies/annual-top300'),
};
function arg(name, fallback) { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : fallback; }
function read(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function write(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n'); }
function sha(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function lastIndex(bars, date) { let lo = 0, hi = bars.length - 1, out = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (bars[m].date <= date) { out = m; lo = m + 1; } else hi = m - 1; } return out; }
function exact(state, date, field) { if (!state) return null; const i = lastIndex(state.bars, date); return i >= 0 && state.bars[i].date === date && Number.isFinite(state.bars[i][field]) ? state.bars[i][field] : null; }
function close(state, date) { if (!state) return null; const i = lastIndex(state.bars, date); return i >= 0 ? state.bars[i].close : null; }
function quality(bars) { return bars.length >= LOOKBACK + 21 && !bars.some((b, i) => i && (b.close / bars[i - 1].close < 0.6 || b.close / bars[i - 1].close > 1.4)); }
function stats(equity, initialEquity = INITIAL) { if (equity.length < 2) return {}; const rs = equity.slice(1).map((x, i) => x.equity / equity[i].equity - 1); const mean = rs.reduce((s, x) => s + x, 0) / rs.length; const variance = rs.reduce((s, x) => s + (x - mean) ** 2, 0) / Math.max(1, rs.length - 1); let peak = initialEquity, mdd = 0; for (const x of equity) { peak = Math.max(peak, x.equity); mdd = Math.min(mdd, x.equity / peak - 1); } const years = (Date.parse(equity.at(-1).date) - Date.parse(equity[0].date)) / 86400000 / 365.25; return { startEquity: initialEquity, endEquity: equity.at(-1).equity, totalReturn: equity.at(-1).equity / initialEquity - 1, cagr: (equity.at(-1).equity / initialEquity) ** (1 / years) - 1, annualizedVolatility: Math.sqrt(variance * 252), sharpeZeroRf: variance ? mean / Math.sqrt(variance) * Math.sqrt(252) : 0, maxDrawdown: mdd, sessions: equity.length }; }
function annual(equity) { const out = {}; for (const row of equity) out[row.date.slice(0, 4)] = row.equity; const years = {}; let previous = null; for (const [year, value] of Object.entries(out)) { years[year] = previous ? value / previous - 1 : null; previous = value; } return years; }
function monthEnds(calendar) { return calendar.filter((d, i) => !calendar[i + 1] || calendar[i + 1].slice(0, 7) !== d.slice(0, 7)); }

function main() {
  const universeFile = arg('--universe-file', defaults.universe), cacheDir = arg('--cache-dir', defaults.cache), outDir = arg('--out-dir', defaults.out), baselineFile = arg('--baseline', defaults.baseline);
  const startDate = arg('--start-date', START), endDate = arg('--end-date', END);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || startDate >= endDate) throw new Error('--start-date and --end-date must be YYYY-MM-DD with start < end');
  const allowUnvalidatedPrice = process.argv.includes('--allow-unvalidated-price');
  const universeSpec = read(universeFile), capFloor = Number(universeSpec.marketCapThreshold), thresholdUniverse = Number.isFinite(capFloor) && capFloor > 0;
  const universeLabel = thresholdUniverse ? `연도말 시가총액 ${(capFloor / 1e8).toLocaleString('ko-KR')}억원 이상` : '연도별 Top 300';
  const filePrefix = thresholdUniverse ? `annual-cap${Math.round(capFloor / 1e8)}m` : 'annual-top300';
  const universe = A.loadAnnualUniverse(universeFile), union = A.universeUnion(universe), states = new Map();
  for (const ticker of union) { const file = path.join(cacheDir, 'normalized', `${ticker}.json`); if (!fs.existsSync(file)) continue; const cached = read(file); if (cached.bars.length >= LOOKBACK + 21 && (allowUnvalidatedPrice || quality(cached.bars))) states.set(ticker, { ticker, bars: cached.bars, rawSha256: cached.rawSha256 || '' }); }
  const coverage = A.coverageLedger(universe, ticker => states.has(ticker));
  if (!allowUnvalidatedPrice) A.assertPriceCoverage(coverage);
  const indexFile = path.join(cacheDir, 'normalized/_KS11.json');
  if (!fs.existsSync(indexFile)) throw new Error(`missing KOSPI calendar cache: ${indexFile}; run prepare-annual-top300-price-cache.js --include-kospi-index`);
  const fullCalendar = read(indexFile).bars.map(row => row.date).filter(date => date <= endDate);
  const calendar = fullCalendar.filter(d => d >= startDate);
  const orders = new Map(), ledger = [];
  for (const signalDate of monthEnds(fullCalendar)) {
    const executionDate = fullCalendar[fullCalendar.indexOf(signalDate) + 1]; if (!executionDate || executionDate < startDate) continue;
    // Membership is a trading constraint, therefore it is keyed to the
    // execution session.  A December close executed on the first January
    // session must use the just-completed year's snapshot, not the one that
    // governed the outgoing year.
    const snapshot = A.snapshotForSignal(universe, executionDate), eligible = new Set(snapshot.constituents.map(x => x.ticker));
    const rows = [];
    for (const ticker of eligible) { const state = states.get(ticker); if (!state) continue; const i = lastIndex(state.bars, signalDate); if (i < LOOKBACK || state.bars[i].date !== signalDate) continue; const r252 = state.bars[i].close / state.bars[i - LOOKBACK].close - 1; const r42 = state.bars[i].close / state.bars[i - 42].close - 1; const r63 = state.bars[i].close / state.bars[i - 63].close - 1; const r84 = state.bars[i].close / state.bars[i - 84].close - 1; if (r42 > 0 && r63 > 0 && r84 > 0) rows.push({ ticker, score: r252 }); }
    const selected = rows.sort((a, b) => b.score - a.score).slice(0, TOP_N).map(x => x.ticker);
    const forceAnnualUniverseRoll = executionDate.slice(0, 4) !== signalDate.slice(0, 4);
    orders.set(executionDate, { signalDate, executionDate, rankingYear: snapshot.rankingYear, asOfDate: snapshot.asOfDate, rawTop300Count: snapshot.rawTop300Count, commonShareCount: snapshot.commonShareCount, priceAvailable: coverage.find(x => x.rankingYear === snapshot.rankingYear).priceAvailable, dartAvailable: null, excluded: { noPrice: snapshot.commonShareCount - coverage.find(x => x.rankingYear === snapshot.rankingYear).priceAvailable, noSignalHistory: snapshot.commonShareCount - rows.length }, selected, forceAnnualUniverseRoll });
  }
  const positions = new Map(), trades = [], equity = []; let cash = INITIAL, turnover = 0;
  const value = (date, field) => { let result = cash; for (const [ticker, shares] of positions) { const p = field === 'close' ? close(states.get(ticker), date) : exact(states.get(ticker), date, field); if (p !== null) result += shares * p; } return result; };
  for (const date of calendar) {
    const order = orders.get(date);
    if (order) {
      const names = order.selected.filter(t => exact(states.get(t), date, 'open') !== null), before = value(date, 'open'), all = new Set([...positions.keys(), ...names]);
      let lo = 0, hi = before;
      for (let i = 0; i < 35; i++) { const investment = (lo + hi) / 2; let after = cash; for (const ticker of all) { const price = exact(states.get(ticker), date, 'open'); if (price === null) continue; const target = names.includes(ticker) ? investment / names.length / price : 0; const delta = target - (positions.get(ticker) || 0); after -= delta * price + Math.abs(delta) * price * (delta > 0 ? COST : COST + SELL_TAX); } if (after >= 0) lo = investment; else hi = investment; }
      for (const ticker of all) { const price = exact(states.get(ticker), date, 'open'); if (price === null) continue; const target = names.includes(ticker) ? lo / names.length / price : 0, old = positions.get(ticker) || 0, delta = target - old; if (Math.abs(delta) < 1e-8) continue; const notional = Math.abs(delta) * price, estimatedCost = notional * (delta > 0 ? COST : COST + SELL_TAX); cash -= delta * price + estimatedCost; turnover += notional / Math.max(before, 1); if (target) positions.set(ticker, target); else positions.delete(ticker); trades.push({ date, signalDate: order.signalDate, ticker, side: delta > 0 ? 'BUY' : 'SELL', notional, estimatedCost, forceAnnualUniverseRoll: order.forceAnnualUniverseRoll }); }
      ledger.push({ ...order, priceAvailable: names.length, selected: names });
    }
    equity.push({ date, equity: value(date, 'close'), cash, holdings: positions.size });
  }
  // Annual-reconstituted equal-weight total-return benchmark.  It reweights
  // only when the prior-year universe becomes active, using adjusted closes.
  const benchmark = []; let benchEquity = INITIAL, activeYear = null, bases = new Map();
  for (const date of calendar) { const rankingYear = A.rankingYearForSignal(date); if (rankingYear !== activeYear) { activeYear = rankingYear; bases = new Map(); for (const ticker of A.eligibleTickers(universe, date)) { const p = close(states.get(ticker), date); if (p) bases.set(ticker, p); } } const returns = [...bases].map(([ticker, basePrice]) => close(states.get(ticker), date) / basePrice).filter(Number.isFinite); if (returns.length) { const level = returns.reduce((s, x) => s + x, 0) / returns.length; const prior = benchmark.at(-1); benchEquity = prior && date.slice(0, 4) === prior.date.slice(0, 4) ? prior.equity * level / prior.level : benchEquity * level; benchmark.push({ date, equity: benchEquity, level, constituents: returns.length, rankingYear: activeYear }); } }
  const strategySummary = { ...stats(equity), tradeCount: trades.length, turnover }, benchmarkSummary = stats(benchmark);
  const baseline = fs.existsSync(baselineFile) ? read(baselineFile) : null;
  const artifact = { schemaVersion: 1, generatedAt: new Date().toISOString(), methodology: thresholdUniverse ? 'annual-market-cap-threshold' : 'annual-top300', parameters: { startDate, endDate, lookbackDays: LOOKBACK, topN: TOP_N, execution: 'month-end close signal -> next session open', costs: { buyBps: COST * 10000, sellBps: (COST + SELL_TAX) * 10000, sellTaxBps: SELL_TAX * 10000 }, allowUnvalidatedPrice }, universe: { label: universeLabel, marketCapThreshold: thresholdUniverse ? capFloor : null, file: universeFile, sourceSha256: universe.sourceSha256, unionCount: union.size, coverage, rule: 'signal year y uses ranking snapshot y-1' }, strategy: { name: `${universeLabel} 12M + 2/3/4M positive momentum`, summary: strategySummary, annualReturns: annual(equity), dailyEquity: equity, trades, rebalancingLedger: ledger }, benchmarkTotalReturn: { name: `${universeLabel} 동일가중 총수익`, summary: benchmarkSummary, annualReturns: annual(benchmark), dailyEquity: benchmark }, comparisonWithCurrentUniverseBaseline: baseline ? { baselineFile, baselineMethodology: 'latest-universe survivorship-biased baseline', baselineSummary: baseline.strategy?.summary || null, annualTop300Summary: strategySummary } : null, limitations: ['Annual membership reduces current-constituent survivorship bias but does not restore delisted final returns, trading halts, or historic liquidity.', ...(allowUnvalidatedPrice ? ['INVALID RESEARCH RUN: raw KRX prices with unresolved corporate actions were allowed solely for a preliminary diagnostic; do not use its returns or CAGR for decisions.'] : []), 'DART is not required for this price-only strategy; fundamental variants must record per-signal DART availability and exclude only missing candidates.'] };
  const stem = `${filePrefix}-momentum-${startDate}-through-${endDate}`;
  const json = path.join(outDir, `${stem}.json`); write(json, artifact);
  const pct = x => `${(x * 100).toFixed(2)}%`, baseCagr = artifact.comparisonWithCurrentUniverseBaseline?.baselineSummary?.cagr;
  const markdown = `# 연도별 Top 300 재구성 모멘텀 백테스트\n\n> 전년 마지막 거래일의 KOSPI·KOSDAQ 보통주 Top 300을 다음 해에만 적용한 시뮬레이션입니다. 최신 유니버스를 과거에 적용한 기존 결과와 분리해 보존합니다.\n\n- 기간: ${startDate}~${endDate}; 신호: 252거래일 모멘텀 + 2·3·4개월 양수; 상위 ${TOP_N}개 동일비중\n- 체결: 월말 종가 신호 → 다음 거래일 시가. 연도 경계의 다음 시가는 이전 보유를 청산하고 새 유니버스에서 재선정하는 강제 교체일입니다.\n- 비용: 매수 25bp / 매도 25bp + 증권거래세 0.18%\n\n|구분|누적 수익률|CAGR|Sharpe|MDD|\n|---|---:|---:|---:|---:|\n|연도별 Top 300 전략|${pct(strategySummary.totalReturn)}|${pct(strategySummary.cagr)}|${strategySummary.sharpeZeroRf.toFixed(2)}|${pct(strategySummary.maxDrawdown)}|\n|연도별 동일가중 총수익 벤치마크|${pct(benchmarkSummary.totalReturn)}|${pct(benchmarkSummary.cagr)}|${benchmarkSummary.sharpeZeroRf.toFixed(2)}|${pct(benchmarkSummary.maxDrawdown)}|\n${baseCagr === undefined ? '' : `|기존 최신 유니버스 기준선|—|${pct(baseCagr)}|—|—|`}\n\n## 유니버스 커버리지\n\n|랭킹연도|기준일|원시 Top 300|보통주|가격 가능|가격 커버리지|\n|---:|---|---:|---:|---:|---:|\n${coverage.map(x => `|${x.rankingYear}|${x.asOfDate}|${x.rawTop300Count}|${x.commonShareCount}|${x.priceAvailable}|${pct(x.priceCoverage)}|`).join('\\n')}\n\n- JSON 원장은 각 리밸런싱의 rankingYear·기준일·제외 수·선정 종목·연초 강제교체 여부를 보존한다.\n- 연도별 편입은 생존자 편향을 줄이지만, 상장폐지 최종수익률·거래정지·과거 유동성 결측 때문에 완전한 무편향 결과는 아니다.\n`;
  fs.writeFileSync(path.join(outDir, `${stem}.md`), markdown);
  console.log(JSON.stringify({ json, strategy: strategySummary, benchmark: benchmarkSummary, coverage }, null, 2));
}
if (require.main === module) main();
