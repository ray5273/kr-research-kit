#!/usr/bin/env node
'use strict';

// Phase-C analysis tool (NOT a model-portfolio runner).
//
// Tests the redesign directions Phase B pointed at — drop the vol target, keep
// the regime filter, lift the EPS sleeve, optionally add a low-vol tilt sleeve —
// and runs a walk-forward split (in-sample vs out-of-sample) on the current
// design and the best redesign so the overfitting suspicion is checked on data
// the parameters were never seen on.
//
// Reuses buildContext + runConfig from analyze-overlay-ablation.js so scoring,
// execution, cost, cadence, and universe handling are byte-identical to the
// ablation. Same carry / split-only marcap caveat applies: relative comparison
// is valid; absolute levels are a survivorship-honest, dividend-conservative
// diagnostic, not an official total return.

const fs = require('fs');
const path = require('path');
const L = require('./lib/factor-backtest-core.js');
const { buildContext, runConfig } = require('./analyze-overlay-ablation.js');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const write = (f, x) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(x, null, 2) + '\n'); };
const pct = x => `${(x * 100).toFixed(2)}%`;

const FULL = { epsWeight: 0.5, regime: true, regimeMaWindow: 200, regimeBand: 0.03, volTarget: 0.18, volWindow: 60 };
const CANDIDATES = [
  { key: 'FULL (current design)', cfg: { ...FULL } },
  { key: 'R1 eps.5 regime noVol', cfg: { ...FULL, volTarget: null } },
  { key: 'R2 eps.7 regime noVol', cfg: { ...FULL, epsWeight: 0.7, volTarget: null } },
  { key: 'R3 eps1. regime noVol', cfg: { ...FULL, epsWeight: 1.0, volTarget: null } },
  { key: 'R4 eps.5 lv.2 regime noVol', cfg: { ...FULL, epsWeight: 0.5, lowVolWeight: 0.2, volTarget: null } },
  { key: 'R5 eps.6 lv.2 regime noVol', cfg: { ...FULL, epsWeight: 0.6, lowVolWeight: 0.2, volTarget: null } },
  { key: 'R6 eps.7 lv.15 regime vol.22', cfg: { ...FULL, epsWeight: 0.7, lowVolWeight: 0.15, volTarget: 0.22 } },
];

function line(key, r) { return `| ${key.padEnd(30)} | ${pct(r.cagr).padStart(8)} | ${r.sharpeZeroRf.toFixed(2).padStart(5)} | ${pct(r.maxDrawdown).padStart(8)} | ${r.calmar.toFixed(2).padStart(5)} | ${r.tradeCount} |`; }

function main() {
  const universeFile = arg('--universe-file', path.join(ROOT, 'analysis-example/kr-market/strategies/annual-top300/universe-ledger-2015-2025.json'));
  const cacheDir = arg('--cache-dir', L.DATA), panelDir = arg('--dart-panel-dir', L.PANEL);
  const startDate = arg('--start-date', '2017-01-02'), endDate = arg('--end-date', '2026-07-16');
  const isEnd = arg('--is-end', '2022-12-30'), oosStart = arg('--oos-start', '2023-01-02');
  const outDir = arg('--out-dir', path.join(ROOT, 'analysis-example/kr-market/strategies/annual-top300'));
  const label = arg('--label', 'marcap-split');

  const full = buildContext({ universeFile, cacheDir, panelDir, startDate, endDate });
  const results = CANDIDATES.map(({ key, cfg }) => ({ key, cfg, ...runConfig(full, cfg) }));

  console.log(`\n=== REDESIGN CANDIDATES (${label}, ${startDate}~${endDate}) ===`);
  console.log('| candidate                      |     CAGR | Sharp |      MDD | Calmr | trades |');
  console.log('|--------------------------------|---------:|------:|---------:|------:|-------:|');
  for (const r of results) console.log(line(r.key, r));

  // Walk-forward: same fixed configs, split into in-sample and OOS windows.
  const isCtx = buildContext({ universeFile, cacheDir, panelDir, startDate, endDate: isEnd });
  const oosCtx = buildContext({ universeFile, cacheDir, panelDir, startDate: oosStart, endDate });
  const wfKeys = ['FULL (current design)', 'R1 eps.5 regime noVol', 'R3 eps1. regime noVol', 'R5 eps.6 lv.2 regime noVol'];
  const wf = wfKeys.map(key => {
    const cfg = CANDIDATES.find(c => c.key === key).cfg;
    return { key, is: runConfig(isCtx, cfg), oos: runConfig(oosCtx, cfg) };
  });
  console.log(`\n=== WALK-FORWARD (IS ${startDate}~${isEnd} | OOS ${oosStart}~${endDate}) ===`);
  console.log('| candidate                      | IS CAGR | IS Shp |  IS MDD | OOS CAGR | OOSShp | OOS MDD |');
  console.log('|--------------------------------|--------:|-------:|--------:|---------:|-------:|--------:|');
  for (const r of wf) console.log(`| ${r.key.padEnd(30)} | ${pct(r.is.cagr).padStart(7)} | ${r.is.sharpeZeroRf.toFixed(2).padStart(6)} | ${pct(r.is.maxDrawdown).padStart(7)} | ${pct(r.oos.cagr).padStart(8)} | ${r.oos.sharpeZeroRf.toFixed(2).padStart(6)} | ${pct(r.oos.maxDrawdown).padStart(7)} |`);

  const outStem = `strategy-redesign-${label}-${startDate}-through-${endDate}`;
  write(path.join(outDir, `${outStem}.json`), { generatedAt: new Date().toISOString(), label, period: { start: startDate, end: endDate }, priceCache: cacheDir, dartPanel: panelDir, full: FULL, candidates: results.map(({ cfg, ...r }) => ({ ...r, cfg })), walkForward: { isEnd, oosStart, rows: wf } });
  console.log(`\nartifact: ${path.join(outDir, `${outStem}.json`)}`);
}
main();
