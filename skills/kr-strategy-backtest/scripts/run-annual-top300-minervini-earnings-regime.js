#!/usr/bin/env node
'use strict';

// Annual Top-300 version of the repository's weekly main strategy:
// Minervini-style 3/6/12M RS + point-in-time EPS/revenue + KOSPI SMA200 regime.
// R1 (adopted 2026-07-18): the 60-session volatility target is OFF by default
// (regime-only) — it was a return drag with no drawdown benefit; restore it with
// --vol-target 0.18.  Membership is determined by execution year so the first
// January trade forcibly moves into the new snapshot.

const fs = require('fs');
const path = require('path');
const L = require('./lib/factor-backtest-core.js');
const A = require('./lib/annual-top300-universe.js');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const START = '2016-07-11', DEFAULT_END = '2026-07-10', N = 10, CADENCE = 5, COST = 0.0025, SELL_TAX = 0.0018, INITIAL = 100000000;
const defaults = { universe: path.join(ROOT, 'analysis-example/kr-market/strategies/annual-top300/universe-ledger-2016-2025-partial.json'), out: path.join(ROOT, 'analysis-example/kr-market/strategies/annual-top300') };
const read = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const write = (f, x) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(x, null, 2) + '\n'); };
const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const mean = xs => xs.reduce((s, x) => s + x, 0) / xs.length;
const stddev = xs => { const m = mean(xs); return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, xs.length - 1)); };
function metrics(eq) { const r = eq.slice(1).map((x, i) => x.equity / eq[i].equity - 1), m = mean(r), v = stddev(r), years = (Date.parse(eq.at(-1).date) - Date.parse(eq[0].date)) / 86400000 / 365.25; let peak = INITIAL, mdd = 0; for (const x of eq) { peak = Math.max(peak, x.equity); mdd = Math.min(mdd, x.equity / peak - 1); } return { startEquity: INITIAL, endEquity: eq.at(-1).equity, totalReturn: eq.at(-1).equity / INITIAL - 1, cagr: (eq.at(-1).equity / INITIAL) ** (1 / years) - 1, annualizedVolatility: v * Math.sqrt(252), sharpeZeroRf: v ? m / v * Math.sqrt(252) : 0, maxDrawdown: mdd, calmar: mdd ? ((eq.at(-1).equity / INITIAL) ** (1 / years) - 1) / Math.abs(mdd) : 0, sessions: eq.length }; }
function parseKospi(cacheDir) { const normalized = path.join(cacheDir, 'normalized/_KS11.json'); if (fs.existsSync(normalized)) return read(normalized).bars.map(x => ({ date: x.date, close: x.close })); const x = read(path.join(cacheDir, 'raw/_KS11.json')).chart.result[0], q = x.indicators.quote[0], fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }); return x.timestamp.map((t, i) => { if (!Number.isFinite(q.close[i])) return null; const p = fmt.formatToParts(new Date(t * 1000)), get = k => p.find(x => x.type === k).value; return { date: `${get('year')}-${get('month')}-${get('day')}`, close: q.close[i] }; }).filter(Boolean); }
function annualReturns(eq, startDate) { const out = {}; for (const y of [...new Set(eq.map(x => x.date.slice(0, 4)))]) { const a = eq.filter(x => x.date.startsWith(y)); out[y] = a.length ? a.at(-1).equity / (y === startDate.slice(0, 4) ? INITIAL : eq.filter(x => x.date < `${y}-01-01`).at(-1).equity) - 1 : null; } return out; }

function main() {
  const universeFile = arg('--universe-file', defaults.universe), outDir = arg('--out-dir', defaults.out);
  const cacheDir = arg('--cache-dir', L.DATA), panelDir = arg('--dart-panel-dir', L.PANEL);
  const universeSpec = read(universeFile), universeTopN = Number(universeSpec.topN), universeCapFloor = Number(universeSpec.marketCapThreshold);
  const defaultUniverseLabel = Number.isInteger(universeTopN) && universeTopN > 0 ? `연도별 Top ${universeTopN}` : (Number.isFinite(universeCapFloor) && universeCapFloor > 0 ? `연도별 시가총액 ${(universeCapFloor / 1e8).toLocaleString('ko-KR')}억원 이상` : '연도별 Top 300');
  const universeLabel = arg('--universe-label', defaultUniverseLabel);
  const startDate = arg('--start-date', START), endDate = arg('--end-date', DEFAULT_END);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || startDate >= endDate) throw new Error('--start-date and --end-date must be YYYY-MM-DD with start < end');
  const costBps = Number(arg('--buy-cost-bps', String(COST * 1e4))), sellTaxBps = Number(arg('--sell-tax-bps', String(SELL_TAX * 1e4)));
  if (!Number.isFinite(costBps) || costBps < 0 || !Number.isFinite(sellTaxBps) || sellTaxBps < 0) throw new Error('--buy-cost-bps and --sell-tax-bps must be non-negative numbers');
  const buyCost = costBps / 1e4, sellTax = sellTaxBps / 1e4;
  const allowUnvalidatedPrice = process.argv.includes('--allow-unvalidated-price');
  const yahooAdjusted = requestedPriceMode === 'yahoo-adjusted';
  const allowUndercoverage = process.argv.includes('--allow-undercoverage');
  // Compliance exclusions apply before percentile scoring.  This makes the
  // replacement an actual next-ranked candidate rather than a post-hoc drop.
  const excludedTickers = new Set((arg('--exclude-tickers', '') || '').split(',').map(x => x.trim()).filter(Boolean));
  const terminalCashoutLastClose = process.argv.includes('--terminal-cashout-last-close');
  const terminalCashoutGraceSessions = Number(arg('--terminal-cashout-grace-sessions', '5'));
  if (!Number.isInteger(terminalCashoutGraceSessions) || terminalCashoutGraceSessions < 1) throw new Error('--terminal-cashout-grace-sessions must be a positive integer');
  // R1 (adopted 2026-07-18): the 60-session volatility target is removed by
  // default (regime-only), because ablation showed it is a pure return drag
  // (~-3pp CAGR) with no MDD benefit and overfit parameters. Restore the old
  // behavior with --vol-target 0.18 for reproducing pre-R1 artifacts.
  const volTarget = Number(arg('--vol-target', '0')), volWindow = Number(arg('--vol-window', '60'));
  if (!Number.isFinite(volTarget) || volTarget < 0 || !Number.isInteger(volWindow) || volWindow < 2) throw new Error('--vol-target must be >=0 (0 disables) and --vol-window an integer >=2');
  const overlayLabel = volTarget > 0 ? `KOSPI SMA200 ±3% regime + ${volWindow}-session ${(volTarget * 100).toFixed(0)}% volatility target` : 'KOSPI SMA200 ±3% regime only (R1: volatility target removed)';
  const overlayLabelKo = volTarget > 0 ? `KOSPI SMA200 ±3% 레짐 + ${volWindow}일 목표 변동성 ${(volTarget * 100).toFixed(0)}%` : 'KOSPI SMA200 ±3% 레짐 단독 (R1: 변동성 타깃 제거)';
  // Selection tilt: default is the RS+EPS 50/50 blend; --eps-weight 1 makes it a
  // pure earnings-growth tilt (higher backtested return but NOT DSR-robust -- a
  // calculated bet). --holdings sets the concentration.
  const epsWeight = Number(arg('--eps-weight', '0.5')), holdingsN = Number(arg('--holdings', String(N)));
  if (!Number.isFinite(epsWeight) || epsWeight < 0 || epsWeight > 1 || !Number.isInteger(holdingsN) || holdingsN < 1) throw new Error('--eps-weight must be 0..1 and --holdings a positive integer');
  // Momentum formulation for the RS sleeve. 'high52w' (proximity to 52-week high,
  // George-Hwang 2004 / Minervini) is the only selection factor that cleared the
  // Deflated Sharpe hurdle on the honest cache; the default 'blend' (3/6/12) is weak.
  const momentumType = arg('--momentum-type', 'blend');
  if (!['blend', 'r12_1', 'riskadj', 'high52w'].includes(momentumType)) throw new Error('--momentum-type must be blend|r12_1|riskadj|high52w');
  const momLabelKo = { blend: '3/6/12개월 RS(40/30/30)', r12_1: '12-1 모멘텀', riskadj: '위험조정 모멘텀', high52w: '52주 신고가 근접 모멘텀' }[momentumType];
  const rsPctW = Math.round((1 - epsWeight) * 100), epsPctW = Math.round(epsWeight * 100);
  const selectionLabelKo = epsWeight >= 1 ? '순수 DART EPS·매출 개선(실적 틸트)' : epsWeight <= 0 ? `${momLabelKo} 모멘텀` : `${momLabelKo} ${rsPctW}% + DART EPS·매출 개선 ${epsPctW}%`;
  const selectionLabelEn = `${momLabelKo} ${rsPctW}% + point-in-time EPS/revenue ${epsPctW}% percentile, top ${holdingsN}`;
  // Rebalancing band + soft annual roll: keep an incumbent until its fresh rank
  // falls past --hold-buffer-rank, and (if --soft-annual-roll) do not force-
  // liquidate survivors at the year boundary. Cuts turnover/cost and, on the
  // honest cache, improves CAGR/MDD by letting the earnings-improvers run.
  const holdBufferRank = Number(arg('--hold-buffer-rank', String(holdingsN))), softAnnualRoll = process.argv.includes('--soft-annual-roll');
  if (!Number.isInteger(holdBufferRank) || holdBufferRank < holdingsN) throw new Error('--hold-buffer-rank must be an integer >= --holdings');
  const cadence = Number(arg('--cadence', String(CADENCE)));
  if (!Number.isInteger(cadence) || cadence < 1) throw new Error('--cadence must be a positive integer (sessions between rebalances)');
  const { annualUniverse, states, coverageLedger } = L.loadAnnualPriceStates(universeFile, null, allowUnvalidatedPrice, allowUndercoverage, cacheDir);
  const { series, manifestHash } = L.loadSeriesByTicker(panelDir);
  const kospi = parseKospi(cacheDir), allCalendar = kospi.map(x => x.date).filter(d => d <= endDate), calendar = allCalendar.filter(d => d >= startDate);
  const selectionLog = [], orders = new Map();
  function select(signalDate, executionDate, forcedAnnualRoll) {
    const active = L.statesForSignal(states, annualUniverse, executionDate), snapshot = A.snapshotForSignal(annualUniverse, executionDate), signalIndex = allCalendar.indexOf(signalDate), fundamentalAsOf = allCalendar[Math.max(0, signalIndex - 1)] || signalDate;
    const rows = []; let noPrice = 0, noDart = 0;
    for (const [ticker, state] of active) {
      if (excludedTickers.has(ticker)) continue;
      const i = L.lastIndex(state.bars, signalDate), f = L.fundamentalAt(series.get(ticker) || [], fundamentalAsOf);
      if (i < 252 || state.bars[i].date !== signalDate) { noPrice++; continue; }
      if (!f) { noDart++; continue; }
      const threeMonthReturn = state.bars[i].close / state.bars[i - 63].close - 1;
      const sixMonthReturn = state.bars[i].close / state.bars[i - 126].close - 1;
      const twelveMonthReturn = state.bars[i].close / state.bars[i - 252].close - 1;
      const rs = momentumType === 'r12_1' ? state.bars[i - 21].close / state.bars[i - 252].close - 1
        : momentumType === 'high52w' ? (() => { let hi = 0; for (let k = i - 251; k <= i; k++) if (state.bars[k].close > hi) hi = state.bars[k].close; return hi > 0 ? state.bars[i].close / hi : 0; })()
        : momentumType === 'riskadj' ? (() => { const m = state.bars[i - 21].close / state.bars[i - 252].close - 1, r = []; for (let k = i - 125; k <= i; k++) { const p0 = state.bars[k - 1].close, p1 = state.bars[k].close; if (p0 > 0 && p1 > 0) r.push(p1 / p0 - 1); } const vv = r.length ? stddev(r) : null; return vv ? m / vv : m; })()
        : .4 * threeMonthReturn + .3 * sixMonthReturn + .3 * twelveMonthReturn;
      rows.push({ ticker, name: state.name, rs, threeMonthReturn, sixMonthReturn, twelveMonthReturn, fundamental: f });
    }
    L.percentile(rows, 'rs'); L.attachFundamentalComposite(rows);
    for (const r of rows) r.score = r.fundamentalScore === null ? null : (1 - epsWeight) * r.rsPct + epsWeight * r.fundamentalScore;
    const ranked = rows.filter(r => r.score !== null).sort((a, b) => b.score - a.score || b.rs - a.rs), holdings = ranked.slice(0, holdingsN);
    const fullRanking = ranked.map((r, index) => ({
      rank: index + 1,
      ticker: r.ticker,
      name: r.name,
      score: r.score,
      rs: r.rs,
      rsPercentile: r.rsPct,
      fundamentalScore: r.fundamentalScore,
      threeMonthReturn: r.threeMonthReturn,
      sixMonthReturn: r.sixMonthReturn,
      twelveMonthReturn: r.twelveMonthReturn,
      revenueYoY: r.fundamental.metrics.revenueYoY,
      revenueQoQ: r.fundamental.metrics.revenueQoQ,
      epsYoY: r.fundamental.metrics.epsYoY,
      epsQoQ: r.fundamental.metrics.epsQoQ,
      filingDate: r.fundamental.report.filing,
      reportYear: r.fundamental.report.year,
      reportQuarter: r.fundamental.report.quarter,
    }));
    const order = { signalDate, executionDate, rankingYear: snapshot.rankingYear, asOfDate: snapshot.asOfDate, rawTop300Count: snapshot.rawTop300Count, commonShareCount: snapshot.commonShareCount, priceAvailable: coverageLedger.find(x => x.rankingYear === snapshot.rankingYear).priceAvailable, dartCandidateCount: rows.length, excluded: { noPrice, noDart, complianceTickers: [...excludedTickers] }, forcedAnnualRoll, tickers: holdings.map(x => x.ticker), rankedTickers: ranked.slice(0, Math.max(holdingsN, holdBufferRank)).map(x => x.ticker) };
    orders.set(executionDate, order); selectionLog.push({ ...order, holdings: holdings.map(x => ({ ticker: x.ticker, name: x.name, score: x.score, rs: x.rs, reportFilingDate: x.fundamental.report.filing })), fullRanking });
  }
  const startCalendarIndex = allCalendar.indexOf(startDate);
  if (startCalendarIndex < 0) throw new Error(`start date ${startDate} is absent from the KOSPI trading calendar`);
  for (let i = 0; i < allCalendar.length - 1; i++) { const signal = allCalendar[i], exec = allCalendar[i + 1]; if (exec < startDate) continue; const annualRoll = exec.slice(0, 4) !== signal.slice(0, 4); if (annualRoll) select(signal, exec, true); if (!annualRoll && signal >= startDate && (i - startCalendarIndex + 1) % cadence === 0) select(signal, exec, false); }

  const positions = new Map(), trades = [], equity = [], events = []; let cash = INITIAL, turnover = 0, regime = true, exposure = 1;
  // Partial price-return mode only: an inactive terminal series is treated as
  // an economic delisting and converted to cash at its final available close.
  // This deliberately does not claim to know a merger or formal delisting
  // consideration; the terminal-price assumption is recorded per trade.
  function cashoutTerminalSeries(date) {
    if (!terminalCashoutLastClose) return;
    for (const [ticker, shares] of [...positions]) {
      const state = states.get(ticker), last = state?.bars?.at(-1);
      const lastCalendarIndex = last ? allCalendar.indexOf(last.date) : -1, currentCalendarIndex = allCalendar.indexOf(date);
      if (!last || lastCalendarIndex < 0 || currentCalendarIndex <= lastCalendarIndex + terminalCashoutGraceSessions) continue;
      const notional = shares * last.close, estimatedCost = notional * (buyCost + sellTax);
      cash += notional - estimatedCost; turnover += notional / Math.max(value(date, 'open'), 1); positions.delete(ticker);
      trades.push({ date, signalDate: null, ticker, side: 'SELL', notional, estimatedCost, reason: 'terminal-series-last-close-cashout', assumedDelisting: true, lastPriceDate: last.date });
      events.push({ date, ticker, reason: 'terminal-series-last-close-cashout', assumedDelisting: true, lastPriceDate: last.date, cash });
    }
  }
  const value = (date, field) => { let v = cash; for (const [ticker, shares] of positions) { const p = field === 'close' ? L.closePrice(states.get(ticker), date) : L.exactPrice(states.get(ticker), date, field); if (p !== null) v += shares * p; } return v; };
  function rebalance(date, order, desiredExposure, reason) {
    const desiredNames = order ? order.tickers : [...positions.keys()], before = value(date, 'open');
    // The annual roll is an explicit liquidation/reconstitution event.  Even a
    // name that survives into the next Top-300 pays the sell and re-entry cost,
    // so the ledger cannot quietly retain a position across membership years.
    if (order?.forcedAnnualRoll && !softAnnualRoll) for (const [ticker, shares] of [...positions]) { const p = L.exactPrice(states.get(ticker), date, 'open'); if (p === null) continue; const notional = shares * p, estimatedCost = notional * (buyCost + sellTax); cash += notional - estimatedCost; turnover += notional / Math.max(before, 1); positions.delete(ticker); trades.push({ date, signalDate: order.signalDate, ticker, side: 'SELL', notional, estimatedCost, reason: 'annual-universe-liquidation', forcedAnnualRoll: true }); }
    const all = new Set([...positions.keys(), ...desiredNames]), names = desiredNames.filter(t => L.exactPrice(states.get(t), date, 'open') !== null); let lo = 0, hi = before;
    for (let z = 0; z < 34; z++) { const invest = (lo + hi) / 2; let after = cash; for (const t of all) { const p = L.exactPrice(states.get(t), date, 'open'); if (p === null) continue; const target = names.includes(t) ? desiredExposure * invest / names.length / p : 0, delta = target - (positions.get(t) || 0); after -= delta * p + Math.abs(delta) * p * (delta > 0 ? buyCost : buyCost + sellTax); } if (after >= 0) lo = invest; else hi = invest; }
    for (const t of all) { const p = L.exactPrice(states.get(t), date, 'open'); if (p === null) continue; const target = names.includes(t) ? desiredExposure * lo / names.length / p : 0, delta = target - (positions.get(t) || 0); if (Math.abs(delta) < 1e-8) continue; const notional = Math.abs(delta) * p, estimatedCost = notional * (delta > 0 ? buyCost : buyCost + sellTax); cash -= delta * p + estimatedCost; turnover += notional / Math.max(before, 1); if (target) positions.set(t, target); else positions.delete(t); trades.push({ date, signalDate: order?.signalDate || null, ticker: t, side: delta > 0 ? 'BUY' : 'SELL', notional, estimatedCost, reason, forcedAnnualRoll: Boolean(order?.forcedAnnualRoll) }); }
    events.push({ date, signalDate: order?.signalDate || null, exposure: desiredExposure, reason, rankingYear: order?.rankingYear || null });
  }
  for (let i = 0; i < calendar.length; i++) { const date = calendar[i]; cashoutTerminalSeries(date); const prev = calendar[i - 1] || allCalendar[allCalendar.indexOf(date) - 1], order = orders.get(date); const ki = kospi.findIndex(x => x.date === prev); if (ki >= 199) { const ma = mean(kospi.slice(ki - 199, ki + 1).map(x => x.close)), close = kospi[ki].close; if (close > ma * 1.03) regime = true; else if (close < ma * .97) regime = false; } const rs = equity.slice(-volWindow).map((x, j, a) => j ? x.equity / a[j - 1].equity - 1 : null).filter(x => x !== null); const volScale = (volTarget > 0 && rs.length >= volWindow - 1) ? Math.min(1, volTarget / (stddev(rs) * Math.sqrt(252))) : 1; const nextExposure = (regime ? 1 : 0) * volScale; if (order) { if (holdBufferRank > holdingsN && (!order.forcedAnnualRoll || softAnnualRoll)) { const rankOf = new Map(order.rankedTickers.map((t, r) => [t, r + 1])); const kept = [...positions.keys()].filter(t => (rankOf.get(t) || Infinity) <= holdBufferRank); const fill = order.rankedTickers.filter(t => !kept.includes(t)).slice(0, Math.max(0, holdingsN - kept.length)); order.tickers = [...kept, ...fill].slice(0, holdingsN); } rebalance(date, order, nextExposure, order.forcedAnnualRoll ? 'annual-universe-roll' : 'weekly-rank'); } else if (Math.abs(nextExposure - exposure) > 1e-9) rebalance(date, null, nextExposure, 'regime-or-vol-overlay'); exposure = nextExposure; equity.push({ date, equity: value(date, 'close'), cash, holdings: positions.size, exposure }); }
  const benchmarkFile = arg('--benchmark-file', path.join(outDir, `annual-top300-momentum-${startDate}-through-${endDate}.json`));
  if (!fs.existsSync(benchmarkFile)) throw new Error(`missing matched annual momentum validation artifact: ${benchmarkFile}`);
  const summary = { ...metrics(equity), tradeCount: trades.length, turnover }, benchmark = read(benchmarkFile);
  // Robustness augmentation (A3): the representative report must carry the same
  // multiple-testing hurdle + bootstrap CI the alternative-factor reports do,
  // so the headline Sharpe is not read as luck-free. nTrials reflects the
  // parameter search behind this strategy family (RS weights, blend, regime MA,
  // band, vol target, vol window, cadence, holdings).
  const nTrials = Number(arg('--n-trials', '50'));
  const robustnessYears = (Date.parse(endDate) - Date.parse(startDate)) / 86400000 / 365.25;
  const robustness = { nTrials, ci: L.blockBootstrapCI(equity), deflated: L.deflatedSharpeNote(summary.sharpeZeroRf, nTrials, robustnessYears) };
  const partialCapitalActions = terminalCashoutLastClose || allowUnvalidatedPrice;
  const methodologyPrefix = Number.isFinite(universeCapFloor) && universeCapFloor > 0 ? `annual-cap${Math.round(universeCapFloor / 1e8)}m` : 'annual-top300';
  const methodology = partialCapitalActions ? `${methodologyPrefix}-capital-actions-and-terminal-cashout-partial` : (yahooAdjusted ? `${methodologyPrefix}-yahoo-adjusted-comparison` : 'annual-top300-minervini-rs-eps-revenue-regime');
  const artifact = { schemaVersion: 2, generatedAt: new Date().toISOString(), methodology, period: { start: startDate, end: endDate }, rules: { selection: selectionLabelEn, filingAvailabilityLagSessions: 1, execution: 'signal close -> next session open', overlay: overlayLabel, costs: { buyBps: costBps, sellBps: costBps + sellTaxBps, sellTaxBps }, complianceExcludedTickers: [...excludedTickers], terminalCashoutLastClose, terminalCashoutGraceSessions }, universe: { label: universeLabel, source: universeFile, coverage: coverageLedger, allowUndercoverage, rule: 'execution year y uses snapshot y-1' }, data: { priceMode: yahooAdjusted ? 'yahoo-adjusted' : 'raw-or-official-cache', priceCache: cacheDir, dartPanel: panelDir, dartPanelManifestSha256: manifestHash }, summary, robustness, annualReturns: annualReturns(equity, startDate), dailyEquity: equity, trades, rebalancingLedger: selectionLog, events, benchmarkAnnualTop300TotalReturn: benchmark.benchmarkTotalReturn.summary, limitations: ['DART is missing for some annual-universe names; only those signal candidates are excluded and each rebalance records dartCandidateCount.', 'FORWARD-DRAWDOWN CAUTION: the full-sample maxDrawdown understates forward risk. A walk-forward split (IS 2017-2022 / OOS 2023-2026) puts OOS MDD near -30% to -36%, versus a -16% full-sample figure. Report the OOS bracket, not the full-sample MDD alone. See strategy-redesign-*.md.', 'OVERLAY EVIDENCE: on the survivorship-honest (marcap, delisted-inclusive) cache, ablation attributes the drawdown control entirely to the KOSPI SMA regime; the 60-session 18% volatility target is a return drag (~-3%p CAGR) with no MDD benefit, and the chosen overlay parameters sit at local CAGR minima (overfit signal). A regime-only variant (drop the vol target) improves CAGR and cuts turnover ~70% both in- and out-of-sample. See overlay-ablation-sensitivity-*.md and strategy-redesign-*.md.', ...(yahooAdjusted ? ['COMPARISON RUN: Yahoo adjusted OHLC is used to align this point-in-time universe test with the current-universe baseline. Yahoo adjustment provenance and delisting consideration are not official KRX/DART verification.', allowUndercoverage ? 'Yahoo series missing or failing the baseline price-jump screen is excluded under the user-approved exclusion policy. Coverage is retained per year in the JSON ledger; this run deliberately waives the normal 90% coverage gate.' : 'Yahoo series unavailable for a constituent is excluded; annual coverage remains in the JSON ledger.'] : []), ...(partialCapitalActions ? ['PARTIAL PRICE-RETURN RUN: dividends, rights issues, mergers, and spin-offs are intentionally ignored. Inferred reciprocal price/share events cover split-like capital changes only.', `A terminal price series is assumed to be a delisting only after ${terminalCashoutGraceSessions} consecutive KOSPI sessions, then liquidated at its final close less normal sell costs. Ticker changes and prolonged halts can be misclassified. This is not an official total-return result.`] : ['Annual membership reduces but does not eliminate delisting, halt, and historical-liquidity bias.'])] };
  const stem = arg('--artifact-stem', `${partialCapitalActions ? 'annual-cap300b-capital-actions-partial' : (yahooAdjusted ? 'annual-cap300b-yahoo-adjusted' : 'annual-top300-minervini-earnings-regime')}-${startDate}-through-${endDate}`); write(path.join(outDir, `${stem}.json`), artifact);
  const p = x => `${(x * 100).toFixed(2)}%`; const title = partialCapitalActions ? '3,000억원 자본변동·상폐 종가현금화 부분표본' : (yahooAdjusted ? `${universeLabel} — Yahoo 조정가격 정합 비교` : `${universeLabel} Minervini RS·실적·레짐 백테스트`); const benchmarkLabel = yahooAdjusted ? `${universeLabel} Yahoo 가격가능 동일가중` : `${universeLabel} 동일가중 총수익`; const md = `# ${title}\n\n- 기간: ${startDate}~${endDate}; ${cadence}거래일 리밸런싱${holdBufferRank > holdingsN ? ` (밴드 랭크 ${holdBufferRank})` : ''}${softAnnualRoll ? ' + 연초 롤 완화' : ''}; 상위 ${holdingsN}개 동일비중\n- 신호: ${selectionLabelKo}; 공시 반영 1거래일 지연\n- 오버레이: ${overlayLabelKo}\n- 비용: 매수 ${costBps}bp / 매도 ${costBps + sellTaxBps}bp (매도 거래세 ${sellTaxBps}bp)\n${yahooAdjusted ? `- 가격: Yahoo Finance 조정 OHLC. 현재 유니버스 30% 기준선과 가격 조정 방식은 맞췄지만, Yahoo 미제공 종목은 제외했고 공식 기업행사·상폐 대가 검증 결과는 아니다.${allowUndercoverage ? ' 이 비교본은 사용자 지시에 따라 정상 가격 점프 범위를 벗어난 종목도 제외하며, 90% 커버리지 게이트를 해제했다.' : ''}\n` : ''}${partialCapitalActions ? `- 데이터 처리: 분할·병합·감자 후보의 가격/주식수 비율 추정 보정. 배당·유증·합병·분할승계는 무시하며, 종가가 ${terminalCashoutGraceSessions}거래일 넘게 끊긴 보유종목만 마지막 종가 현금화로 가정.\n` : ''}\n|구분|누적 수익률|CAGR|Sharpe|MDD|거래 수|\n|---|---:|---:|---:|---:|---:|\n|Minervini RS + 실적 + 레짐|${p(summary.totalReturn)}|${p(summary.cagr)}|${summary.sharpeZeroRf.toFixed(2)}|${p(summary.maxDrawdown)}|${summary.tradeCount}|\n|${benchmarkLabel}|${p(benchmark.benchmarkTotalReturn.summary.totalReturn)}|${p(benchmark.benchmarkTotalReturn.summary.cagr)}|${benchmark.benchmarkTotalReturn.summary.sharpeZeroRf.toFixed(2)}|${p(benchmark.benchmarkTotalReturn.summary.maxDrawdown)}|—|\n\nDART 결측은 전체 유니버스를 제거하지 않고 해당 신호 후보만 제외했다. JSON 원장에 연도별 유니버스·DART 후보 수·연초 강제 교체를 보존한다.\n\n${L.statsFootnote({ strategyStats: { main: { ci: robustness.ci, deflated: robustness.deflated } } }, 'main', universeLabel)}\n- **Forward MDD 주의:** 전체표본 MDD는 forward 위험을 과소평가한다. Walk-forward(IS 2017–2022 / OOS 2023–2026) OOS MDD는 −30~−36%대로, 전체표본 −16%가 아니다.\n- **오버레이 근거:** 생존편향-정직 캐시 ablation상 낙폭방어는 전부 KOSPI 레짐 몫이고 60일 18% 변동성 타깃은 순수 수익 드래그(≈−3%p CAGR, MDD 개선 0)다. vol 타깃 제거(레짐 단독)가 IS·OOS 모두에서 CAGR↑·회전율 −72%. 상세: overlay-ablation-sensitivity / strategy-redesign 리포트.\n`; fs.mkdirSync(outDir, { recursive: true }); fs.writeFileSync(path.join(outDir, `${stem}.md`), md); console.log(JSON.stringify({ summary, terminalCashouts: trades.filter(x => x.assumedDelisting).length, dartCoverage: coverageLedger.map(x => ({ rankingYear: x.rankingYear, priceCoverage: x.priceCoverage })), artifact: path.join(outDir, `${stem}.json`) }, null, 2));
  if (partialCapitalActions) {
    const markdownFile = path.join(outDir, `${stem}.md`);
    const correctedTitle = `# ${universeLabel} 자본변동·상폐 종가현금화 부분 가격수익 진단`;
    fs.writeFileSync(markdownFile, fs.readFileSync(markdownFile, 'utf8').replace(/^# 3,000억원 자본변동·상폐 종가현금화 부분표본$/m, correctedTitle));
  }
}
// `official-total-return` has a deliberately separate runner and artifact
// family.  Keeping this dispatch here preserves the established main-strategy
// command while making it impossible to accidentally feed an inferred/raw
// cache into the strict official mode.
const requestedPriceMode = arg('--price-mode', null);
if (requestedPriceMode === 'official-total-return') require('./run-official-total-return-backtest.js').main();
else if (requestedPriceMode && requestedPriceMode !== 'yahoo-adjusted') throw new Error(`unsupported --price-mode: ${requestedPriceMode}`);
else main();
