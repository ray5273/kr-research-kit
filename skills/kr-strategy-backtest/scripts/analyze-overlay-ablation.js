#!/usr/bin/env node
'use strict';

// Phase-B analysis tool (NOT a model-portfolio runner).
//
// Decomposes the annual Top-300 Minervini RS + EPS + regime + vol-target
// strategy into its contributing layers (selection vs timing alpha) and runs a
// one-factor-at-a-time (OFAT) sensitivity sweep over the overlay parameters so
// overfitting of the drawdown overlay is visible rather than assumed.
//
// It reuses the exact scoring/selection/execution helpers from
// factor-backtest-core.js and replicates the compact daily loop from
// run-annual-top300-minervini-earnings-regime.js with configurable toggles.
// Universe, cost model, cadence, holdings, and execution timing are held FIXED
// across every configuration, so differences are attributable only to the
// toggled layer/parameter. It never writes the production artifact.
//
// Handling note: like the production value() at close, a terminated (delisted)
// series forward-fills its last close in the equity mark. This is identical
// across every configuration here, so the *relative* decomposition is
// unaffected; absolute levels are the split-only / carry diagnostic, not an
// official total-return.

const fs = require('fs');
const path = require('path');
const L = require('./lib/factor-backtest-core.js');
const A = require('./lib/annual-top300-universe.js');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const START = '2016-07-11', DEFAULT_END = '2026-07-16', N = 10, CADENCE = 5, COST = 0.0025, SELL_TAX = 0.0018, INITIAL = 100000000;
const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const read = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const write = (f, x) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(x, null, 2) + '\n'); };
const mean = xs => xs.reduce((s, x) => s + x, 0) / xs.length;
const stddev = xs => { const m = mean(xs); return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, xs.length - 1)); };

function metrics(eq) {
  const r = eq.slice(1).map((x, i) => x.equity / eq[i].equity - 1), m = mean(r), v = stddev(r);
  const years = (Date.parse(eq.at(-1).date) - Date.parse(eq[0].date)) / 86400000 / 365.25;
  let peak = INITIAL, mdd = 0; for (const x of eq) { peak = Math.max(peak, x.equity); mdd = Math.min(mdd, x.equity / peak - 1); }
  return { totalReturn: eq.at(-1).equity / INITIAL - 1, cagr: (eq.at(-1).equity / INITIAL) ** (1 / years) - 1, annualizedVolatility: v * Math.sqrt(252), sharpeZeroRf: v ? m / v * Math.sqrt(252) : 0, maxDrawdown: mdd, calmar: mdd ? ((eq.at(-1).equity / INITIAL) ** (1 / years) - 1) / Math.abs(mdd) : 0 };
}
function parseKospi(cacheDir) {
  const normalized = path.join(cacheDir, 'normalized/_KS11.json');
  if (fs.existsSync(normalized)) return read(normalized).bars.map(x => ({ date: x.date, close: x.close }));
  throw new Error(`missing KOSPI calendar cache: ${normalized}`);
}

// Trailing realized daily-return volatility over `window` sessions ending at i.
function trailingVol(bars, i, window) {
  if (i < window) return null;
  const r = []; for (let k = i - window + 1; k <= i; k++) { const p0 = bars[k - 1].close, p1 = bars[k].close; if (p0 > 0 && p1 > 0) r.push(p1 / p0 - 1); }
  return r.length >= window - 1 ? stddev(r) : null;
}

// One full backtest for a given config. Returns metrics + trade/turnover counts.
// cfg sleeves (weights need not sum to 1; RS takes the remainder):
//   epsWeight     point-in-time EPS/revenue composite sleeve (0 => no EPS)
//   lowVolWeight  inverse trailing-vol sleeve (0 => off); lowVolWindow default 60
// overlay: regime(bool)/regimeMaWindow/regimeBand, volTarget(null=off)/volWindow
function runConfig(ctx, cfg) {
  const { annualUniverse, states, coverageLedger, series, kospi, allCalendar, calendar, startDate } = ctx;
  const buyCost = cfg.buyCost != null ? cfg.buyCost : COST, sellTax = cfg.sellTax != null ? cfg.sellTax : SELL_TAX;
  const epsWeight = cfg.epsWeight;                 // 0 => RS only
  const momentumType = cfg.momentumType || 'blend'; // blend(3/6/12) | r12_1(12mo skip last mo) | riskadj(12-1/vol) | high52w(proximity to 52w high)
  const lowVolWeight = cfg.lowVolWeight || 0;      // 0 => no low-vol sleeve
  const lowVolWindow = cfg.lowVolWindow || 60;
  const valueWeight = cfg.valueWeight || 0;        // E/P (earnings yield) sleeve
  const qualityWeight = cfg.qualityWeight || 0;    // quality sleeve (see qualityMetric)
  const qualityMetric = cfg.qualityMetric || 'roa'; // roa | roe | gp (gross/assets) | cfoa (cfo/assets)
  const cadence = cfg.cadence || CADENCE;          // rebalance spacing in sessions
  const holdings = cfg.holdings || N;              // number of names held
  const holdBufferRank = cfg.holdBufferRank || holdings; // rebalancing band: keep an incumbent until its rank falls past this (>holdings enables it)
  const softAnnualRoll = cfg.softAnnualRoll || false;    // if true, the annual roll does not force-liquidate survivors (keeps names still selected)
  const useRegime = cfg.regime !== false;          // apply SMA regime filter
  const maWindow = cfg.regimeMaWindow || 200;
  const band = cfg.regimeBand == null ? 0.03 : cfg.regimeBand;
  const regimeMode = cfg.regimeMode || 'binary';   // 'binary' (hysteresis on/off) | 'graduated' (ramp 0..1 across the band)
  const volTarget = cfg.volTarget;                 // null/undefined => no vol target
  const volWindow = cfg.volWindow || 60;

  const orders = new Map();
  function select(signalDate, executionDate, forcedAnnualRoll) {
    const active = L.statesForSignal(states, annualUniverse, executionDate);
    const snapshot = A.snapshotForSignal(annualUniverse, executionDate);
    const signalIndex = allCalendar.indexOf(signalDate);
    const fundamentalAsOf = allCalendar[Math.max(0, signalIndex - 1)] || signalDate;
    const rows = [];
    for (const [ticker, state] of active) {
      const i = L.lastIndex(state.bars, signalDate);
      const f = L.fundamentalAt(series.get(ticker) || [], fundamentalAsOf);
      if (i < 252 || state.bars[i].date !== signalDate) continue;
      if (!f) continue;                            // universe held fixed to DART-covered names across all configs
      const b = state.bars;
      let rs;
      if (momentumType === 'r12_1') rs = b[i - 21].close / b[i - 252].close - 1;              // 11mo return, skip last month (no short-term reversal)
      else if (momentumType === 'riskadj') { const m = b[i - 21].close / b[i - 252].close - 1, vv = trailingVol(b, i, 126); rs = vv ? m / vv : m; }  // risk-adjusted 12-1
      else if (momentumType === 'high52w') { let hi = 0; for (let k = i - 251; k <= i; k++) if (b[k].close > hi) hi = b[k].close; rs = hi > 0 ? b[i].close / hi : 0; }  // proximity to 52w high
      else rs = .4 * (b[i].close / b[i - 63].close - 1) + .3 * (b[i].close / b[i - 126].close - 1) + .3 * (b[i].close / b[i - 252].close - 1);  // blend (default)
      const v = trailingVol(state.bars, i, lowVolWindow);
      // Value E/P and quality ROA use the same point-in-time DART series. EPS is
      // nominal (per raw share) so E/P = ttmEPS * adjustmentFactor / adjustedClose
      // keeps units consistent with the split-back-adjusted price.
      const fseries = series.get(ticker) || [];
      const adjF = state.bars[i].adjustmentFactor == null ? 1 : state.bars[i].adjustmentFactor;
      const epsTtm = L.ttmFlow(fseries, fundamentalAsOf, 'eps');
      const ep = (epsTtm && Number.isFinite(epsTtm.value) && state.bars[i].close > 0) ? epsTtm.value * adjF / state.bars[i].close : null;
      let roa = null;
      if (qualityWeight > 0) {
        const assets = L.latestSnapshot(fseries, fundamentalAsOf, 'assets');
        if (assets && assets.value > 0) {
          if (qualityMetric === 'gp') { const g = L.ttmFlow(fseries, fundamentalAsOf, 'gross'); roa = g ? g.value / assets.value : null; }
          else if (qualityMetric === 'cfoa') { const c = L.ttmFlow(fseries, fundamentalAsOf, 'cfo'); roa = c ? c.value / assets.value : null; }
          else if (qualityMetric === 'roe') { const n = L.ttmFlow(fseries, fundamentalAsOf, 'net'), liab = L.latestSnapshot(fseries, fundamentalAsOf, 'liab'), eq = liab ? assets.value - liab.value : null; roa = (n && eq && eq > 0) ? n.value / eq : null; }
          else { const n = L.ttmFlow(fseries, fundamentalAsOf, 'net'); roa = n ? n.value / assets.value : null; }
        }
      }
      rows.push({ ticker, name: state.name, rs, fundamental: f, lowVol: v == null ? null : -v, ep, roa });
    }
    L.percentile(rows, 'rs'); L.attachFundamentalComposite(rows);
    if (lowVolWeight > 0) L.percentile(rows.filter(r => r.lowVol !== null), 'lowVol');
    if (valueWeight > 0) L.percentile(rows.filter(r => r.ep !== null), 'ep');
    if (qualityWeight > 0) L.percentile(rows.filter(r => r.roa !== null), 'roa');
    const rsWeight = Math.max(0, 1 - epsWeight - lowVolWeight - valueWeight - qualityWeight);
    for (const r of rows) {
      const fundOk = epsWeight === 0 || r.fundamentalScore !== null;
      const lvOk = lowVolWeight === 0 || (r.lowVol !== null && r.lowVolPct !== undefined);
      const valOk = valueWeight === 0 || (r.ep !== null && r.epPct !== undefined);
      const qOk = qualityWeight === 0 || (r.roa !== null && r.roaPct !== undefined);
      r.score = (fundOk && lvOk && valOk && qOk) ? rsWeight * r.rsPct + epsWeight * (r.fundamentalScore || 0) + lowVolWeight * (r.lowVolPct || 0) + valueWeight * (r.epPct || 0) + qualityWeight * (r.roaPct || 0) : null;
    }
    const ranked = rows.filter(r => r.score !== null).sort((a, b) => b.score - a.score || b.rs - a.rs);
    orders.set(executionDate, { signalDate, forcedAnnualRoll, tickers: ranked.slice(0, holdings).map(x => x.ticker), rankedTickers: ranked.slice(0, Math.max(holdings, holdBufferRank)).map(x => x.ticker) });
  }
  const startCalendarIndex = allCalendar.indexOf(startDate);
  for (let i = 0; i < allCalendar.length - 1; i++) {
    const signal = allCalendar[i], exec = allCalendar[i + 1];
    if (exec < startDate) continue;
    const annualRoll = exec.slice(0, 4) !== signal.slice(0, 4);
    if (annualRoll) select(signal, exec, true);
    if (!annualRoll && signal >= startDate && (i - startCalendarIndex + 1) % cadence === 0) select(signal, exec, false);
  }

  const positions = new Map(), equity = []; let cash = INITIAL, tradeCount = 0, turnover = 0, regime = true, regimeExposure = 1, exposure = 1;
  const value = (date, field) => { let v = cash; for (const [ticker, shares] of positions) { const p = field === 'close' ? L.closePrice(states.get(ticker), date) : L.exactPrice(states.get(ticker), date, field); if (p !== null) v += shares * p; } return v; };
  function rebalance(date, order, desiredExposure) {
    const desiredNames = order ? order.tickers : [...positions.keys()], before = value(date, 'open');
    if (order?.forcedAnnualRoll && !softAnnualRoll) for (const [ticker, shares] of [...positions]) { const p = L.exactPrice(states.get(ticker), date, 'open'); if (p === null) continue; const notional = shares * p; cash += notional - notional * (buyCost + sellTax); turnover += notional / Math.max(before, 1); positions.delete(ticker); tradeCount++; }
    const all = new Set([...positions.keys(), ...desiredNames]), names = desiredNames.filter(t => L.exactPrice(states.get(t), date, 'open') !== null); let lo = 0, hi = before;
    for (let z = 0; z < 34; z++) { const invest = (lo + hi) / 2; let after = cash; for (const t of all) { const p = L.exactPrice(states.get(t), date, 'open'); if (p === null) continue; const target = names.includes(t) ? desiredExposure * invest / names.length / p : 0, delta = target - (positions.get(t) || 0); after -= delta * p + Math.abs(delta) * p * (delta > 0 ? buyCost : buyCost + sellTax); } if (after >= 0) lo = invest; else hi = invest; }
    for (const t of all) { const p = L.exactPrice(states.get(t), date, 'open'); if (p === null) continue; const target = names.includes(t) ? desiredExposure * lo / names.length / p : 0, delta = target - (positions.get(t) || 0); if (Math.abs(delta) < 1e-8) continue; const notional = Math.abs(delta) * p; cash -= delta * p + notional * (delta > 0 ? buyCost : buyCost + sellTax); turnover += notional / Math.max(before, 1); if (target) positions.set(t, target); else positions.delete(t); tradeCount++; }
  }
  for (let i = 0; i < calendar.length; i++) {
    const date = calendar[i];
    const prev = calendar[i - 1] || allCalendar[allCalendar.indexOf(date) - 1], order = orders.get(date);
    const ki = kospi.findIndex(x => x.date === prev);
    if (useRegime && ki >= maWindow - 1) {
      const ma = mean(kospi.slice(ki - (maWindow - 1), ki + 1).map(x => x.close)), close = kospi[ki].close;
      if (regimeMode === 'graduated') { regimeExposure = Math.max(0, Math.min(1, (close / ma - (1 - band)) / (2 * band))); }
      else { if (close > ma * (1 + band)) regime = true; else if (close < ma * (1 - band)) regime = false; regimeExposure = regime ? 1 : 0; }
    }
    const rs = equity.slice(-volWindow).map((x, j, a) => j ? x.equity / a[j - 1].equity - 1 : null).filter(x => x !== null);
    const volScale = (volTarget != null && rs.length >= volWindow - 1) ? Math.min(1, volTarget / (stddev(rs) * Math.sqrt(252))) : 1;
    const nextExposure = (useRegime ? regimeExposure : 1) * volScale;
    if (order) {
      // Rebalancing band: keep incumbents whose fresh rank is still within
      // holdBufferRank; only fill freed slots from the top of the new ranking.
      // Skipped on the forced annual roll (a full reselection).
      if (holdBufferRank > holdings && (!order.forcedAnnualRoll || softAnnualRoll)) {
        const rankOf = new Map(order.rankedTickers.map((t, r) => [t, r + 1]));
        const kept = [...positions.keys()].filter(t => (rankOf.get(t) || Infinity) <= holdBufferRank);
        const fill = order.rankedTickers.filter(t => !kept.includes(t)).slice(0, Math.max(0, holdings - kept.length));
        order.tickers = [...kept, ...fill].slice(0, holdings);
      }
      rebalance(date, order, nextExposure);
    } else if (Math.abs(nextExposure - exposure) > 1e-9) rebalance(date, null, nextExposure);
    exposure = nextExposure;
    equity.push({ date, equity: value(date, 'close') });
  }
  return { ...metrics(equity), tradeCount, turnover, equity };
}

// Build a reusable backtest context (universe states, DART panel, KOSPI
// calendar) for a given cache + date window. Shared by the ablation main here
// and by the Phase-C redesign driver.
function buildContext({ universeFile, cacheDir, panelDir, startDate, endDate }) {
  const { annualUniverse, states, coverageLedger } = L.loadAnnualPriceStates(universeFile, null, true, true, cacheDir);
  const { series } = L.loadSeriesByTicker(panelDir);
  const kospi = parseKospi(cacheDir), allCalendar = kospi.map(x => x.date).filter(d => d <= endDate), calendar = allCalendar.filter(d => d >= startDate);
  return { annualUniverse, states, coverageLedger, series, kospi, allCalendar, calendar, startDate, endDate };
}

function main() {
  const universeFile = arg('--universe-file', path.join(ROOT, 'analysis-example/kr-market/strategies/annual-top300/universe-ledger-2015-2025.json'));
  const cacheDir = arg('--cache-dir', L.DATA), panelDir = arg('--dart-panel-dir', L.PANEL);
  const startDate = arg('--start-date', START), endDate = arg('--end-date', DEFAULT_END);
  const outDir = arg('--out-dir', path.join(ROOT, 'analysis-example/kr-market/strategies/annual-top300'));
  const label = arg('--label', 'marcap-split');
  const ctx = buildContext({ universeFile, cacheDir, panelDir, startDate, endDate });

  const BASE = { epsWeight: 0.5, regime: true, regimeMaWindow: 200, regimeBand: 0.03, volTarget: 0.18, volWindow: 60 };
  // Layered ablation: each row adds exactly one layer over the previous.
  const ablation = [
    { key: 'A. RS only (no overlay)', cfg: { ...BASE, epsWeight: 0, regime: false, volTarget: null } },
    { key: 'B. RS + EPS (no overlay)', cfg: { ...BASE, regime: false, volTarget: null } },
    { key: 'C. + KOSPI regime', cfg: { ...BASE, volTarget: null } },
    { key: 'D. + vol target (FULL)', cfg: { ...BASE } },
    { key: 'E. RS only + FULL overlay', cfg: { ...BASE, epsWeight: 0 } },
    { key: 'F. EPS only + FULL overlay', cfg: { ...BASE, epsWeight: 1 } },
  ];
  // One-factor-at-a-time sensitivity around the FULL model (BASE).
  const sensitivity = [
    ['regimeMaWindow', [150, 175, 200, 225, 250]],
    ['regimeBand', [0.00, 0.02, 0.03, 0.05, 0.08]],
    ['volTarget', [0.12, 0.15, 0.18, 0.22, 0.30, null]],
    ['volWindow', [30, 45, 60, 90, 120]],
  ];

  const ablationResults = ablation.map(({ key, cfg }) => ({ key, ...runConfig(ctx, cfg) }));
  const sensitivityResults = {};
  for (const [param, values] of sensitivity) {
    sensitivityResults[param] = values.map(v => ({ value: v, ...runConfig(ctx, { ...BASE, [param]: v }) }));
  }

  const pct = x => `${(x * 100).toFixed(2)}%`;
  const row = r => `| ${r.key.padEnd(28)} | ${pct(r.cagr).padStart(8)} | ${r.sharpeZeroRf.toFixed(2).padStart(5)} | ${pct(r.maxDrawdown).padStart(8)} | ${r.calmar.toFixed(2).padStart(5)} | ${r.tradeCount} |`;
  console.log(`\n=== ABLATION (${label}, ${startDate}~${endDate}, universe fixed to DART-covered) ===`);
  console.log('| layer                        |     CAGR | Sharp |      MDD | Calmr | trades |');
  console.log('|------------------------------|---------:|------:|---------:|------:|-------:|');
  for (const r of ablationResults) console.log(row(r));
  // Attribution deltas
  const byKey = Object.fromEntries(ablationResults.map(r => [r.key[0], r]));
  console.log('\n-- attribution (CAGR / Sharpe / MDD deltas) --');
  console.log(`EPS ranking sleeve  (B-A): ${pct(byKey.B.cagr - byKey.A.cagr)} CAGR | ${(byKey.B.sharpeZeroRf - byKey.A.sharpeZeroRf).toFixed(2)} Sharpe | ${pct(byKey.B.maxDrawdown - byKey.A.maxDrawdown)} MDD`);
  console.log(`Regime filter       (C-B): ${pct(byKey.C.cagr - byKey.B.cagr)} CAGR | ${(byKey.C.sharpeZeroRf - byKey.B.sharpeZeroRf).toFixed(2)} Sharpe | ${pct(byKey.C.maxDrawdown - byKey.B.maxDrawdown)} MDD`);
  console.log(`Vol target          (D-C): ${pct(byKey.D.cagr - byKey.C.cagr)} CAGR | ${(byKey.D.sharpeZeroRf - byKey.C.sharpeZeroRf).toFixed(2)} Sharpe | ${pct(byKey.D.maxDrawdown - byKey.C.maxDrawdown)} MDD`);
  console.log(`Overlay total     (D-B): ${pct(byKey.D.cagr - byKey.B.cagr)} CAGR | ${(byKey.D.sharpeZeroRf - byKey.B.sharpeZeroRf).toFixed(2)} Sharpe | ${pct(byKey.D.maxDrawdown - byKey.B.maxDrawdown)} MDD`);

  console.log('\n=== OVERLAY PARAMETER SENSITIVITY (OFAT around FULL model) ===');
  for (const [param, values] of sensitivity) {
    console.log(`\n-- ${param} (base ${BASE[param]}) --`);
    for (const r of sensitivityResults[param]) console.log(`  ${String(r.value).padStart(6)} : CAGR ${pct(r.cagr).padStart(8)} | Sharpe ${r.sharpeZeroRf.toFixed(2)} | MDD ${pct(r.maxDrawdown).padStart(8)}`);
  }

  const outStem = `overlay-ablation-sensitivity-${label}-${startDate}-through-${endDate}`;
  write(path.join(outDir, `${outStem}.json`), { generatedAt: new Date().toISOString(), label, period: { start: startDate, end: endDate }, priceCache: cacheDir, dartPanel: panelDir, base: BASE, note: 'Universe held fixed to DART-covered names; delisted series forward-fill last close (carry). Relative decomposition valid; absolute levels are split-only carry diagnostic, not official total-return.', ablation: ablationResults, sensitivity: sensitivityResults });
  console.log(`\nartifact: ${path.join(outDir, `${outStem}.json`)}`);
}

module.exports = { buildContext, runConfig, metrics, trailingVol, parseKospi, N, CADENCE, COST, SELL_TAX, INITIAL };
if (require.main === module) main();
