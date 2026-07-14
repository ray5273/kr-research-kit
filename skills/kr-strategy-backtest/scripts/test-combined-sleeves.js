#!/usr/bin/env node
'use strict';
const assert = require('assert');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const OUT = path.join(ROOT, 'analysis-example/kr-market/strategies/trend-following-10y');
const x = require(path.join(OUT, 'combined-sleeves-backtest-through-2026-07-10.json'));

// Sleeves and combinations present, with finite metrics.
for (const bag of [x.sleeves, x.combinations]) {
  for (const [name, s] of Object.entries(bag)) {
    assert(Number.isFinite(s.summary.cagr) && Number.isFinite(s.summary.sharpeZeroRf), `${name}: finite metrics`);
    assert(s.dailyEquity.length > 100, `${name}: has an equity path`);
  }
}
// The blend must sit between its sleeves on CAGR (no free lunch beyond the parts).
const mom = x.sleeves.MOM.summary.cagr, lowv = x.sleeves.LOWV.summary.cagr, combo = x.combinations['MOM+LOWV'].summary.cagr;
assert(combo <= Math.max(mom, lowv) + 1e-9 && combo >= Math.min(mom, lowv) - 1e-9, 'MOM+LOWV CAGR is between its sleeves');
// Diversification claim under test: MOM+LOWV Sharpe should beat the momentum sleeve alone.
assert(x.combinations['MOM+LOWV'].summary.sharpeZeroRf >= x.sleeves.MOM.summary.sharpeZeroRf - 1e-9, 'MOM+LOWV Sharpe >= MOM sleeve (diversification)');
// Correlations recorded and in a sane range.
for (const [k, v] of Object.entries(x.correlations)) assert(v > -1.01 && v < 1.01, `${k} correlation in [-1,1]`);
// Cost model reflects the sell tax.
assert(x.commonRules.cost.sellBps > x.commonRules.cost.buyBps, 'sell leg costs more than buy (tax modeled)');
assert(x.stats['MOM+LOWV'].ci && x.stats['MOM+LOWV'].deflated, 'CI + deflated Sharpe attached');
console.log(JSON.stringify({ pass: true, momSharpe: x.sleeves.MOM.summary.sharpeZeroRf, momLowvSharpe: x.combinations['MOM+LOWV'].summary.sharpeZeroRf, momLowvMdd: x.combinations['MOM+LOWV'].summary.maxDrawdown, corr: x.correlations }, null, 2));
