#!/usr/bin/env node
'use strict';

// Strict, official-source implementation of the repository's Korean default
// strategy.  It is intentionally a separate output family so no Yahoo or raw
// KRX diagnostic artifact can be mistaken for a verified total-return result.

const fs = require('fs');
const path = require('path');
const A = require('./lib/annual-top300-universe.js');
const O = require('./lib/official-total-return.js');
const L = require('./lib/factor-backtest-core.js');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const INITIAL = 100000000, COST = .0025, SELL_TAX = .0018, TOP_N = 10, CADENCE = 5;
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const write = (file, x) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(x, null, 2) + '\n'); };
const arg = (name, fallback = null) => { const i = process.argv.indexOf(name); return i < 0 ? fallback : process.argv[i + 1]; };
const mean = xs => xs.reduce((s, x) => s + x, 0) / xs.length;
const stdev = xs => { const m = mean(xs); return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, xs.length - 1)); };
const pct = x => `${(x * 100).toFixed(2)}%`;

function stats(equity) {
  if (equity.length < 2) return { startEquity: INITIAL, endEquity: INITIAL, totalReturn: 0, cagr: 0, annualizedVolatility: 0, sharpeZeroRf: 0, maxDrawdown: 0, sessions: equity.length };
  const rs = equity.slice(1).map((x, i) => x.equity / equity[i].equity - 1), avg = mean(rs), sd = stdev(rs), years = (Date.parse(equity.at(-1).date) - Date.parse(equity[0].date)) / 86400000 / 365.25;
  let peak = INITIAL, mdd = 0; for (const x of equity) { peak = Math.max(peak, x.equity); mdd = Math.min(mdd, x.equity / peak - 1); }
  return { startEquity: INITIAL, endEquity: equity.at(-1).equity, totalReturn: equity.at(-1).equity / INITIAL - 1, cagr: (equity.at(-1).equity / INITIAL) ** (1 / years) - 1, annualizedVolatility: sd * Math.sqrt(252), sharpeZeroRf: sd ? avg / sd * Math.sqrt(252) : 0, maxDrawdown: mdd, sessions: equity.length };
}
function annualReturns(equity) { const out = {}; for (const row of equity) out[row.date.slice(0, 4)] = row.equity; let prior = INITIAL; for (const y of Object.keys(out)) { const e = out[y]; out[y] = e / prior - 1; prior = e; } return out; }

function loadOfficialStates(cacheDir) {
  const manifestFile = path.join(cacheDir, 'official-total-return-manifest.json');
  const manifest = read(manifestFile);
  if (manifest.schemaVersion !== 1 || manifest.priceMode !== 'official-total-return' || manifest.verificationStatus !== 'verified') throw new Error('price cache is not a verified official-total-return manifest');
  const bySecurity = new Map(), byTicker = new Map();
  for (const entry of manifest.securities || []) {
    const value = read(path.join(cacheDir, entry.file));
    if (value.priceMode !== 'official-total-return' || value.eventVerificationStatus !== 'verified-complete' || !Array.isArray(value.rawOHLC) || !Array.isArray(value.totalReturnOHLC) || !Array.isArray(value.adjustmentFactor)) throw new Error(`${entry.securityId}: incomplete official total-return price contract`);
    const state = { ...value, bars: value.totalReturnOHLC };
    if (bySecurity.has(state.securityId) || byTicker.has(state.ticker)) throw new Error(`duplicate security/ticker in official cache: ${state.securityId}/${state.ticker}`);
    bySecurity.set(state.securityId, state); byTicker.set(state.ticker, state);
  }
  return { manifest, bySecurity, byTicker };
}
function buildUniverseStates(universe, byTicker) {
  const coverage = A.coverageLedger(universe, ticker => { const s = byTicker.get(ticker); return Boolean(s && s.bars.length >= 273); });
  A.assertPriceCoverage(coverage);
  const states = new Map();
  for (const ticker of A.universeUnion(universe)) { const s = byTicker.get(ticker); if (s) states.set(s.securityId, s); }
  return { states, coverage };
}
function exact(state, date, field) { const i = L.lastIndex(state.bars, date); return i >= 0 && state.bars[i].date === date ? state.bars[i][field] : null; }
function close(state, date) { const i = L.lastIndex(state.bars, date); return i >= 0 ? state.bars[i].close : null; }

function annualBenchmark(universe, byTicker, calendar) {
  let equity = INITIAL, active = null, bases = new Map(); const rows = [];
  for (const date of calendar) {
    const year = A.rankingYearForSignal(date);
    if (year !== active) {
      active = year; bases = new Map();
      for (const ticker of A.eligibleTickers(universe, date)) { const s = byTicker.get(ticker), p = s && close(s, date); if (p) bases.set(ticker, p); }
      // Initial purchase / annual sell-and-rebuy are charged with the same
      // implementation costs as the strategy.
      equity *= rows.length ? (1 - COST - SELL_TAX) * (1 - COST) : (1 - COST);
    }
    const levels = [...bases].map(([ticker, base]) => close(byTicker.get(ticker), date) / base).filter(Number.isFinite);
    const level = levels.length ? mean(levels) : 1, prev = rows.at(-1);
    if (prev && prev.rankingYear === year) equity *= level / prev.level; else if (!prev) equity *= level;
    rows.push({ date, equity, level, constituents: levels.length, rankingYear: year });
  }
  return { name: '연도별 동일가중 총수익(연말 교체 비용 포함)', summary: stats(rows), annualReturns: annualReturns(rows), dailyEquity: rows };
}

function runStrategy({ universe, allStates, byTicker, calendar, kospi, series, events }) {
  const selections = new Map(), ledger = [];
  for (let i = 0; i < calendar.length - 1; i++) {
    const signalDate = calendar[i], executionDate = calendar[i + 1], annualRoll = executionDate.slice(0, 4) !== signalDate.slice(0, 4);
    if (!annualRoll && i % CADENCE !== 0) continue;
    const snapshot = A.snapshotForSignal(universe, executionDate), rows = []; let noPrice = 0, noDart = 0;
    const fundamentalAsOf = calendar[Math.max(0, i - 1)];
    for (const ticker of A.eligibleTickers(universe, executionDate)) {
      const state = byTicker.get(ticker), barIndex = state ? L.lastIndex(state.bars, signalDate) : -1;
      if (!state || barIndex < 252 || state.bars[barIndex].date !== signalDate) { noPrice++; continue; }
      const fundamental = L.fundamentalAt(series.get(ticker) || [], fundamentalAsOf);
      if (!fundamental) { noDart++; continue; }
      rows.push({ ticker, securityId: state.securityId, name: state.name, fundamental, rs: .4 * (state.bars[barIndex].close / state.bars[barIndex - 63].close - 1) + .3 * (state.bars[barIndex].close / state.bars[barIndex - 126].close - 1) + .3 * (state.bars[barIndex].close / state.bars[barIndex - 252].close - 1) });
    }
    L.percentile(rows, 'rs'); L.attachFundamentalComposite(rows); for (const row of rows) row.score = row.fundamentalScore === null ? null : .5 * row.rsPct + .5 * row.fundamentalScore;
    const holdings = rows.filter(x => x.score !== null).sort((a, b) => b.score - a.score || b.rs - a.rs).slice(0, TOP_N);
    const order = { signalDate, executionDate, rankingYear: snapshot.rankingYear, asOfDate: snapshot.asOfDate, universeCount: snapshot.commonShareCount, priceAvailable: snapshot.constituents.length - noPrice, dartAvailable: rows.length, excluded: { noPrice, noDart }, forcedAnnualRoll: annualRoll, holdings: holdings.map(x => ({ ticker: x.ticker, securityId: x.securityId, name: x.name, score: x.score, rs: x.rs, reportFilingDate: x.fundamental.report.filing })) };
    selections.set(executionDate, order); ledger.push(order);
  }
  const positions = new Map(), trades = [], equity = [], eventLedger = []; let cash = INITIAL, turnover = 0, exposure = 1, regime = true;
  const value = (date, field) => { let result = cash; for (const [id, shares] of positions) { const state = allStates.get(id); if (!state) throw new Error(`${date}: no official successor price state for held ${id}`); const price = field === 'close' ? close(state, date) : exact(state, date, field); if (price === null) throw new Error(`${date}: missing official ${field} for held ${id}`); result += shares * price; } return result; };
  function rebalance(date, order, desiredExposure, reason) {
    const desired = order ? order.holdings.map(x => x.securityId) : [...positions.keys()], before = value(date, 'open');
    if (order?.forcedAnnualRoll) for (const [id, shares] of [...positions]) { const p = exact(allStates.get(id), date, 'open'); const notional = shares * p, fee = notional * (COST + SELL_TAX); cash += notional - fee; turnover += notional / Math.max(before, 1); positions.delete(id); trades.push({ date, ticker: allStates.get(id).ticker, securityId: id, side: 'SELL', notional, estimatedCost: fee, reason: 'annual-universe-liquidation', forcedAnnualRoll: true }); }
    const all = new Set([...positions.keys(), ...desired]), names = desired.filter(id => exact(allStates.get(id), date, 'open') !== null);
    let lo = 0, hi = Math.max(before, 0);
    for (let n = 0; n < 35; n++) { const invest = (lo + hi) / 2; let after = cash; for (const id of all) { const p = exact(allStates.get(id), date, 'open'); if (p === null) continue; const target = names.includes(id) ? desiredExposure * invest / names.length / p : 0, delta = target - (positions.get(id) || 0); after -= delta * p + Math.abs(delta) * p * (delta > 0 ? COST : COST + SELL_TAX); } if (after >= 0) lo = invest; else hi = invest; }
    for (const id of all) { const p = exact(allStates.get(id), date, 'open'); if (p === null) continue; const target = names.includes(id) ? desiredExposure * lo / names.length / p : 0, delta = target - (positions.get(id) || 0); if (Math.abs(delta) < 1e-8) continue; const notional = Math.abs(delta) * p, fee = notional * (delta > 0 ? COST : COST + SELL_TAX); cash -= delta * p + fee; turnover += notional / Math.max(before, 1); if (target) positions.set(id, target); else positions.delete(id); trades.push({ date, signalDate: order?.signalDate || null, ticker: allStates.get(id).ticker, securityId: id, side: delta > 0 ? 'BUY' : 'SELL', notional, estimatedCost: fee, reason, forcedAnnualRoll: Boolean(order?.forcedAnnualRoll) }); }
  }
  for (let i = 0; i < calendar.length; i++) {
    const date = calendar[i], eventResult = O.applyEventsToPortfolio({ positions, cash, events, date }); cash = eventResult.cash; if (eventResult.applied.length) eventLedger.push({ date, eventIds: eventResult.applied, cashAfter: cash });
    const previous = calendar[i - 1]; const ki = previous ? L.lastIndex(kospi.bars, previous) : -1;
    if (ki >= 199 && kospi.bars[ki].date === previous) { const ma = mean(kospi.bars.slice(ki - 199, ki + 1).map(x => x.close)); if (kospi.bars[ki].close > ma * 1.03) regime = true; else if (kospi.bars[ki].close < ma * .97) regime = false; }
    const recent = equity.slice(-60).map((x, j, a) => j ? x.equity / a[j - 1].equity - 1 : null).filter(x => x !== null); const volScale = recent.length >= 59 ? Math.min(1, .18 / (stdev(recent) * Math.sqrt(252))) : 1; const nextExposure = regime ? volScale : 0, order = selections.get(date);
    if (order) rebalance(date, order, nextExposure, order.forcedAnnualRoll ? 'annual-universe-roll' : 'five-session-rank'); else if (Math.abs(nextExposure - exposure) > 1e-10) rebalance(date, null, nextExposure, 'regime-or-vol-overlay'); exposure = nextExposure;
    equity.push({ date, equity: value(date, 'close'), cash, holdings: positions.size, exposure });
  }
  return { summary: { ...stats(equity), tradeCount: trades.length, turnover }, annualReturns: annualReturns(equity), dailyEquity: equity, trades, rebalancingLedger: ledger, appliedCorporateActions: eventLedger, benchmark: annualBenchmark(universe, byTicker, calendar) };
}

function universeDiff(a, b) { const rows = []; for (const snapshot of a.snapshots) { const peer = b.byYear.get(snapshot.rankingYear); if (!peer) continue; const left = new Set(snapshot.constituents.map(x => x.ticker)), right = new Set(peer.constituents.map(x => x.ticker)), common = [...left].filter(x => right.has(x)); rows.push({ rankingYear: snapshot.rankingYear, primaryCount: left.size, top300Count: right.size, overlap: common.length, primaryOnly: [...left].filter(x => !right.has(x)), top300Only: [...right].filter(x => !left.has(x)) }); } return rows; }

function main() {
  if (arg('--price-mode') !== 'official-total-return') throw new Error('official runner requires --price-mode official-total-return');
  if (!process.argv.includes('--strict-events')) throw new Error('official-total-return runs require --strict-events');
  const label = arg('--universe', 'annual-cap300b');
  if (label !== 'annual-cap300b') throw new Error('--universe must be annual-cap300b for this runner');
  const universeFile = arg('--universe-file', path.join(ROOT, 'analysis-example/kr-market/strategies/annual-cap300b/universe-ledger-yearend-cap300b-2015-2025.json'));
  const cacheDir = arg('--price-cache'), eventFile = arg('--event-ledger'), calendarId = arg('--calendar-security-id', 'KOSPI_INDEX'), outDir = arg('--out-dir', path.join(ROOT, 'analysis-example/kr-market/strategies/official-total-return'));
  if (!cacheDir || !eventFile) throw new Error('--price-cache and --event-ledger are required; no result was written');
  const { manifest, bySecurity, byTicker } = loadOfficialStates(cacheDir), universe = A.loadAnnualUniverse(universeFile), { states, coverage } = buildUniverseStates(universe, byTicker);
  const ledger = read(eventFile); O.validateLedger(ledger, [...states.keys()]);
  const kospi = bySecurity.get(calendarId); if (!kospi || kospi.bars.length < 200) throw new Error(`official calendar/regime security ${calendarId} with >=200 sessions is required`);
  const start = arg('--start-date', '2016-01-01'), end = arg('--end-date', kospi.bars.at(-1).date), calendar = kospi.bars.map(x => x.date).filter(d => d >= start && d <= end);
  if (calendar.length < 253) throw new Error('official calendar has insufficient sessions');
  const { series, manifestHash } = L.loadSeriesByTicker();
  const primary = runStrategy({ universe, allStates: bySecurity, byTicker, calendar, kospi, series, events: ledger.events });
  const compareFile = arg('--compare-universe-file'); let comparison = null;
  if (compareFile) { const top300 = A.loadAnnualUniverse(compareFile), comparable = buildUniverseStates(top300, byTicker), result = runStrategy({ universe: top300, allStates: bySecurity, byTicker, calendar, kospi, series, events: ledger.events }); comparison = { top300UniverseFile: compareFile, universeComposition: universeDiff(universe, top300), top300Coverage: comparable.coverage, top300Strategy: result.summary, top300Benchmark: result.benchmark.summary, primaryVsTop300: { cagrDifference: primary.summary.cagr - result.summary.cagr, sharpeDifference: primary.summary.sharpeZeroRf - result.summary.sharpeZeroRf, mddDifference: primary.summary.maxDrawdown - result.summary.maxDrawdown } }; }
  const artifact = { schemaVersion: 1, generatedAt: new Date().toISOString(), methodology: 'official-total-return-minervini-rs-eps-revenue-regime', period: { start: calendar[0], end: calendar.at(-1) }, rules: { universe: 'prior year-end KOSPI/KOSDAQ common shares market cap >= KRW 300bn; applies only in next calendar year', selection: 'RS 3/6/12 months 40/30/30 50% + DART EPS/revenue 50%, top 10', dartFilingLagSessions: 1, execution: 'signal close -> next session open', cadenceSessions: 5, overlay: 'KOSPI SMA200 +/-3% regime and 60-session 18% volatility target', costs: { buyBps: 25, sellBps: 43, sellTaxBps: 18 } }, data: { priceMode: 'official-total-return', strictEvents: true, cacheManifest: manifest, eventLedger: { file: path.resolve(eventFile), sha256: O.sha256(ledger), verified: true }, dartPanelManifestSha256: manifestHash }, universe: { file: universeFile, coverage, rule: 'ranking year t snapshot is used only in t+1' }, strategy: primary, comparison, limitations: ['All output prices are reconstructed from archived official KRX raw OHLC and a dual-sourced KRX/DART event ledger. A strict run fails instead of estimating a missing relevant event.', 'Not modeled: market impact, limit-up/down fills, trading halts beyond explicit price availability, brokerage-specific fees, and tax circumstances. Historical simulation only; not an investment recommendation.'] };
  const stem = `annual-cap300b-minervini-official-total-return-${calendar[0]}-through-${calendar.at(-1)}`; write(path.join(outDir, `${stem}.json`), artifact);
  const c = comparison?.top300Strategy;
  const md = `# 한국 3,000억원 유니버스 — 공식 총수익 검증\n\n- 기간: ${calendar[0]}~${calendar.at(-1)}; 전년말 3,000억원 이상 보통주를 다음 해 첫 거래일부터 적용\n- 가격: 공식 KRX 원시 OHLC + KRX·DART 교차검증 기업행사 원장으로 재구성한 세전 배당 재투자 총수익\n- 신호/체결: RS 3·6·12개월(40/30/30) + DART EPS·매출, 공시 후 1거래일 지연 → 다음 거래일 시가; 5거래일 리밸런싱\n- 비용: 매수 25bp / 매도 25bp + 증권거래세 0.18%; 매년 첫 거래일 전량 청산·재선정\n\n|구분|누적 수익률|CAGR|Sharpe|MDD|회전율|\n|---|---:|---:|---:|---:|---:|\n|3,000억원 Minervini·실적·레짐|${pct(primary.summary.totalReturn)}|${pct(primary.summary.cagr)}|${primary.summary.sharpeZeroRf.toFixed(2)}|${pct(primary.summary.maxDrawdown)}|${primary.summary.turnover.toFixed(2)}|\n|3,000억원 동일가중 총수익 벤치마크|${pct(primary.benchmark.summary.totalReturn)}|${pct(primary.benchmark.summary.cagr)}|${primary.benchmark.summary.sharpeZeroRf.toFixed(2)}|${pct(primary.benchmark.summary.maxDrawdown)}|—|\n${c ? `|연도별 Top 300 동일 규칙|${pct(c.totalReturn)}|${pct(c.cagr)}|${c.sharpeZeroRf.toFixed(2)}|${pct(c.maxDrawdown)}|${c.turnover.toFixed(2)}|\n` : ''}\n## 데이터 게이트\n\n|랭킹연도|기준일|보통주|가격 가능|가격 커버리지|\n|---:|---|---:|---:|---:|\n${coverage.map(x => `|${x.rankingYear}|${x.asOfDate}|${x.commonShareCount}|${x.priceAvailable}|${pct(x.priceCoverage)}|`).join('\n')}\n\n- JSON 원장은 신호별 기준연도·제외 사유·선정 종목·연초 강제 교체·현금 및 적용 기업행사를 보존한다.\n- 미검증 기업행사, 상장폐지 대가 누락, 또는 가격 커버리지 90% 미만이면 이 보고서는 작성되지 않는다.\n`;
  fs.writeFileSync(path.join(outDir, `${stem}.md`), md); console.log(JSON.stringify({ json: path.join(outDir, `${stem}.json`), markdown: path.join(outDir, `${stem}.md`), summary: primary.summary }, null, 2));
}
if (require.main === module) main();
module.exports = { main, loadOfficialStates, buildUniverseStates, runStrategy };
