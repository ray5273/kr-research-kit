#!/usr/bin/env node
'use strict';

// Emit the LIVE annual Top-300 universe (top300.json) that the Hermes 52w-high
// builder consumes.  This is the missing annual-refresh mechanism: the live
// universe MUST equal the point-in-time year-end snapshot the backtest uses, and
// it must be refreshed EXACTLY ONCE per year (year-end / January), never daily or
// monthly.  A daily/monthly refresh would silently swap in a mid-year survivor
// universe and corrupt the strategy (look-ahead + survivorship), diverging from
// the annual point-in-time backtest that authorises the strategy.
//
//   trading year Y  ->  ranking snapshot Y-1 (last session of Y-1)
//
// The snapshot is read from the SURVIVORSHIP-CORRECT full ledger
// (universe-ledger-2015-2025.json). It is normalised through the same
// ordinaryShare filter as the backtest, so preferred shares / ETF / ETN / REIT /
// SPAC are already excluded and 메리츠금융지주-style operating holdings kept.
//
// Modes:
//   (default)          write top300.json for the trading year (idempotent; no-op
//                      if the target file already carries the correct rankingYear
//                      unless --force)
//   --check <file>     compare an existing top300.json against what SHOULD be
//                      emitted this trading year; exit 2 on drift (use this to
//                      detect a stale / wrong-vintage live file). No write.
//
// Flags:
//   --ledger <path>        default: full corrected ledger
//   --trading-year <YYYY>  default: current calendar year
//   --out <path>           default: repo review copy; point at the Hermes cache
//                          (~/.cache/krx-trend-portfolio-monitor/top300.json) to
//                          deploy
//   --force                overwrite even if the target already has the right year

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const A = require('./lib/annual-top300-universe.js');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const DEFAULT_LEDGER = path.join(ROOT, 'analysis-example/kr-market/strategies/annual-top300/universe-ledger-2015-2025.json');
const DEFAULT_OUT = path.join(ROOT, 'analysis-example/kr-market/strategies/annual-top300/live-top300.json');

const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const sha256 = buf => crypto.createHash('sha256').update(buf).digest('hex');

function buildPayload(ledgerFile, tradingYear) {
  if (!Number.isInteger(tradingYear)) throw new Error(`invalid --trading-year: ${tradingYear}`);
  const rankingYear = tradingYear - 1;
  const universe = A.loadAnnualUniverse(ledgerFile);
  const snapshot = universe.byYear.get(rankingYear);
  if (!snapshot) {
    throw new Error(`ledger has no ${rankingYear} year-end snapshot for trading year ${tradingYear}. ` +
      `Add the ${rankingYear}-12 snapshot to the ledger first (extract the year-end Top-300 XLSX -> build-annual-top300-universe.js).`);
  }
  const top300 = snapshot.constituents.map(c => ({ ticker: c.ticker, name: c.name, market: c.market, rank: c.rank }));
  return {
    schemaVersion: 1,
    strategy: 'annual-top300-52w-high',
    tradingYear,
    rankingYear,
    asOfDate: snapshot.asOfDate,
    effectiveFrom: `${tradingYear}-01-01`,
    refreshCadence: 'annual',
    refreshWarning: 'ANNUAL point-in-time universe. Refresh ONCE per year (year-end / January) only. Never daily or monthly.',
    ledgerSource: path.basename(ledgerFile),
    ledgerSha256: universe.sourceSha256,
    rawTop300Count: snapshot.rawTop300Count,
    commonShareCount: snapshot.commonShareCount,
    generatedAt: new Date().toISOString(),
    top300,
  };
}

function readMaybe(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { if (e.code === 'ENOENT') return null; throw e; }
}

function tickerSet(payloadOrList) {
  const raw = Array.isArray(payloadOrList) ? payloadOrList : (payloadOrList.top300 || payloadOrList.listings || []);
  return new Set(raw.map(x => String(x.ticker || '').padStart(6, '0')).filter(t => /^\d{6}$/.test(t)));
}

function main() {
  const ledgerFile = arg('--ledger', DEFAULT_LEDGER);
  const tradingYear = Number(arg('--trading-year', String(new Date().getFullYear())));
  const checkFile = arg('--check', null);
  const expected = buildPayload(ledgerFile, tradingYear);

  if (checkFile) {
    const actual = readMaybe(checkFile);
    if (!actual) { console.error(JSON.stringify({ check: checkFile, status: 'MISSING', tradingYear, expectedRankingYear: expected.rankingYear })); process.exit(2); }
    const want = tickerSet(expected), have = tickerSet(actual);
    const missing = [...want].filter(t => !have.has(t)).sort();
    const extra = [...have].filter(t => !want.has(t)).sort();
    const actualRankingYear = Array.isArray(actual) ? null : (actual.rankingYear ?? null);
    const drift = missing.length > 0 || extra.length > 0 || (actualRankingYear !== null && actualRankingYear !== expected.rankingYear);
    const report = {
      check: checkFile, status: drift ? 'DRIFT' : 'OK', tradingYear,
      expectedRankingYear: expected.rankingYear, actualRankingYear,
      expectedCount: want.size, actualCount: have.size,
      missingFromLive: missing, extraInLive: extra,
      hint: drift ? 'Live universe does NOT match the point-in-time backtest snapshot. Re-emit with the default mode and deploy to the Hermes cache.' : 'Live universe matches the backtest snapshot.',
    };
    console.log(JSON.stringify(report, null, 2));
    process.exit(drift ? 2 : 0);
  }

  const out = arg('--out', DEFAULT_OUT);
  const force = process.argv.includes('--force');
  const existing = readMaybe(out);
  if (existing && !Array.isArray(existing) && existing.rankingYear === expected.rankingYear && !force) {
    console.log(JSON.stringify({ out, status: 'UNCHANGED', rankingYear: expected.rankingYear, note: `${out} already carries rankingYear ${expected.rankingYear}; annual refresh is a no-op. Pass --force to rewrite.` }, null, 2));
    return;
  }
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(expected, null, 2) + '\n');
  console.log(JSON.stringify({
    out, status: existing ? 'REWRITTEN' : 'WRITTEN',
    tradingYear: expected.tradingYear, rankingYear: expected.rankingYear, asOfDate: expected.asOfDate,
    commonShareCount: expected.commonShareCount, ledgerSource: expected.ledgerSource,
    reminder: expected.refreshWarning,
  }, null, 2));
}

if (require.main === module) {
  try { main(); }
  catch (e) { console.error(JSON.stringify({ error: e.message })); process.exit(1); }
}

module.exports = { buildPayload };
