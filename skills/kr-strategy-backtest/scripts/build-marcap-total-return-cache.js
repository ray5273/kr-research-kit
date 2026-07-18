#!/usr/bin/env node
'use strict';

// Build a dividend-inclusive TOTAL-RETURN price cache from the split-only marcap
// cache + the OpenDART annual dividend table (collect-dart-dividends.js).
//
// This closes the largest gap between the split-only ~8% CAGR diagnostic and a
// true total return: cash dividends reinvested. It is still NOT the strict
// official-total-return artifact (no dual-sourced KRX/DART event ledger, no
// precise delisting consideration), but it is a materially more honest,
// survivorship-inclusive, dividend-adjusted diagnostic.
//
// Units: marcap bars are split-back-adjusted (adjusted = raw x adjustmentFactor).
// The nominal per-share dividend is in raw units, so the dividend yield is
//   yield = div / raw_close = div * adjustmentFactor / adjustedClose
// which is dimensionless and correct regardless of later splits.
//
// Ex-date approximation: annual Korean dividends record at fiscal year-end, so
// each business-year dividend is applied at the last session on/before Dec 31 of
// that year. Interim/quarterly dividends are not modeled (annual only).

const fs = require('fs');
const path = require('path');

const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const read = f => JSON.parse(fs.readFileSync(f, 'utf8'));

function main() {
  const src = arg('--price-cache');
  const divFile = arg('--dividends');
  const outCache = arg('--out-cache');
  if (!src || !divFile || !outCache) throw new Error('usage: --price-cache DIR --dividends dividends-annual.json --out-cache DIR');
  const dividends = read(divFile).dividends || {};
  const srcNorm = path.join(src, 'normalized'), outNorm = path.join(outCache, 'normalized');
  fs.mkdirSync(outNorm, { recursive: true });

  let adjusted = 0, dividendApplied = 0, passthrough = 0;
  for (const file of fs.readdirSync(srcNorm)) {
    if (!file.endsWith('.json')) continue;
    const ticker = file.replace(/\.json$/, '');
    const doc = read(path.join(srcNorm, file));
    // Index security / calendar (_KS11) and names with no dividend pass through unchanged.
    const divByYear = dividends[ticker];
    if (!doc.bars || !divByYear || ticker.startsWith('_')) { fs.writeFileSync(path.join(outNorm, file), JSON.stringify(doc) + '\n'); passthrough++; continue; }
    const bars = doc.bars;
    const origClose = bars.map(b => b.close);
    const factors = new Array(bars.length).fill(1);
    // Apply each annual dividend at the last session on/before Dec 31 of the year.
    const events = [];
    for (const [yStr, div] of Object.entries(divByYear)) {
      const y = Number(yStr); const d = Number(div);
      if (!(d > 0)) continue;
      let exIndex = -1; const cutoff = `${y}-12-31`;
      for (let i = 0; i < bars.length; i++) { if (bars[i].date <= cutoff) exIndex = i; else break; }
      if (exIndex < 1) continue; // no prior session to adjust
      const adjF = bars[exIndex].adjustmentFactor == null ? 1 : bars[exIndex].adjustmentFactor;
      const rawClose = origClose[exIndex] / adjF;
      const yieldRatio = d / rawClose;
      if (!(yieldRatio > 0 && yieldRatio < 0.9)) continue; // guard against bad data
      events.push({ year: y, exDate: bars[exIndex].date, exIndex, dividend: d, yieldRatio });
    }
    if (!events.length) { fs.writeFileSync(path.join(outNorm, file), JSON.stringify(doc) + '\n'); passthrough++; continue; }
    // Back-adjust: each dividend multiplies all PRIOR sessions by (1 - yield).
    // Yields use the original close so multiple annual dividends don't distort each other.
    for (const e of events) { const f = 1 - e.yieldRatio; for (let i = 0; i < e.exIndex; i++) factors[i] *= f; }
    const outBars = bars.map((b, i) => ({ date: b.date, open: b.open * factors[i], high: b.high * factors[i], low: b.low * factors[i], close: b.close * factors[i], volume: b.volume }));
    fs.writeFileSync(path.join(outNorm, file), JSON.stringify({ ...doc, source: (doc.source || '') + ' + OpenDART annual cash dividend reinvestment (total-return)', dividendEvents: events, bars: outBars }) + '\n');
    adjusted++; dividendApplied += events.length;
  }
  console.log(JSON.stringify({ outCache, adjustedTickers: adjusted, passthrough, dividendEventsApplied: dividendApplied }, null, 2));
}
main();
