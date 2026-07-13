#!/usr/bin/env node
'use strict';
const assert = require('assert');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const OUT = path.join(ROOT, 'analysis-example/kr-market/strategies/trend-following-10y');
const x = require(path.join(OUT, 'value-momentum-backtest-through-2026-07-10.json'));

for (const [name, s] of Object.entries(x.strategies)) {
  assert(s.monthlySelections.every(m => m.holdings.length <= 10), `${name}: holdings cap`);
  assert(s.trades.every(t => t.date > t.signalDate), `${name}: next-session execution (no look-ahead)`);
  assert(s.trades.every(t => /^\d{6}$/.test(t.ticker)), `${name}: ticker format`);
  const vs = s.monthlySelections.flatMap(m => m.holdings).map(h => h.valueScore).filter(v => v !== null);
  assert(vs.length && vs.every(v => v >= 0 && v <= 1.0000001), `${name}: value score in [0,1]`);
}
// At least one value signal must exist on every populated holding.
const holds = x.strategies.valuePure.monthlySelections.flatMap(m => m.holdings);
assert(holds.length, 'valuePure produced holdings');
assert(holds.every(h => h.earningsYield !== null || h.bookYield !== null), 'every value holding has E/P or B/P');
assert(x.data.hashes.priceManifestSha256 && x.data.hashes.dartPanelManifestSha256, 'input hashes present');
assert(x.period.outOfSampleStart === '2023-07-11', 'out-of-sample cut recorded');
console.log(JSON.stringify({ pass: true, strategies: Object.keys(x.strategies), valuePureCagr: x.strategies.valuePure.summary.cagr, valueMom252Cagr: x.strategies.value_mom252.summary.cagr }, null, 2));
