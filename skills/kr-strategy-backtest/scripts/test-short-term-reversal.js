#!/usr/bin/env node
'use strict';
const assert = require('assert');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const OUT = path.join(ROOT, 'analysis-example/kr-market/strategies/trend-following-10y');
const x = require(path.join(OUT, 'short-term-reversal-backtest-through-2026-07-10.json'));

for (const [name, s] of Object.entries(x.strategies)) {
  assert(s.monthlySelections.every(m => m.holdings.length <= 10), `${name}: holdings cap`);
  assert(s.trades.every(t => t.date > t.signalDate), `${name}: next-session execution (no look-ahead)`);
  assert(s.trades.every(t => /^\d{6}$/.test(t.ticker)), `${name}: ticker format`);
  const r = s.monthlySelections.flatMap(m => m.holdings).map(h => h.ret21).filter(v => v !== null);
  assert(r.length && r.every(Number.isFinite), `${name}: 21-day return finite`);
}
// Reversal buys losers: the median selected 1-month return should be negative,
// and clearly below the cross-sectional average.
const pure = x.strategies.revPure.monthlySelections.flatMap(m => m.holdings).map(h => h.ret21);
const sorted = [...pure].sort((a, b) => a - b), medianRet = sorted[sorted.length >> 1];
assert(medianRet < 0, `reversal picks losers (median selected ret21 ${medianRet} should be < 0)`);
// Quality filter must not increase, and generally shrinks, the candidate pool.
const qCand = x.strategies.revQuality.monthlySelections.map(m => m.candidates);
const pCand = x.strategies.revPure.monthlySelections.map(m => m.candidates);
assert(qCand.every((c, i) => c <= pCand[i]), 'revQuality candidate pool <= revPure');
// Corrected-methodology invariants: sell tax should have bitten this high-turnover strategy.
assert(x.benchmarkTotalReturn && x.benchmarkTotalReturn.summary.cagr > x.benchmarkPriceIndex.summary.cagr, 'total-return benchmark > price-index (C2)');
assert(x.commonRules.cost.sellBps > x.commonRules.cost.buyBps, 'sell tax modeled (C3)');
assert(x.augmentation.strategyStats.revEps.deflated, 'deflated Sharpe attached (H1)');
assert(x.data.hashes.priceManifestSha256 && x.data.hashes.dartPanelManifestSha256, 'input hashes present');
assert(x.period.outOfSampleStart === '2023-07-11', 'out-of-sample cut recorded');
console.log(JSON.stringify({ pass: true, strategies: Object.keys(x.strategies), medianSelectedRet21: medianRet, revPureCagr: x.strategies.revPure.summary.cagr, revPureTurnover: x.strategies.revPure.summary.turnover }, null, 2));
