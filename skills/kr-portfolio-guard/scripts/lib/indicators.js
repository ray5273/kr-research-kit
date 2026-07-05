"use strict";

// Indicator layer for kr-portfolio-guard.
// SMA / Wilder-RSI are REUSED from kr-stock-analysis (single implementation —
// do not fork the math). EMA / MACD are guard-local additions because no
// existing script computes them.

const path = require("path");

let snapshot;
try {
  snapshot = require(path.join(
    __dirname, "..", "..", "..", "kr-stock-analysis", "scripts", "portfolio-snapshot.js"
  ));
} catch (err) {
  throw new Error(
    "Shared indicator source missing (kr-stock-analysis/scripts/portfolio-snapshot.js). " +
      "Install kr-stock-analysis first. Original error: " + err.message
  );
}

const { computeSMA, computeRSI } = snapshot;

function computeEMASeries(values, period) {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  const out = new Array(values.length).fill(null);
  let ema = values.slice(0, period).reduce((s, v) => s + v, 0) / period;
  out[period - 1] = ema;
  for (let i = period; i < values.length; i += 1) {
    ema = values[i] * k + ema * (1 - k);
    out[i] = ema;
  }
  return out;
}

// MACD(12,26,9). Returns { macd, signal, hist, cross } for the LAST bar.
// cross: "golden" | "dead" | null — sign change of (macd - signal) across the
// final two bars.
function computeMACD(closes, fast = 12, slow = 26, signalPeriod = 9) {
  if (closes.length < slow + signalPeriod) return null;
  const emaFast = computeEMASeries(closes, fast);
  const emaSlow = computeEMASeries(closes, slow);
  const macdSeries = closes.map((_, i) =>
    emaFast[i] !== null && emaSlow[i] !== null ? emaFast[i] - emaSlow[i] : null
  );
  const macdValues = macdSeries.filter((v) => v !== null);
  const signalSeries = computeEMASeries(macdValues, signalPeriod);
  if (!signalSeries) return null;

  const macd = macdValues[macdValues.length - 1];
  const macdPrev = macdValues[macdValues.length - 2];
  const signal = signalSeries[signalSeries.length - 1];
  const signalPrev = signalSeries[signalSeries.length - 2];
  if (![macd, macdPrev, signal, signalPrev].every(Number.isFinite)) return null;

  const diffNow = macd - signal;
  const diffPrev = macdPrev - signalPrev;
  // Float-noise guard: constant-slope stretches leave hist oscillating at
  // ±1e-13 around zero — exact-zero comparisons both miss real crosses and
  // invent spurious ones. Anything inside ±EPS counts as "on the line".
  const EPS = 1e-9;
  let cross = null;
  if (diffPrev <= EPS && diffNow > EPS) cross = "golden";
  else if (diffPrev >= -EPS && diffNow < -EPS) cross = "dead";

  return { macd, signal, hist: diffNow, cross };
}

module.exports = { computeSMA, computeRSI, computeEMASeries, computeMACD };
