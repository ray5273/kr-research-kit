#!/usr/bin/env node
'use strict';
const assert = require('assert');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const OUT = path.join(ROOT, 'analysis-example/kr-market/strategies/trend-following-10y');
const x = require(path.join(OUT, 'managed-momentum-backtest-through-2026-07-10.json'));

for (const [name, v] of Object.entries(x.strategies)) {
  const rawMdd = v.raw.summary.maxDrawdown, rawCrash = v.raw.crashReturn;
  const grid = Object.values(v.grid);
  assert(grid.length === 16, `${name}: 4x4 grid present`);
  // No leverage: managed exposure caps at 1, so managed vol never exceeds raw vol.
  for (const g of grid) assert(g.summary.annualizedVolatility <= v.raw.summary.annualizedVolatility + 1e-9, `${name} ${g.volWindow}/${g.target}: managed vol <= raw vol (no leverage)`);
  // Defense direction: every managed config's MDD is no worse than raw.
  for (const g of grid) assert(g.summary.maxDrawdown >= rawMdd - 1e-9, `${name} ${g.volWindow}/${g.target}: managed MDD not worse than raw`);
  // The crash window: at least one config reduces the loss AND cut exposure during it.
  const helped = grid.filter(g => g.crashReturn > rawCrash + 1e-6 && g.crashAvgExposure < 1);
  assert(helped.length, `${name}: at least one config cut crash loss with reduced exposure`);
  // Short window + reasonable target should react (lower crash exposure than a long window).
  const w21t20 = v.grid['w21_t20'], w126t20 = v.grid['w126_t20'];
  assert(w21t20.crashAvgExposure <= w126t20.crashAvgExposure + 1e-9, `${name}: 21d window de-risks the crash at least as much as 126d`);
}
assert(x.commonRules.cost.sellBps > x.commonRules.cost.buyBps, 'sell tax modeled');
assert(x.data.hashes.priceManifestSha256 && x.data.hashes.dartPanelManifestSha256, 'input hashes present');
assert(x.crashWindow.start === '2026-06-22', 'crash window recorded');
console.log(JSON.stringify({ pass: true, strategies: Object.keys(x.strategies) }, null, 2));
