#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kr-backtest-'));
const bars = [];
for (let d = 0; d < 90; d++) {
  const date = new Date(Date.UTC(2024, 0, 1 + d)).toISOString().slice(0, 10);
  for (const [ticker, market, drift] of [['000001', 'KOSPI', 1.004], ['000002', 'KOSDAQ', 1.002], ['000003', 'KOSPI', 0.999], ['US-TEST', 'NYSE', 1.020]]) {
    const close = 100 * drift ** d;
    bars.push({ date, ticker, market, open: close * 0.999, high: close, low: close * 0.998, close, volume: 1000 });
  }
}
fs.writeFileSync(path.join(dir, 'bars.json'), JSON.stringify(bars));

function run(label, strategy) {
  const config = {
    name: label,
    strategy,
    initialCapital: 1000000,
    commissionBps: 10,
    slippageBps: 5,
    outOfSampleStart: '2024-03-01',
    dataNotes: 'synthetic test data'
  };
  const configPath = path.join(dir, `${label}.json`);
  const outDir = path.join(dir, label);
  fs.writeFileSync(configPath, JSON.stringify(config));
  cp.execFileSync('node', [path.join(__dirname, 'run-kr-backtest.js'), '--bars', path.join(dir, 'bars.json'), '--config', configPath, '--out-dir', outDir], { stdio: 'inherit' });
  const artifact = JSON.parse(fs.readFileSync(path.join(outDir, 'backtest-2024-03-30.json'), 'utf8'));
  const markdown = fs.readFileSync(path.join(outDir, 'backtest-2024-03-30.md'), 'utf8');
  if (!artifact.trades.length || artifact.summary.endEquity <= artifact.summary.startEquity) throw new Error(`${label} did not produce a profitable result`);
  if (artifact.data.symbols.includes('US-TEST') || artifact.data.eligibleMarkets.some(x => !['KOSPI', 'KOSDAQ'].includes(x))) throw new Error(`${label} did not filter the non-KRX market`);
  if (!artifact.outOfSampleSummary || !markdown.includes('## Equity curve 표본')) throw new Error(`${label} artifact is missing required report data`);
}

run('momentum', { type: 'cross-sectional-momentum', lookbackDays: 20, topN: 1, rebalanceEvery: 5 });
run('sma', { type: 'sma-cross', fastDays: 10, slowDays: 20, maxPositions: 2, rebalanceEvery: 5 });
console.log('PASS', dir);
