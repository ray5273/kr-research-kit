#!/usr/bin/env node
'use strict';
const assert = require('assert');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const OUT = path.join(ROOT, 'analysis-example/kr-market/strategies/trend-following-10y');
const x = require(path.join(OUT, 'piotroski-fscore-backtest-through-2026-07-10.json'));

for (const [name, s] of Object.entries(x.strategies)) {
  assert(s.monthlySelections.every(m => m.holdings.length <= 10), `${name}: holdings cap`);
  assert(s.trades.every(t => t.date > t.signalDate), `${name}: next-session execution (no look-ahead)`);
  assert(s.trades.every(t => /^\d{6}$/.test(t.ticker)), `${name}: ticker format`);
  const fs = s.monthlySelections.flatMap(m => m.holdings).map(h => h.fScore);
  assert(fs.length && fs.every(v => Number.isInteger(v) && v >= 0 && v <= 9), `${name}: F-score integer in [0,9]`);
  const ev = s.monthlySelections.flatMap(m => m.holdings).map(h => h.evaluable);
  assert(ev.every(v => v >= 7 && v <= 9), `${name}: evaluable signals >= 7`);
}
// The F>=7 quality gate must never admit a sub-7 name.
const gated = x.strategies.pFilterMom.monthlySelections.flatMap(m => m.holdings);
assert(gated.length && gated.every(h => h.fScore >= 7), 'pFilterMom holds only F>=7 names');
assert(x.commonRules.fScoreGate === 7, 'F-score gate recorded');
// M2: strict variant holds only fully-evaluable (9-signal) names.
assert(x.strategies.pStrict9, 'pStrict9 variant present');
assert(x.strategies.pStrict9.monthlySelections.flatMap(m => m.holdings).every(h => h.evaluable === 9), 'pStrict9 holds only 9-signal names');
assert(x.evaluableDistribution && (x.evaluableDistribution['9'] || x.evaluableDistribution[9]) > 0, 'evaluable distribution recorded');
// Corrected-methodology invariants.
assert(x.benchmarkTotalReturn && x.benchmarkTotalReturn.summary.cagr > x.benchmarkPriceIndex.summary.cagr, 'total-return benchmark > price-index (C2)');
assert(x.commonRules.cost.sellBps > x.commonRules.cost.buyBps, 'sell tax modeled (C3)');
assert(x.data.hashes.priceManifestSha256 && x.data.hashes.dartPanelManifestSha256, 'input hashes present');
assert(x.period.outOfSampleStart === '2023-07-11', 'out-of-sample cut recorded');
console.log(JSON.stringify({ pass: true, strategies: Object.keys(x.strategies), pFilterMomCagr: x.strategies.pFilterMom.summary.cagr, pPureCagr: x.strategies.pPure.summary.cagr }, null, 2));
