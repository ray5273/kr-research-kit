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

// Offline coverage for the KOSPI ex-heavyweights reconstruction (no network).
function testReconstructExKospi() {
  const { reconstructExKospi } = require('./run-kr-trend-following-10y.js');
  const n = 40;
  const series = closes => closes.map((close, i) => ({ date: new Date(Date.UTC(2016, 0, 1 + i)).toISOString().slice(0, 10), close }));
  const kClose = Array.from({ length: n }, (_, i) => 1000 * 1.005 ** i);
  const kospi = { bars: series(kClose) };
  const calendar = kospi.bars.map(b => b.date);
  const kospiReturn = kClose[n - 1] / kClose[0] - 1;
  const excluded = closes => [{ ticker: '005930', bars: series(closes) }];

  // 1. Zero weight must collapse the reconstruction back onto the raw KOSPI index.
  const zero = reconstructExKospi(calendar, kospi, excluded(Array.from({ length: n }, (_, i) => 50000 * 1.01 ** i)), { '005930': 0 }, { name: 'zero' });
  if (Math.abs(zero.summary.totalReturn - kospiReturn) > 1e-9) throw new Error('ex-KOSPI: zero weight should equal the raw KOSPI return');

  // 2. An excluded name that outperforms the index must drag the "rest of market" below KOSPI.
  const outperform = reconstructExKospi(calendar, kospi, excluded(Array.from({ length: n }, (_, i) => 50000 * 1.02 ** i)), { '005930': 0.3 }, { name: 'up' });
  if (!(outperform.summary.totalReturn < kospiReturn - 1e-9)) throw new Error('ex-KOSPI: excluded outperformer should lower the ex-index return');

  // 3. An excluded name that underperforms must lift the ex-index above KOSPI.
  const underperform = reconstructExKospi(calendar, kospi, excluded(Array.from({ length: n }, (_, i) => 50000 * 0.99 ** i)), { '005930': 0.3 }, { name: 'down' });
  if (!(underperform.summary.totalReturn > kospiReturn + 1e-9)) throw new Error('ex-KOSPI: excluded underperformer should raise the ex-index return');

  // 4. Weights heavy enough to drive the reconstruction non-positive must fail loudly, not emit a bogus index.
  let threw = false;
  try { reconstructExKospi(calendar, kospi, excluded(Array.from({ length: n }, () => 50000)), { '005930': 5 }, { name: 'bad' }); } catch (_) { threw = true; }
  if (!threw) throw new Error('ex-KOSPI: oversized weight should throw instead of returning a non-positive index');

  // 5. indexLevels expose REAL ex-index points (used by the standalone tracker); they must be
  //    positive, carry the raw KOSPI level, and rescale to the normalized equity via baseValue.
  const r = reconstructExKospi(calendar, kospi, excluded(Array.from({ length: n }, (_, i) => 50000 * 1.02 ** i)), { '005930': 0.3 }, { name: 'levels' });
  if (r.indexLevels.length !== calendar.length) throw new Error('ex-KOSPI: indexLevels length mismatch');
  if (!(r.baseValue > 0)) throw new Error('ex-KOSPI: baseValue must be positive');
  for (let i = 0; i < calendar.length; i += 1) {
    if (!(r.indexLevels[i].level > 0)) throw new Error('ex-KOSPI: index level must stay positive');
    if (r.indexLevels[i].kospi !== kClose[i]) throw new Error('ex-KOSPI: indexLevels.kospi must equal the raw KOSPI close');
    const rescaled = 100000000 * r.indexLevels[i].level / r.baseValue;
    if (Math.abs(rescaled - r.dailyEquity[i].equity) > 1e-6) throw new Error('ex-KOSPI: indexLevels must rescale to dailyEquity via baseValue');
  }
}
testReconstructExKospi();

console.log('PASS', dir);
