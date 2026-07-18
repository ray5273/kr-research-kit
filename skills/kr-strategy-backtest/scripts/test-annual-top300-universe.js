#!/usr/bin/env node
'use strict';

const assert = require('assert');
const A = require('./lib/annual-top300-universe.js');

const rows = (year, suffix) => [
  { rank: 1, ticker: `0000${suffix}0`, name: `보통주${suffix}`, market: 'KOSPI', marketCap: 10 },
  { rank: 2, ticker: `0000${suffix}1`, name: `우선주${suffix}우`, market: 'KOSPI', marketCap: 9 },
  { rank: 3, ticker: `0000${suffix}2`, name: `ETF ${suffix}`, market: 'KOSPI', marketCap: 8 },
  { rank: 4, ticker: `0000${suffix}3`, name: `보통주B${suffix}`, market: 'KOSDAQ', marketCap: 7 },
];
const s2015 = A.normaliseSnapshot({ rankingYear: 2015, asOfDate: '2015-12-30', rawTop300Count: 4, sourceSha256: 'a'.repeat(64), constituents: rows(2015, '1') });
const s2016 = A.normaliseSnapshot({ rankingYear: 2016, asOfDate: '2016-12-29', rawTop300Count: 4, sourceSha256: 'b'.repeat(64), constituents: rows(2016, '2') });
const universe = { byYear: new Map([[2015, s2015], [2016, s2016]]), snapshots: [s2015, s2016] };

assert.equal(s2015.commonShareCount, 2, 'preferred shares and ETFs are removed before ranking');
assert.equal(A.ordinaryShare({ ticker: '005935', name: '삼성전자우', market: 'KOSPI' }), false, '우 suffix preferred shares are removed');
assert.equal(A.ordinaryShare({ ticker: '138040', name: '메리츠금융지주', market: 'KOSPI' }), true, '메리츠금융지주는 리츠가 아닌 보통주다');
assert.equal(A.ordinaryShare({ ticker: '395400', name: 'SK리츠', market: 'KOSPI' }), false, '실제 리츠는 제외한다');
assert.deepEqual([...A.eligibleTickers(universe, '2016-07-11')], ['000010', '000013'], '2015 snapshot applies in 2016');
assert.deepEqual([...A.eligibleTickers(universe, '2017-01-02')], ['000020', '000023'], '2016 snapshot applies from first 2017 session');
assert.equal(A.isAnnualRollDate(['2016-12-29', '2017-01-02'], 1), true, 'first session of year is an annual roll');
assert.equal(A.isAnnualRollDate(['2017-01-02', '2017-01-03'], 1), false, 'subsequent session is not an annual roll');

const pass = A.coverageLedger(universe, () => true);
assert(pass.every(x => x.priceCoveragePass), 'complete price coverage passes');
// A real Top-300 is the relevant denominator: verify the 90% guard directly.
const large = A.normaliseSnapshot({ rankingYear: 2017, asOfDate: '2017-12-28', rawTop300Count: 10, sourceSha256: 'c'.repeat(64), constituents: Array.from({ length: 10 }, (_, i) => ({ rank: i + 1, ticker: String(100000 + i), name: `보통주${i}`, market: 'KOSPI' })) });
const exactThreshold = A.coverageLedger({ snapshots: [large] }, ticker => ticker !== '100009');
assert.doesNotThrow(() => A.assertPriceCoverage(exactThreshold), 'exactly 90% is allowed');
const below = A.coverageLedger({ snapshots: [large] }, ticker => !['100008', '100009'].includes(ticker));
assert.throws(() => A.assertPriceCoverage(below), /below 90%/, 'price coverage failure stops execution');

console.log(JSON.stringify({ pass: true, filtering: s2015.commonShareCount, first2016Universe: [...A.eligibleTickers(universe, '2016-07-11')], first2017Universe: [...A.eligibleTickers(universe, '2017-01-02')] }, null, 2));
