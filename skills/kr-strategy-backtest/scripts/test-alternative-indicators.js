#!/usr/bin/env node
'use strict';
const assert = require('assert');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const OUT = path.join(ROOT, 'analysis-example/kr-market/strategies/trend-following-10y');
const x = require(path.join(OUT, 'alternative-indicators-backtest-through-2026-07-10.json'));
for (const [name, s] of Object.entries(x.strategies)) {
  assert(s.monthlySelections.every(m => m.holdings.length <= 10), `${name}: holdings cap`);
  assert(s.trades.every(t => t.date > t.signalDate), `${name}: next-session execution`);
  assert(s.trades.every(t => /^\d{6}$/.test(t.ticker)), `${name}: ticker format`);
}
const high = x.strategies['52wHigh'].monthlySelections.flatMap(m => m.holdings).map(h => h.highProximity).filter(v => v !== null);
assert(high.length && high.every(v => v > 0 && v <= 1.0000001), '52-week high proximity range');
const vol = x.strategies.volAdjusted.monthlySelections.flatMap(m => m.holdings).map(h => h.volAdjusted).filter(v => v !== null);
assert(vol.length && vol.every(Number.isFinite), 'volatility-adjusted momentum finite');
assert(x.data.hashes.priceManifestSha256 && x.data.hashes.dartPanelManifestSha256, 'input hashes');
const old = require(path.join(OUT, 'fundamental-momentum-holdings-sensitivity-through-2026-07-10.json')).strategies['10'].summary;
const delta = Math.abs(x.strategies.baseline.summary.cagr - old.cagr);
assert(delta < 0.01, `baseline CAGR regression delta ${delta}`);
console.log(JSON.stringify({ pass: true, maxHoldings: 10, tradeDateViolations: 0, baselineCagrDelta: delta }, null, 2));
