#!/usr/bin/env node
'use strict';

// Robustness-first strategy search on the survivorship-honest, dividend-inclusive
// cache. Every candidate uses the KOSPI SMA200 regime overlay (the one free
// edge) with NO volatility target (R1), top-10 equal weight, 5-session cadence,
// and differs only in the SELECTION sleeves (momentum / EPS-growth / low-vol /
// value E-P / quality ROA and blends). Each candidate is scored full-sample AND
// walk-forward (IS 2017-2022 / OOS 2023-2026), with a monthly-block-bootstrap CI
// and a Deflated Sharpe hurdle. "Robust" = clears the DSR hurdle AND holds up
// out-of-sample. This is a diagnostic on a split+dividend cache, not strict
// official; relative ranking is the point.

const fs = require('fs');
const path = require('path');
const L = require('./lib/factor-backtest-core.js');
const { buildContext, runConfig } = require('./analyze-overlay-ablation.js');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const write = (f, x) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(x, null, 2) + '\n'); };
const pct = x => `${(x * 100).toFixed(2)}%`;

// regime-on, vol-off for every candidate; only selection sleeves vary.
const R = { regime: true, regimeMaWindow: 200, regimeBand: 0.03, volTarget: null };
const CANDIDATES = [
  { key: 'Momentum (RS)', cfg: { ...R, epsWeight: 0 } },
  { key: 'EPS growth', cfg: { ...R, epsWeight: 1 } },
  { key: 'Low-vol', cfg: { ...R, epsWeight: 0, lowVolWeight: 1 } },
  { key: 'Value E/P', cfg: { ...R, epsWeight: 0, valueWeight: 1 } },
  { key: 'Quality ROA', cfg: { ...R, epsWeight: 0, qualityWeight: 1 } },
  { key: 'Value + Low-vol', cfg: { ...R, epsWeight: 0, valueWeight: 0.5, lowVolWeight: 0.5 } },
  { key: 'Value + Quality', cfg: { ...R, epsWeight: 0, valueWeight: 0.5, qualityWeight: 0.5 } },
  { key: 'Value + EPS growth', cfg: { ...R, epsWeight: 0.5, valueWeight: 0.5 } },
  { key: 'Momentum + Low-vol', cfg: { ...R, epsWeight: 0, lowVolWeight: 0.5 } },
  { key: 'Value+Quality+Low-vol', cfg: { ...R, epsWeight: 0, valueWeight: 0.34, qualityWeight: 0.33, lowVolWeight: 0.33 } },
  { key: 'All four (EPS+Val+Q+LV)', cfg: { ...R, epsWeight: 0.25, valueWeight: 0.25, qualityWeight: 0.25, lowVolWeight: 0.25 } },
  { key: 'R1 baseline (RS+EPS)', cfg: { ...R, epsWeight: 0.5 } },
];

function main() {
  const universeFile = arg('--universe-file', path.join(ROOT, 'analysis-example/kr-market/strategies/annual-top300/universe-ledger-2015-2025.json'));
  const cacheDir = arg('--cache-dir', L.DATA), panelDir = arg('--dart-panel-dir', L.PANEL);
  const startDate = arg('--start-date', '2017-01-02'), endDate = arg('--end-date', '2026-07-16');
  const isEnd = arg('--is-end', '2022-12-30'), oosStart = arg('--oos-start', '2023-01-02');
  const outDir = arg('--out-dir', path.join(ROOT, 'analysis-example/kr-market/strategies/annual-top300'));
  const label = arg('--label', 'marcap-total-return');
  const nTrials = Number(arg('--n-trials', '50'));

  const full = buildContext({ universeFile, cacheDir, panelDir, startDate, endDate });
  const isCtx = buildContext({ universeFile, cacheDir, panelDir, startDate, endDate: isEnd });
  const oosCtx = buildContext({ universeFile, cacheDir, panelDir, startDate: oosStart, endDate });
  const nYears = (Date.parse(endDate) - Date.parse(startDate)) / 86400000 / 365.25;

  const rows = CANDIDATES.map(({ key, cfg }) => {
    const f = runConfig(full, cfg);
    const ci = L.blockBootstrapCI(f.equity);
    const dsr = L.deflatedSharpeNote(f.sharpeZeroRf, nTrials, nYears);
    const is = runConfig(isCtx, cfg), oos = runConfig(oosCtx, cfg);
    const robust = dsr.clears && oos.cagr > 0 && oos.sharpeZeroRf > 0;
    return { key, cfg, full: { cagr: f.cagr, sharpe: f.sharpeZeroRf, mdd: f.maxDrawdown, calmar: f.calmar, trades: f.tradeCount }, ci: { cagrP5: ci.cagr.p5, cagrP95: ci.cagr.p95, sharpeP5: ci.sharpe.p5, sharpeP95: ci.sharpe.p95 }, dsr: { hurdle: dsr.hurdleAnnualizedSharpe, observed: dsr.observedSharpe, clears: dsr.clears }, is: { cagr: is.cagr, sharpe: is.sharpeZeroRf, mdd: is.maxDrawdown }, oos: { cagr: oos.cagr, sharpe: oos.sharpeZeroRf, mdd: oos.maxDrawdown }, robust };
  });
  // Rank: robust first, then by OOS Sharpe, then full Sharpe.
  rows.sort((a, b) => (b.robust - a.robust) || (b.oos.sharpe - a.oos.sharpe) || (b.full.sharpe - a.full.sharpe));

  console.log(`\n=== ROBUST STRATEGY SEARCH (${label}, ${startDate}~${endDate}; regime-on, vol-off, top10 EW, DSR nTrials=${nTrials}) ===`);
  console.log('| candidate                  | full CAGR | Shp | DSR hurdle | clears | OOS CAGR | OOSShp | robust |');
  console.log('|----------------------------|----------:|----:|-----------:|:------:|---------:|-------:|:------:|');
  for (const r of rows) console.log(`| ${r.key.padEnd(26)} | ${pct(r.full.cagr).padStart(9)} | ${r.full.sharpe.toFixed(2)} | ${r.dsr.hurdle.toFixed(2).padStart(10)} | ${r.dsr.clears ? ' YES ' : ' no  '} | ${pct(r.oos.cagr).padStart(8)} | ${r.oos.sharpe.toFixed(2).padStart(6)} | ${r.robust ? ' YES ' : ' no  '} |`);
  const winners = rows.filter(r => r.robust);
  console.log(`\nrobust (clears DSR + positive OOS): ${winners.length ? winners.map(w => w.key).join(', ') : 'NONE'}`);

  write(path.join(outDir, `robust-strategy-search-${label}-${startDate}-through-${endDate}.json`), { generatedAt: new Date().toISOString(), label, period: { start: startDate, end: endDate }, isEnd, oosStart, nTrials, nYears, priceCache: cacheDir, note: 'regime-on, vol-off, top-10 EW, 5-session cadence; selection sleeves vary. Split+dividend honest cache, not strict official. DSR nTrials is conservative (whole research).', ranked: rows });
  console.log(`\nartifact: robust-strategy-search-${label}-${startDate}-through-${endDate}.json`);
}
main();
