#!/usr/bin/env node
'use strict';
const assert = require('assert');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const OUT = path.join(ROOT, 'analysis-example/kr-market/strategies/trend-following-10y');
const x = require(path.join(OUT, 'low-volatility-backtest-through-2026-07-10.json'));

for (const [name, s] of Object.entries(x.strategies)) {
  assert(s.monthlySelections.every(m => m.holdings.length <= 10), `${name}: holdings cap`);
  assert(s.trades.every(t => t.date > t.signalDate), `${name}: next-session execution (no look-ahead)`);
  assert(s.trades.every(t => /^\d{6}$/.test(t.ticker)), `${name}: ticker format`);
  const vols = s.monthlySelections.flatMap(m => m.holdings).map(h => h.annualizedVol).filter(v => v !== null);
  assert(vols.length && vols.every(v => v > 0 && Number.isFinite(v)), `${name}: annualized vol positive`);
}
// The pure low-vol sleeve should hold materially lower realized vol than the
// market benchmark's volatility — the whole point of the factor.
const lowVol120 = x.strategies.volLow120.summary.annualizedVolatility;
assert(lowVol120 < x.benchmark.summary.annualizedVolatility, `low-vol portfolio vol (${lowVol120}) should be < benchmark`);
assert(x.data.hashes.priceManifestSha256 && x.data.hashes.dartPanelManifestSha256, 'input hashes present');
assert(x.period.outOfSampleStart === '2023-07-11', 'out-of-sample cut recorded');
console.log(JSON.stringify({ pass: true, strategies: Object.keys(x.strategies), lowVol120PortfolioVol: lowVol120, benchmarkVol: x.benchmark.summary.annualizedVolatility }, null, 2));
