#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
  deriveHoldingCycles,
  summarizeCycles,
} = require('./analyze-52w-high-yearly-win-payoff.js');

const prices = new Map([
  ['A:2025-01-02', 100],
  ['A:2025-02-03', 120],
  ['A:2025-03-04', 110],
  ['A:2025-04-01', 130],
  ['B:2025-05-02', 100],
  ['B:2025-06-02', 90],
  ['C:2025-07-01', 50],
]);
const markPrices = new Map([['C:2025-07-31', 60]]);
const trade = (date, ticker, side, shares, price, costRate) => ({
  date,
  ticker,
  side,
  notional: shares * price,
  estimatedCost: shares * price * costRate,
});
const trades = [
  trade('2025-01-02', 'A', 'BUY', 10, 100, 0.0025),
  trade('2025-02-03', 'A', 'SELL', 5, 120, 0.0043),
  trade('2025-03-04', 'A', 'BUY', 2, 110, 0.0025),
  trade('2025-04-01', 'A', 'SELL', 7, 130, 0.0043),
  trade('2025-05-02', 'B', 'BUY', 4, 100, 0.0025),
  trade('2025-06-02', 'B', 'SELL', 4, 90, 0.0043),
  trade('2025-07-01', 'C', 'BUY', 2, 50, 0.0025),
];

const result = deriveHoldingCycles({
  trades,
  getTradePrice: row => prices.get(`${row.ticker}:${row.date}`),
  getMarkPrice: (ticker, date) => markPrices.get(`${ticker}:${date}`),
  getName: ticker => `Name ${ticker}`,
  endDate: '2025-07-31',
  hypotheticalSellCostRate: 0.0043,
});

assert.strictEqual(result.completed.length, 2);
assert.strictEqual(result.openMarked.length, 1);
assert.strictEqual(result.unmarkable.length, 0);

const a = result.completed.find(cycle => cycle.ticker === 'A');
const b = result.completed.find(cycle => cycle.ticker === 'B');
const c = result.openMarked[0];
assert(Math.abs(a.netPnl - 280.457) < 1e-9);
assert(Math.abs(a.costBasis - 1223.05) < 1e-9);
assert(Math.abs(b.netPnl - (-42.548)) < 1e-9);
assert(Math.abs(c.netPnl - 19.234) < 1e-9);

const summary = summarizeCycles(result.completed);
assert.strictEqual(summary.cycleCount, 2);
assert.strictEqual(summary.wins, 1);
assert.strictEqual(summary.losses, 1);
assert.strictEqual(summary.winRate, 0.5);
assert(summary.payoffRatio > 2);

console.log('52w-high yearly win/payoff tests passed');
