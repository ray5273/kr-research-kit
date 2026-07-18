#!/usr/bin/env node
'use strict';

// Converts one auditable selection from the strategy ledger into the stable
// input contract used by the Hermes Excel/Telegram delivery job.  It never
// recreates scores: the full ranking must have been emitted by the scorer.

const fs = require('fs');
const path = require('path');

const arg = (name, fallback = null) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
};
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const write = (file, value) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
};

const artifactPath = arg('--artifact');
const executionDate = arg('--execution-date');
const outputPath = arg('--output');
const portfolioPath = arg('--portfolio');
if (!artifactPath || !executionDate || !outputPath) {
  throw new Error('Usage: build-weekly-ranking-export-input.js --artifact <backtest.json> --execution-date YYYY-MM-DD --output <full-ranking.json> [--portfolio <portfolio.json>]');
}

const artifact = read(artifactPath);
const selection = artifact.rebalancingLedger?.find(row => row.executionDate === executionDate);
if (!selection) throw new Error(`No rebalancingLedger entry exists for execution date ${executionDate}.`);
if (!Array.isArray(selection.fullRanking) || selection.fullRanking.length < 10) {
  throw new Error('Selected ledger entry has no fullRanking. Re-run the scorer after the full-ranking ledger upgrade.');
}
for (const [index, row] of selection.fullRanking.entries()) {
  if (row.rank !== index + 1 || !row.ticker || !row.name || !Number.isFinite(row.score) || !Number.isFinite(row.rsPercentile) || !Number.isFinite(row.fundamentalScore)) {
    throw new Error(`Invalid fullRanking row at index ${index}.`);
  }
}

let targetWeightByTicker = new Map();
let complianceExclusions = (artifact.rules?.complianceExcludedTickers || []).map(ticker => ({ ticker }));
if (portfolioPath) {
  const portfolio = read(portfolioPath);
  const holdings = portfolio.holdings || portfolio.portfolio?.holdings || [];
  targetWeightByTicker = new Map(holdings.map(row => [String(row.ticker).padStart(6, '0'), Number(row.targetWeight ?? row.weight)]));
  const fromPortfolio = portfolio.complianceExclusions || portfolio.complianceExcludedTickers || [];
  if (fromPortfolio.length) complianceExclusions = fromPortfolio.map(item => typeof item === 'string' ? { ticker: item } : item);
}
const excludedTickers = new Set(complianceExclusions.map(item => String(item.ticker || item).padStart(6, '0')));
const ranking = selection.fullRanking.map(row => ({
  ...row,
  ticker: String(row.ticker).padStart(6, '0'),
  targetWeight: targetWeightByTicker.get(String(row.ticker).padStart(6, '0')) ?? null,
}));
if ([...excludedTickers].some(ticker => ranking.some(row => row.ticker === ticker))) {
  throw new Error(`Compliance exclusion remains in fullRanking: ${[...excludedTickers].join(', ')}`);
}

write(outputPath, {
  schemaVersion: 'krx-weekly-ranking-workbook/v1',
  generatedAt: new Date().toISOString(),
  asOf: selection.asOfDate,
  signalDate: selection.signalDate,
  executionDate: selection.executionDate,
  universe: {
    label: artifact.universe?.label || '연간 Top 300',
    snapshotDate: selection.asOfDate,
    rankingYear: selection.rankingYear,
    rawTop300Count: selection.rawTop300Count,
  },
  complianceExclusions,
  scoreFormula: artifact.rules?.selection || '0.5 × RS percentile + 0.5 × fundamental percentile',
  sourceArtifact: path.resolve(artifactPath),
  fullRanking: ranking,
});
console.log(JSON.stringify({ ok: true, output: outputPath, executionDate, rows: ranking.length, exclusions: [...excludedTickers] }, null, 2));
