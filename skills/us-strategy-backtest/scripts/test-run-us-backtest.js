#!/usr/bin/env node
'use strict';
const assert = require('assert');
const { filterListings, normalizeYahoo, runEngine } = require('./run-us-backtest');

const listing = filterListings(
  'Symbol|Security Name|Market Category|Test Issue|Financial Status|Round Lot Size|ETF\nAAA|AAA Common Stock|Q|N|N|100|N\nETF|ETF Fund|Q|N|N|100|Y\nADR|Foreign ADR|Q|N|N|100|N\nTST|Test Corp|Q|Y|N|100|N',
  'ACT Symbol|Security Name|Exchange|CQS Symbol|ETF|Round Lot Size|Test Issue\nBBB|BBB Common Stock|N|BBB|N|100|N\nPRF|Preferred Shares|N|PRF|N|100|N'
);
assert.deepStrictEqual(listing.symbols.map(x => x.ticker), ['AAA', 'BBB']);
const normalized = normalizeYahoo(JSON.stringify({chart:{result:[{timestamp:[1704067200],indicators:{quote:[{open:[100],high:[110],low:[90],close:[100],volume:[20000]}],adjclose:[{adjclose:[50]}]}}]}}), 'AAA');
assert.strictEqual(normalized[0].open, 50); assert.strictEqual(normalized[0].close, 50);

const dates = Array.from({length: 28}, (_, i) => `2024-01-${String(i + 1).padStart(2, '0')}`);
const bars = [], spy = [];
for (let i=0;i<dates.length;i++) {
  bars.push({date:dates[i],ticker:'AAA',open:10+i,high:11+i,low:9+i,close:10+i,volume:200000,dollarVolume:(10+i)*200000});
  bars.push({date:dates[i],ticker:'BBB',open:20,high:21,low:19,close:20-(i*.05),volume:200000,dollarVolume:4000000});
  bars.push({date:dates[i],ticker:'CHEAP',open:2,high:3,low:1,close:2,volume:1000000,dollarVolume:2000000});
  bars.push({date:dates[i],ticker:'ILLIQ',open:30,high:31,low:29,close:30,volume:10,dollarVolume:300});
  spy.push({date:dates[i],ticker:'SPY',open:100+i,high:101+i,low:99+i,close:100+i,volume:1,dollarVolume:1});
}
const r = runEngine(bars, spy, {name:'fixture',strategy:{type:'cross-sectional-momentum',lookbackDays:20,topN:1,rebalanceEvery:21},startDate:dates[0],endDate:dates.at(-1),outOfSampleStart:dates[25],initialCapital:100000,tradingCostBps:10,minAdjustedClose:5,minAverageDollarVolume:1000000});
assert(r.trades.length >= 1); assert.strictEqual(r.trades[0].signalDate, dates[20]); assert.strictEqual(r.trades[0].date, dates[21], 'must execute next session');
assert.strictEqual(r.trades[0].ticker, 'AAA'); assert(r.trades[0].cost > 0); assert(r.equity.every(x => x.cash > -1e-5), 'no leverage');
assert(r.eligibilityExclusions.some(x=>x.ticker==='CHEAP'&&x.reason==='price')); assert(r.eligibilityExclusions.some(x=>x.ticker==='ILLIQ'&&x.reason==='liquidity'));
assert(r.spySummary.sessions > 1 && r.outOfSampleSummary && r.spyOutOfSampleSummary);
console.log('ok: listing filters, adjustment, liquidity, next-open, costs, SPY, OOS');
