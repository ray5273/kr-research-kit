#!/usr/bin/env node
'use strict';

// Regression fixtures for the strict total-return contract.  These are small
// enough to review by hand and cover both adjusted signal continuity and the
// actual cash/share accounting used at the next open.

const assert = require('assert');
const O = require('./lib/official-total-return.js');
const A = require('./lib/annual-top300-universe.js');
const OfficialRunner = require('./run-official-total-return-backtest.js');
const source = publisher => ({ publisher, url: `https://official.example/${publisher.toLowerCase()}`, sha256: publisher === 'KRX' ? 'a'.repeat(64) : 'b'.repeat(64) });
const event = (id, type, extra = {}) => ({ id, type, effectiveDate: '2020-01-02', securityId: 'SEC-A', verificationStatus: 'verified', sources: [source('KRX'), source('DART')], ...extra });
const raw = (previous = 100, current = 100) => [{ date: '2020-01-01', open: previous, high: previous, low: previous, close: previous }, { date: '2020-01-02', open: current, high: current, low: current, close: current }];
const adjusted = e => O.buildTotalReturnOHLC(raw(e.previous ?? 100, e.current ?? 100), [e], 'SEC-A').totalReturnOHLC;

// Signal adjustment fixtures: the before/after total-return close must be
// continuous when the raw ex-date price moves only for the stated action.
let e = event('split', 'stock_split', { shareRatio: 2, current: 50 });
assert.equal(adjusted(e)[0].close, 50); assert.equal(adjusted(e)[1].close, 50);
e = event('reverse', 'reverse_split', { shareRatio: .5, previous: 50, current: 100 });
assert.equal(adjusted(e)[0].close, 100); assert.equal(adjusted(e)[1].close, 100);
e = event('reduction', 'capital_reduction', { shareRatio: .5, previous: 50, current: 100 });
assert.equal(adjusted(e)[0].close, 100); assert.equal(adjusted(e)[1].close, 100);
e = event('cash', 'cash_dividend', { cashPerShare: 5, current: 95 });
assert.equal(adjusted(e)[0].close, 95); assert.equal(adjusted(e)[1].close, 95);
e = event('stock-dividend', 'stock_dividend', { shareRatio: 1.1, current: 100 / 1.1 });
assert(Math.abs(adjusted(e)[0].close - 100 / 1.1) < 1e-9); assert(Math.abs(adjusted(e)[1].close - 100 / 1.1) < 1e-9);
e = event('rights', 'rights_issue', { rightsPerShare: 1, subscriptionPrice: 50, participation: 'fully-subscribed', current: 75 });
assert.equal(adjusted(e)[0].close, 75); assert.equal(adjusted(e)[1].close, 75);

function apply(one, positions = new Map([['SEC-A', 10]]), cash = 0) { return O.applyEventsToPortfolio({ positions, cash, events: [one], date: '2020-01-02' }); }
let pos = new Map([['SEC-A', 10]]); apply(event('p-split', 'stock_split', { shareRatio: 2 }), pos); assert.equal(pos.get('SEC-A'), 20);
pos = new Map([['SEC-A', 10]]); let result = apply(event('p-reduction', 'capital_reduction', { shareRatio: .5, cashPerShare: 7, adjustmentFactor: 2 }), pos); assert.equal(pos.get('SEC-A'), 5); assert.equal(result.cash, 70);
pos = new Map([['SEC-A', 10]]); result = apply(event('p-cash', 'cash_dividend', { cashPerShare: 5 }), pos); assert.equal(result.cash, 50);
pos = new Map([['SEC-A', 10]]); result = apply(event('p-rights', 'rights_issue', { rightsPerShare: 1, subscriptionPrice: 50, participation: 'fully-subscribed' }), pos); assert.equal(pos.get('SEC-A'), 20); assert.equal(result.cash, -500);
pos = new Map([['SEC-A', 10]]); apply(event('rename', 'ticker_change', { oldSecurityId: 'SEC-A', newSecurityId: 'SEC-B' }), pos); assert.equal(pos.get('SEC-A'), undefined); assert.equal(pos.get('SEC-B'), 10);
pos = new Map([['SEC-A', 10]]); result = apply(event('merger', 'merger', { consideration: [{ securityId: 'SEC-B', sharesPerOldShare: .5 }, { cashPerShare: 3 }] }), pos); assert.equal(pos.get('SEC-B'), 5); assert.equal(result.cash, 30);
pos = new Map([['SEC-A', 10]]); result = apply(event('spin', 'spin_off', { consideration: [{ securityId: 'SEC-A', sharesPerOldShare: 1 }, { securityId: 'SEC-C', sharesPerOldShare: .2 }] }), pos); assert.equal(pos.get('SEC-A'), 10); assert.equal(pos.get('SEC-C'), 2);
pos = new Map([['SEC-A', 10]]); result = apply(event('delist', 'delisting', { cashPerShare: 12 }), pos); assert.equal(pos.has('SEC-A'), false); assert.equal(result.cash, 120);

// A missing official proof, unresolved status, or delisting consideration
// cannot be promoted to a successful strict run.
assert.throws(() => O.validateLedger({ schemaVersion: 1, events: [{ ...event('bad', 'cash_dividend', { cashPerShare: 1 }), verificationStatus: 'pending' }] }, ['SEC-A']), /not verified/);
assert.throws(() => O.validateLedger({ schemaVersion: 1, events: [event('bad-delist', 'delisting')] }, ['SEC-A']), /cash consideration/);
assert.throws(() => O.validateLedger({ schemaVersion: 1, events: [{ ...event('bad-source', 'cash_dividend', { cashPerShare: 1 }), sources: [source('KRX')] }] }, ['SEC-A']), /KRX and DART/);

const snapshot = A.normaliseSnapshot({ rankingYear: 2015, asOfDate: '2015-12-30', sourceSha256: 'c'.repeat(64), rawTop300Count: 10, constituents: Array.from({ length: 10 }, (_, i) => ({ rank: i + 1, ticker: String(100000 + i), name: `보통주${i}`, market: 'KOSPI' })) });
const coverage = A.coverageLedger({ snapshots: [snapshot] }, ticker => ticker !== '100009'); assert.doesNotThrow(() => A.assertPriceCoverage(coverage));
const failedCoverage = A.coverageLedger({ snapshots: [snapshot] }, ticker => !['100008', '100009'].includes(ticker)); assert.throws(() => A.assertPriceCoverage(failedCoverage), /below 90%/);

// End-to-end execution fixture: a year boundary forces a liquidation and
// rebuild on the next open, five-session scheduling is retained, and a DART
// report dated on the signal session cannot leak into that selection.
const dates = []; for (let d = new Date('2016-01-04T00:00:00Z'); dates.length < 280; d.setUTCDate(d.getUTCDate() + 1)) if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) dates.push(d.toISOString().slice(0, 10));
const tickers = Array.from({ length: 10 }, (_, i) => String(200000 + i));
const makeBars = offset => dates.map((date, i) => { const p = 100 + offset + i * .1; return { date, open: p, high: p, low: p, close: p }; });
const allStates = new Map(), byTicker = new Map();
for (let i = 0; i < tickers.length; i++) { const state = { securityId: `S${i}`, ticker: tickers[i], name: `보통주${i}`, bars: makeBars(i) }; allStates.set(state.securityId, state); byTicker.set(state.ticker, state); }
const constituents = tickers.map((ticker, i) => ({ rank: i + 1, ticker, name: `보통주${i}`, market: 'KOSPI' }));
const u2015 = A.normaliseSnapshot({ rankingYear: 2015, asOfDate: '2015-12-30', sourceSha256: 'd'.repeat(64), rawTop300Count: 10, constituents });
const u2016 = A.normaliseSnapshot({ rankingYear: 2016, asOfDate: '2016-12-29', sourceSha256: 'e'.repeat(64), rawTop300Count: 10, constituents });
const executionUniverse = { snapshots: [u2015, u2016], byYear: new Map([[2015, u2015], [2016, u2016]]) };
const reports = [{ year: 2014, quarter: 4, filing: '2015-12-01', revenue: 80, eps: 8 }, { year: 2015, quarter: 3, filing: '2015-12-01', revenue: 90, eps: 9 }, { year: 2015, quarter: 4, filing: '2015-12-01', revenue: 100, eps: 10 }, { year: 2016, quarter: 3, filing: '2016-12-01', revenue: 110, eps: 11 }, { year: 2016, quarter: 4, filing: '2016-12-30', revenue: 120, eps: 12 }];
const strategy = OfficialRunner.runStrategy({ universe: executionUniverse, allStates, byTicker, calendar: dates, kospi: { bars: makeBars(0) }, series: new Map(tickers.map(ticker => [ticker, reports])), events: [] });
const roll = strategy.rebalancingLedger.find(x => x.forcedAnnualRoll); assert(roll, 'first 2017 session is an annual forced roll');
assert(strategy.trades.some(t => t.reason === 'annual-universe-liquidation' && t.forcedAnnualRoll), 'annual roll sells existing holdings with sell tax');
assert(strategy.trades.every(t => !t.signalDate || t.date > t.signalDate), 'all selected orders execute at a later next-session open');
assert(strategy.rebalancingLedger.every((row, i, rows) => i === 0 || (Date.parse(row.executionDate) - Date.parse(rows[i - 1].executionDate)) >= 24 * 3600 * 1000), 'five-session scheduler never produces same-session orders');
assert(roll.holdings.every(h => h.reportFilingDate === '2016-12-01'), 'DART report filed on 2016-12-30 is unavailable to the 2017-01-02 execution');
assert(strategy.benchmark.dailyEquity.some(x => x.rankingYear === 2016), 'benchmark reconstitutes with the annual universe');

console.log(JSON.stringify({ pass: true, fixtures: ['split', 'reverse_split', 'capital_reduction', 'rights_issue', 'cash_dividend', 'stock_dividend', 'ticker_change', 'merger', 'spin_off', 'delisting'], strictGates: ['unverified-event', 'missing-delisting-consideration', 'missing-dual-source', 'price-coverage'], executionRegression: ['DART one-session lag', 'next-open execution', 'sell tax at annual roll', 'five-session rebalancing', 'annual total-return benchmark'] }, null, 2));
