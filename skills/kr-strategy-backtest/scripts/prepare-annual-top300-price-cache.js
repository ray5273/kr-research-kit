#!/usr/bin/env node
'use strict';

// Fetch the annual-universe union rather than only currently listed names.
// The annual runner enforces coverage afterwards; this script merely fills the
// cache and leaves every raw/normalised response auditable per ticker.

const fs = require('fs');
const path = require('path');
const A = require('./lib/annual-top300-universe.js');
const { yahooBars } = require('./run-kr-trend-following-10y.js');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const defaults = {
  universe: path.join(ROOT, 'analysis-example/kr-market/strategies/annual-top300/universe-ledger.json'),
  cache: path.join(ROOT, '.tmp/kr-strategy-backtest/2026-07-10'), start: '2015-01-01', end: '2026-07-10', concurrency: 4,
};
function arg(name, fallback) { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : fallback; }
function write(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n'); }
async function main() {
  const universeFile = arg('--universe-file', defaults.universe), cacheDir = arg('--cache-dir', defaults.cache), start = arg('--start-date', defaults.start), requestedEnd = arg('--end-date', defaults.end), concurrency = Number(arg('--concurrency', defaults.concurrency)), rankingYear = Number(arg('--ranking-year', '0')), refresh = process.argv.includes('--refresh-existing'), includeIndex = process.argv.includes('--include-kospi-index');
  if (!Number.isInteger(concurrency) || concurrency < 1) throw new Error('--concurrency must be a positive integer');
  let end = requestedEnd;
  // `latest` is resolved from the index itself, then written into the manifest
  // and artifact filenames by the orchestration layer.  A weekend/holiday can
  // therefore never masquerade as a completed trading day.
  if (requestedEnd === 'latest') {
    const index = await yahooBars('^KS11', start, new Date().toISOString().slice(0, 10));
    end = index.bars.at(-1)?.date;
    if (!end) throw new Error('could not resolve latest completed KOSPI trading date');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || start >= end) throw new Error('--start-date and --end-date must be YYYY-MM-DD (or --end-date latest) with start < end');
  const universe = A.loadAnnualUniverse(universeFile), listings = new Map(), snapshots = rankingYear ? universe.snapshots.filter(x => x.rankingYear === rankingYear) : universe.snapshots;
  if (rankingYear && !snapshots.length) throw new Error(`ranking year ${rankingYear} is not in the annual universe ledger`);
  for (const snapshot of snapshots) for (const x of snapshot.constituents) listings.set(x.ticker, x);
  const jobs = [...listings.values()], failures = []; let fetched = 0, skipped = 0;
  async function worker() { while (jobs.length) { const listing = jobs.shift(), file = path.join(cacheDir, 'normalized', `${listing.ticker}.json`); if (fs.existsSync(file) && !refresh) { skipped++; continue; } const symbol = `${listing.ticker}${listing.market === 'KOSPI' ? '.KS' : '.KQ'}`; try { const result = await yahooBars(symbol, start, end); if (!result.bars.length) throw new Error('empty response'); write(file, { ticker: listing.ticker, name: listing.name, market: listing.market, symbol, fetchedAt: new Date().toISOString(), source: 'Yahoo Finance chart API', ...result }); fetched++; } catch (error) { failures.push({ ticker: listing.ticker, name: listing.name, market: listing.market, error: error.message }); } } }
  await Promise.all(Array.from({ length: concurrency }, worker));
  let kospi = null; if (includeIndex) { try { const result = await yahooBars('^KS11', start, end); write(path.join(cacheDir, 'normalized', '_KS11.json'), { ticker: '^KS11', name: 'KOSPI', market: 'INDEX', symbol: '^KS11', fetchedAt: new Date().toISOString(), source: 'Yahoo Finance chart API', ...result }); kospi = { bars: result.bars.length, rawSha256: result.rawSha256 }; } catch (error) { failures.push({ ticker: '^KS11', name: 'KOSPI', error: error.message }); } }
  const manifest = { generatedAt: new Date().toISOString(), methodology: 'annual-top300-union', universeFile, rankingYear: rankingYear || null, startDate: start, requestedEndDate: requestedEnd, endDate: end, refreshExisting: refresh, requested: listings.size, fetched, skipped, kospi, failures };
  write(path.join(cacheDir, 'annual-top300-price-manifest.json'), manifest);
  console.log(JSON.stringify(manifest, null, 2));
}
if (require.main === module) main().catch(error => { console.error(error.stack || error.message); process.exit(1); });
