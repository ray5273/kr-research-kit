#!/usr/bin/env node
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { validateAndPrepare, runPitBacktest, writeArtifacts } = require('./run-top500-minervini');
const fixturePaths = [];
process.on('exit', () => fixturePaths.forEach(file => fs.rmSync(file, { force: true })));

const days = Array.from({ length: 340 }, (_, i) => new Date(Date.UTC(2023, 0, 2 + i)).toISOString().slice(0, 10));
const spy = days.map((d, i) => ({ date: d, prc: 100 + i, openprc: 100 + i, ret: i ? .001 : 0 }));
const names = ['10001', '10002', '10003', '10004'].map((permno, i) => ({ permno, namedt: days[0], nameendt: '9999-12-31', ticker: ['AAA', 'BBB', 'BAD', 'NEW'][i], permco: String(900 + i) }));
const ccm = ['10001', '10002'].map((permno, i) => ({ lpermno: permno, gvkey: `00${i + 1}`, linkdt: days[0], linkenddt: '9999-12-31', linktype: 'LC', linkprim: 'P' }));
const facts = ['001', '002'].flatMap((gvkey, n) => Array.from({ length: 8 }, (_, i) => ({ gvkey, datadate: days[10 + i * 40], rdq: days[11 + i * 40], saleq: 100 + i * 10 + n, epsfxq: 1 + i * .1 + n * .01 })));
const prices = ['10001', '10002', '10003'].flatMap((permno, n) => days.map((d, i) => ({ permno, date: d, prc: 10 + i * (n === 1 ? .08 : .1), openprc: 10 + i * (n === 1 ? .08 : .1), shrout: n === 2 ? 999999 : (permno === '10002' ? (i < 260 ? 2000 : 500) : 1000), exchcd: n === 2 ? 4 : 1, shrcd: 10, ret: i > 253 ? (i % 2 ? .015 : -.01) : .002, dlret: permno === '10001' && i === 260 ? -.5 : '' })));
prices.push(...days.slice(260).map(d => ({ permno: '10004', date: d, prc: 100, openprc: 100, shrout: 10000, exchcd: 1, shrcd: 10, ret: .002, dlret: '' })));
const config = { startDate: days[253], endDate: days[338], outOfSampleStart: days[323], cadence: 'weekly', topUniverse: 500, topHoldings: 1, targetAnnualVolatility: .10, fundamentalAvailabilityLagSessions: 1 };
const prepared = validateAndPrepare({ prices: writeFree(prices), names: writeFree(names), ccm: writeFree(ccm), fundamentals: writeFree(facts), spy: writeFree(spy) }, config);
const result = runPitBacktest(prepared, config);
assert(result.universeLedger.length >= 2, 'reconstitutes every signal');
assert(result.universeLedger.every(x => !x.top500Permnos.includes('10003')), 'exchange filter is applied before market-cap ranking');
assert(result.universeLedger.some(x => x.entries.some(e => e.permno === '10001' && e.current && e.current.availableDate > e.current.rdq)), 'fundamentals have a delayed availability date');
assert(result.trades.every(x => x.date > x.signalDate), 'signal executes next session open');
assert(result.delistings.some(x => x.permno === '10001' && x.dlret === -.5), 'DLRET is applied to a held security');
assert(result.dailyEquity.every(x => x.cash >= -1e-5), 'long-only cash never becomes negative');
assert(result.trades.some(x => x.targetExposure > 0 && x.targetExposure < 1), '60-session realised volatility caps exposure below 100%');
assert(result.outOfSample.sessions < result.fullPeriod.sessions && result.outOfSample.sessions > 1, 'OOS is a distinct fixed interval');
const flatSpy = prepared.spy.map(row => ({ ...row, prc: 100, ret: 0 }));
const reconstituted = runPitBacktest({ ...prepared, spy: flatSpy }, { ...config, topUniverse: 1 });
assert.notDeepStrictEqual(reconstituted.universeLedger[0].top500Permnos, reconstituted.universeLedger.at(-1).top500Permnos, 'top market-cap membership is recomputed, not a current-membership substitute');
const artifactDir = path.join('/private/tmp', `pit-artifact-${process.pid}`), artifacts = writeArtifacts(result, artifactDir);
assert(fs.existsSync(artifacts.jsonPath) && fs.existsSync(artifacts.ledgerPath) && fs.existsSync(artifacts.mdPath), 'JSON, ledger, and Markdown artifacts are emitted');
fs.rmSync(artifactDir, { recursive: true, force: true });
// Link ambiguity is fatal, preventing a hidden current-gvkey substitution.
const ambiguous = validateAndPrepare({ prices: writeFree(prices), names: writeFree(names), ccm: writeFree([...ccm, { ...ccm[0], gvkey: '009', linkdt: days[0] }]), fundamentals: writeFree([...facts, { ...facts[0], gvkey: '009' }]), spy: writeFree(spy) }, config);
assert.throws(() => runPitBacktest(ambiguous, config), /ambiguous/);
console.log('ok: PIT market cap, exchange/share filter, CCM history, RDQ delay, DLRET, next-open, OOS, volatility cap, no leverage');

function writeFree(data) {
  // validateAndPrepare accepts arrays only through a JSON file; deterministic fixture files live under /private/tmp.
  const file = path.join('/private/tmp', `pit-${process.pid}-${Math.random().toString(36).slice(2)}.json`);
  fs.writeFileSync(file, JSON.stringify(data)); fixturePaths.push(file); return file;
}
