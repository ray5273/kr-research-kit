"use strict";

// Pure scoring math for kr-portfolio-guard (used by the future score-calls.js
// and tested from day 1 — money math ships tested even before the scorer CLI).
//
// Rules (design doc "Ledger & Scoring Spec v1.1" + OV1/OV5/OV8):
//   - Unit: one score per flag EPISODE (re-decisions supersede; persisting
//     flags do NOT re-score weekly).
//   - Entry price: the close of the FIRST bar strictly after the decision
//     timestamp ("next-bar", data-based — no holiday calendar).
//   - Adjusted closes for scoring; raw closes only for trigger comparison.
//   - Benchmark matched by market/currency (KR → ^KS11/KRW, US → ^GSPC/USD).
//   - HOLD:  stock% − bench%
//     ADD:   same, scored as a fresh tranche from decision date
//     SELL:  −(stock% − bench%)  (avoided loss; positive = good sell)
//     REVIEW/DEFER: not scored, follow-through tracked only.
//   - Any aggregate MUST carry n and the "n<30 → 추론 불가, 방향성 참고만" label.

const N_DISCLAIMER = "n<30 — 통계적 추론 불가, 방향성 참고만";

// bars: [{date: "YYYY-MM-DD", close, adjClose}] sorted ascending.
// Returns the first bar strictly AFTER decisionDate, or null (delisted /
// suspended / horizon beyond data → caller applies `terminated` or DATA_GAP).
function nextBarAfter(bars, decisionDate) {
  for (const bar of bars) {
    if (bar.date > decisionDate) return bar;
  }
  return null;
}

function barAtOrAfter(bars, targetDate) {
  for (const bar of bars) {
    if (bar.date >= targetDate) return bar;
  }
  return null;
}

function lastBar(bars) {
  return bars.length > 0 ? bars[bars.length - 1] : null;
}

function adj(bar) {
  if (!bar) return null;
  return Number.isFinite(bar.adjClose) ? bar.adjClose : bar.close;
}

function pctReturn(from, to) {
  if (!Number.isFinite(from) || !Number.isFinite(to) || from === 0) return null;
  return ((to - from) / from) * 100;
}

// Scores one episode over one horizon.
//   decision: "HOLD" | "ADD" | "SELL" | "REVIEW" | "DEFER"
//   stockBars / benchBars: ascending [{date, close, adjClose}]
//   horizonDays: calendar days from the entry bar
// Returns { scored, excessReturnPct, terminated, reason }
function scoreEpisode({ decision, decisionDate, stockBars, benchBars, horizonDays }) {
  if (decision === "REVIEW" || decision === "DEFER") {
    return { scored: false, excessReturnPct: null, terminated: false, reason: "not-scored-by-design" };
  }

  const entryStock = nextBarAfter(stockBars, decisionDate);
  const entryBench = nextBarAfter(benchBars, decisionDate);
  if (!entryStock || !entryBench) {
    return { scored: false, excessReturnPct: null, terminated: false, reason: "DATA_GAP: no entry bar" };
  }

  const target = new Date(`${entryStock.date}T00:00:00Z`);
  target.setUTCDate(target.getUTCDate() + horizonDays);
  const targetDate = target.toISOString().slice(0, 10);

  let exitStock = barAtOrAfter(stockBars, targetDate);
  let terminated = false;
  if (!exitStock) {
    // Trading ended before the horizon (delisting/suspension) — score early
    // at the last traded bar so worst cases stay in the record (2bA).
    exitStock = lastBar(stockBars);
    terminated = true;
    if (!exitStock || exitStock.date <= entryStock.date) {
      return { scored: false, excessReturnPct: null, terminated: true, reason: "terminated: no bars after entry" };
    }
  }
  const exitBench = barAtOrAfter(benchBars, exitStock.date) || lastBar(benchBars);

  const stockRet = pctReturn(adj(entryStock), adj(exitStock));
  const benchRet = pctReturn(adj(entryBench), adj(exitBench));
  if (stockRet === null || benchRet === null) {
    return { scored: false, excessReturnPct: null, terminated, reason: "DATA_GAP: unusable prices" };
  }

  const excess = stockRet - benchRet;
  const signed = decision === "SELL" ? -excess : excess;
  return { scored: true, excessReturnPct: signed, terminated, reason: null };
}

// E1 advisory position-size guide (v1.1). Returns won amount or null.
//   confidence: 1|2|3 → risk budget % of total capital (config.riskBudgetPctByConfidence)
//   invalidation distance: |price − triggerLevel| / price (price-type triggers only)
function computeQtyGuide({ totalCapital, confidence, price, triggerLevel, riskBudgetPctByConfidence }) {
  if (!Number.isFinite(totalCapital) || totalCapital <= 0) return null;
  if (![1, 2, 3].includes(confidence)) return null;
  if (!Number.isFinite(price) || !Number.isFinite(triggerLevel) || price <= 0) return null;
  const distPct = Math.abs(price - triggerLevel) / price;
  if (distPct === 0) return null;
  const budgetPct = (riskBudgetPctByConfidence || { 1: 0.5, 2: 1.0, 3: 1.5 })[confidence];
  const budget = totalCapital * (budgetPct / 100);
  // 트리거가 현재가에 초근접(<1%)하면 산식이 총자산의 몇 배를 뱉는다 —
  // "참고 상한"이 자본을 넘는 순간 조언이 아니라 오도. 총자산으로 캡.
  return Math.round(Math.min(budget / distPct, totalCapital));
}

// Aggregate label for any report (OV8).
function nLabel(n) {
  return n < 30 ? `n=${n} — ${N_DISCLAIMER}` : `n=${n}`;
}

module.exports = { nextBarAfter, barAtOrAfter, scoreEpisode, computeQtyGuide, nLabel, N_DISCLAIMER };
