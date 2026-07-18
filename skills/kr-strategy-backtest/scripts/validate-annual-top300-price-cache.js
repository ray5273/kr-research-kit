#!/usr/bin/env node
'use strict';

// Independent gate for Yahoo comparison caches.  Fetching is deliberately
// separate from validation so a network interruption cannot be published as a
// smaller universe.

const fs = require('fs');
const path = require('path');
const A = require('./lib/annual-top300-universe.js');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i < 0 ? fallback : process.argv[i + 1]; };
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const usableBars = (bars, endDate) => {
  const throughEnd = Array.isArray(bars) ? bars.filter(row => row.date <= endDate) : [];
  if (throughEnd.length < 273) return { ok: false, reason: 'fewer-than-273-bars' };
  const atEnd = throughEnd.find(row => row.date === endDate);
  if (!atEnd || !Number.isFinite(atEnd.close)) return { ok: false, reason: 'missing-signal-close' };
  for (let i = 1; i < throughEnd.length; i++) {
    const previous = throughEnd[i - 1].close, current = throughEnd[i].close;
    if (!Number.isFinite(previous) || !Number.isFinite(current) || previous <= 0 || current <= 0) return { ok: false, reason: 'invalid-close' };
    if (current / previous < 0.6 || current / previous > 1.4) return { ok: false, reason: 'unresolved-price-jump' };
  }
  return { ok: true };
};
function validate({ universeFile, cacheDir, endDate, startDate = '2016-07-11' }) {
  const universe = A.loadAnnualUniverse(universeFile), checked = new Map(), failures = [];
  const calendarFile = path.join(cacheDir, 'normalized', '_KS11.json');
  if (!fs.existsSync(calendarFile)) throw new Error(`missing KOSPI calendar cache: ${calendarFile}`);
  const calendar = read(calendarFile).bars.map(row => row.date).filter(date => date <= endDate);
  for (const ticker of A.universeUnion(universe)) {
    const file = path.join(cacheDir, 'normalized', `${ticker}.json`);
    if (!fs.existsSync(file)) { failures.push({ ticker, reason: 'missing-cache-file' }); continue; }
    checked.set(ticker, read(file).bars);
  }
  // Snapshot t is first actionable from the following January.  A delisted
  // company that had valid history at that point must remain counted; requiring
  // a 2026 close from it would recreate survivorship bias in the coverage gate.
  const perYearFailures = [];
  const coverage = A.coverageLedger(universe, (ticker, snapshot) => {
    const firstActiveDate = `${snapshot.rankingYear + 1}-01-01`;
    const requiredDate = calendar.find(date => date >= (firstActiveDate > startDate ? firstActiveDate : startDate)) || endDate;
    const result = usableBars(checked.get(ticker), requiredDate);
    if (!result.ok) perYearFailures.push({ rankingYear: snapshot.rankingYear, ticker, requiredDate, reason: result.reason });
    return result.ok;
  });
  // A newly listed constituent can genuinely lack history.  Keep every such
  // case in the ledger and enforce the 90% annual gate; do not fabricate a
  // price or turn a valid partial-history fact into a cache corruption error.
  const pass = coverage.every(row => row.priceCoveragePass);
  return { startDate, endDate, universeFile, cacheDir, unionCount: checked.size + failures.length, usableCount: checked.size, coverage, failures: [...failures, ...perYearFailures], pass };
}
function main() {
  const universeFile = arg('--universe-file', path.join(ROOT, 'analysis-example/kr-market/strategies/annual-top300/universe-ledger.json'));
  const cacheDir = arg('--cache-dir', path.join(ROOT, '.tmp/kr-strategy-backtest/2026-07-10'));
  const endDate = arg('--end-date', '2026-07-10');
  const startDate = arg('--start-date', '2016-07-11');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate)) throw new Error('--end-date must be YYYY-MM-DD');
  const report = validate({ universeFile, cacheDir, endDate, startDate });
  const out = arg('--out', path.join(cacheDir, 'annual-top300-price-validation.json'));
  fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, `${JSON.stringify({ generatedAt: new Date().toISOString(), ...report }, null, 2)}\n`);
  console.log(JSON.stringify({ out, pass: report.pass, coverage: report.coverage, failures: report.failures.length }, null, 2));
  if (!report.pass) process.exitCode = 1;
}
if (require.main === module) main();
module.exports = { usableBars, validate };
