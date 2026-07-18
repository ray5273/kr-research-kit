#!/usr/bin/env node
'use strict';

// Regime-centric low-risk portfolio design on the survivorship-honest,
// dividend-inclusive cache. Premise from the robustness search: KOSPI stock-
// selection alpha is not robust, but the KOSPI SMA200 regime overlay is the one
// reliable edge. So this optimizes RISK (MDD / Calmar / Sharpe), not raw CAGR:
// hold a broad, diversified, low-turnover basket and step aside in downtrends.
// Compares the unprotected market, binary vs graduated regime, a vol target, a
// low-vol tilt, and a breadth sweep. Monthly cadence keeps turnover low.

const fs = require('fs');
const path = require('path');
const L = require('./lib/factor-backtest-core.js');
const { buildContext, runConfig } = require('./analyze-overlay-ablation.js');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const write = (f, x) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(x, null, 2) + '\n'); };
const pct = x => `${(x * 100).toFixed(1)}%`;

// Broad EW basket: many holdings + neutral score => holds ~all eligible equally.
const BROAD = 200, MONTHLY = 21;
const D = [
  { key: 'Market (broad, NO regime)', cfg: { epsWeight: 0, holdings: BROAD, cadence: MONTHLY, regime: false } },
  { key: 'Market + binary regime', cfg: { epsWeight: 0, holdings: BROAD, cadence: MONTHLY, regime: true, regimeMode: 'binary' } },
  { key: 'Market + graduated regime', cfg: { epsWeight: 0, holdings: BROAD, cadence: MONTHLY, regime: true, regimeMode: 'graduated' } },
  { key: 'Graduated regime + volTgt .15', cfg: { epsWeight: 0, holdings: BROAD, cadence: MONTHLY, regime: true, regimeMode: 'graduated', volTarget: 0.15 } },
  { key: 'Low-vol tilt + graduated', cfg: { epsWeight: 0, lowVolWeight: 1, holdings: 60, cadence: MONTHLY, regime: true, regimeMode: 'graduated' } },
  { key: 'Breadth 20 + graduated', cfg: { epsWeight: 0, holdings: 20, cadence: MONTHLY, regime: true, regimeMode: 'graduated' } },
  { key: 'Breadth 60 + graduated', cfg: { epsWeight: 0, holdings: 60, cadence: MONTHLY, regime: true, regimeMode: 'graduated' } },
  { key: 'Breadth 120 + graduated', cfg: { epsWeight: 0, holdings: 120, cadence: MONTHLY, regime: true, regimeMode: 'graduated' } },
];

function main() {
  const universeFile = arg('--universe-file', path.join(ROOT, 'analysis-example/kr-market/strategies/annual-top300/universe-ledger-2015-2025.json'));
  const cacheDir = arg('--cache-dir', L.DATA), panelDir = arg('--dart-panel-dir', L.PANEL);
  const startDate = arg('--start-date', '2017-01-02'), endDate = arg('--end-date', '2026-07-16');
  const oosStart = arg('--oos-start', '2023-01-02');
  const outDir = arg('--out-dir', path.join(ROOT, 'analysis-example/kr-market/strategies/annual-top300'));
  const label = arg('--label', 'marcap-total-return');

  const full = buildContext({ universeFile, cacheDir, panelDir, startDate, endDate });
  const oos = buildContext({ universeFile, cacheDir, panelDir, startDate: oosStart, endDate });

  const rows = D.map(({ key, cfg }) => {
    const f = runConfig(full, cfg), o = runConfig(oos, cfg);
    return { key, cfg, cagr: f.cagr, sharpe: f.sharpeZeroRf, mdd: f.maxDrawdown, calmar: f.calmar, turnover: f.turnover, oosCagr: o.cagr, oosMdd: o.maxDrawdown, oosSharpe: o.sharpeZeroRf };
  });
  const market = rows[0];
  rows.sort((a, b) => b.calmar - a.calmar); // low-risk objective: rank by Calmar (CAGR / |MDD|)

  console.log(`\n=== REGIME-CENTRIC LOW-RISK DESIGN (${label}, ${startDate}~${endDate}; monthly, ranked by Calmar) ===`);
  console.log('| design                         |  CAGR | Sharpe |    MDD | Calmar | turnover | OOS MDD |');
  console.log('|--------------------------------|------:|-------:|-------:|-------:|---------:|--------:|');
  for (const r of rows) console.log(`| ${r.key.padEnd(30)} | ${pct(r.cagr).padStart(5)} | ${r.sharpe.toFixed(2).padStart(6)} | ${pct(r.mdd).padStart(6)} | ${r.calmar.toFixed(2).padStart(6)} | ${r.turnover.toFixed(1).padStart(8)} | ${pct(r.oosMdd).padStart(7)} |`);
  console.log(`\nmarket (no regime) baseline: CAGR ${pct(market.cagr)}, MDD ${pct(market.mdd)}, Calmar ${market.calmar.toFixed(2)}`);
  const best = rows[0];
  console.log(`best Calmar: ${best.key} -> CAGR ${pct(best.cagr)}, MDD ${pct(best.mdd)} (vs market MDD ${pct(market.mdd)}), Calmar ${best.calmar.toFixed(2)}`);

  write(path.join(outDir, `lowrisk-design-${label}-${startDate}-through-${endDate}.json`), { generatedAt: new Date().toISOString(), label, period: { start: startDate, end: endDate }, oosStart, priceCache: cacheDir, note: 'Broad EW basket + regime overlay, monthly cadence. Ranked by Calmar (risk-adjusted). Split+dividend honest cache, not strict official.', marketBaseline: market, ranked: rows });
  console.log(`\nartifact: lowrisk-design-${label}-${startDate}-through-${endDate}.json`);
}
main();
