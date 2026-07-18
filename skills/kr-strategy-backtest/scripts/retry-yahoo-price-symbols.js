#!/usr/bin/env node
'use strict';

// Retry only failed Yahoo symbols with both Korean exchange suffixes.  This
// handles market migrations/bad historic market labels without substituting a
// successor security or inventing a delisting value.
const fs = require('fs');
const path = require('path');
const { yahooBars } = require('./run-kr-trend-following-10y.js');
const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i < 0 ? fallback : process.argv[i + 1]; };
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const write = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); };
async function main() {
  const cacheDir = arg('--cache-dir', '.tmp/kr-strategy-backtest/2026-07-16');
  const manifestFile = arg('--manifest', path.join(cacheDir, 'annual-top300-price-manifest.json'));
  const start = arg('--start-date', '2015-01-01'), end = arg('--end-date', '2026-07-16');
  const input = read(manifestFile).failures || [], retried = [], remaining = [];
  for (const row of input) {
    // A ticker found under the opposite market suffix can be an unrelated
    // recycled symbol.  Never treat it as continuity of the original stock.
    const suffixes = [row.market === 'KOSPI' ? '.KS' : '.KQ']; let success = null, errors = [];
    for (const suffix of suffixes) try { const result = await yahooBars(`${row.ticker}${suffix}`, start, end); if (result.bars.length >= 273) { success = { suffix, result }; break; } errors.push(`${suffix}: insufficient history (${result.bars.length})`); } catch (error) { errors.push(`${suffix}: ${error.message}`); }
    if (success) { const symbol = `${row.ticker}${success.suffix}`; write(path.join(cacheDir, 'normalized', `${row.ticker}.json`), { ticker: row.ticker, name: row.name, market: success.suffix === '.KS' ? 'KOSPI' : 'KOSDAQ', symbol, fetchedAt: new Date().toISOString(), source: 'Yahoo Finance chart API (suffix retry)', ...success.result }); retried.push({ ticker: row.ticker, name: row.name, symbol, bars: success.result.bars.length }); }
    else remaining.push({ ...row, retryErrors: errors });
  }
  write(path.join(cacheDir, 'yahoo-symbol-retry-manifest.json'), { generatedAt: new Date().toISOString(), startDate: start, endDate: end, requested: input.length, recovered: retried, remaining });
  console.log(JSON.stringify({ requested: input.length, recovered: retried.length, remaining: remaining.length, recovered: retried, unrecovered: remaining }, null, 2));
}
if (require.main === module) main().catch(error => { console.error(error.stack || error.message); process.exit(1); });
