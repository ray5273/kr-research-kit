#!/usr/bin/env node
'use strict';

// Re-test the previously HIGH-PERFORMING momentum-family strategies under the
// corrected methodology (sell tax + dual benchmark + deflated Sharpe + winner-
// removal survivorship bound). These were the ~46-49% CAGR headline strategies
// from the earlier trend-following-10y studies, run before the cost/benchmark
// fixes. The question: does their edge survive an honest cost and a fair
// dividend-inclusive benchmark, or was it partly artifact?
//
// Usage: node retest-momentum-family.js [--limit N]

const L = require('./lib/factor-backtest-core.js');
const path = L.path;
const OUT_STEM = 'momentum-family-retest-through-2026-07-10';

// Generic top-10 order builder: priceSignalFn(bars, i) -> score; when withEps is
// true, blend 50:50 with the EPS/revenue composite (matches the old studies).
function comboOrders(states, series, calendar, priceSignalFn, withEps) {
  const orders = new Map();
  for (const signalDate of L.monthEnds(calendar)) {
    const rows = [];
    for (const [ticker, state] of states) {
      const i = L.lastIndex(state.bars, signalDate);
      if (i < 252 || state.bars[i].date !== signalDate) continue;
      const ps = priceSignalFn(state.bars, i);
      if (ps === null || !Number.isFinite(ps)) continue;
      const fundamental = withEps ? L.fundamentalAt(series.get(ticker) || [], signalDate) : null;
      if (withEps && !fundamental) continue;
      rows.push({ ticker, priceSignal: ps, fundamental });
    }
    if (!rows.length) continue;
    L.percentile(rows, 'priceSignal');
    let ranked;
    if (withEps) {
      L.attachFundamentalComposite(rows);
      for (const r of rows) r.score = r.fundamentalScore === null ? null : 0.5 * r.priceSignalPct + 0.5 * r.fundamentalScore;
      ranked = rows.filter(r => r.score !== null).sort((a, b) => b.score - a.score || b.priceSignal - a.priceSignal);
    } else {
      ranked = rows.sort((a, b) => b.priceSignal - a.priceSignal);
    }
    const next = calendar[calendar.indexOf(signalDate) + 1];
    if (next && next <= L.CUTOFF) orders.set(next, { signalDate, tickers: ranked.slice(0, L.MAX_HOLDINGS).map(r => r.ticker) });
  }
  return orders;
}

// Price-signal functions.
const r = (bars, i, n) => bars[i].close / bars[i - n].close - 1;
const SIGNALS = {
  mom252: (b, i) => r(b, i, 252),
  minerviniRS: (b, i) => 0.4 * r(b, i, 63) + 0.3 * r(b, i, 126) + 0.3 * r(b, i, 252),
  volAdj: (b, i) => { const v = L.realizedVol(b, i, 252); return v && v > 0 ? r(b, i, 252) / v : null; },
  high52: (b, i) => { const hs = b.slice(i - 251, i + 1).map(x => x.high); return hs.length === 252 ? b[i].close / Math.max(...hs) : null; },
};

function main() {
  const limit = (() => { const i = process.argv.indexOf('--limit'); return i >= 0 ? Number(process.argv[i + 1]) : 0; })();
  const { states } = L.loadPriceStates(limit);
  const { base, calendar } = L.loadCalendar();
  const { series, manifestHash } = L.loadSeriesByTicker();
  const nYears = (Date.parse(calendar.at(-1)) - Date.parse(calendar[0])) / 86400000 / 365.25;

  // The previously headline strategies (label -> builder).
  const strategies = {
    '252일 모멘텀 + EPS·매출': (st) => comboOrders(st, series, calendar, SIGNALS.mom252, true),
    'Minervini RS + EPS·매출': (st) => comboOrders(st, series, calendar, SIGNALS.minerviniRS, true),
    '변동성조정 모멘텀 + EPS·매출': (st) => comboOrders(st, series, calendar, SIGNALS.volAdj, true),
    '52주 고점 + EPS·매출': (st) => comboOrders(st, series, calendar, SIGNALS.high52, true),
    '252일 모멘텀 (순수, 재무無)': (st) => comboOrders(st, series, calendar, SIGNALS.mom252, false),
  };

  const NTRIALS = 55; // repo-wide configuration count including these
  const result = {};
  for (const [name, build] of Object.entries(strategies)) {
    const run = L.runBacktest(states, calendar, build(states));
    const s = L.stats(run.equity);
    // Survivorship lower bound: drop the ex-post top 10% winners and rerun.
    const wr = L.winnerRemovalOrders(states, series, calendar, (st) => build(st), 0.10);
    const reducedCagr = L.stats(L.runBacktest(wr.states, calendar, wr.orders).equity).cagr;
    result[name] = {
      summary: { ...s, tradeCount: run.trades.length, turnover: run.turnover },
      ci: L.blockBootstrapCI(run.equity),
      deflated: L.deflatedSharpeNote(s.sharpeZeroRf, NTRIALS, nYears),
      survivorshipPremium: s.cagr - reducedCagr,
      dailyEquity: run.equity,
    };
  }

  const benchEq = base.benchmark.dailyEquity.filter(x => x.date >= L.START && x.date <= L.CUTOFF);
  const ewTR = L.equalWeightUniverseBenchmark(states, calendar);
  const priceIdx = L.stats(benchEq);

  const artifact = {
    generatedAt: new Date().toISOString(),
    period: { start: L.START, end: L.CUTOFF }, universe: { priceUsableCount: states.size, maxHoldings: L.MAX_HOLDINGS },
    commonRules: { cost: { buyBps: L.COST * 1e4, sellBps: (L.COST + L.SELL_TAX) * 1e4, sellTaxBps: L.SELL_TAX * 1e4 }, nTrials: NTRIALS },
    data: { priceCache: L.DATA, hashes: { priceManifestSha256: L.priceManifestHash(states), dartPanelManifestSha256: manifestHash } },
    strategies: Object.fromEntries(Object.entries(result).map(([k, v]) => [k, { summary: v.summary, ci: v.ci, deflated: v.deflated, survivorshipPremium: v.survivorshipPremium }])),
    benchmarkTotalReturn: { summary: ewTR.summary }, benchmarkPriceIndex: { summary: priceIdx },
    warnings: L.DISCLAIMER,
  };
  L.write(path.join(L.OUT, `${OUT_STEM}.json`), artifact);

  const p = L.pctText;
  const line = (name, v) => `|${name}|${p(v.summary.cagr)}|${v.summary.sharpeZeroRf.toFixed(2)}|${p(v.summary.maxDrawdown)}|${v.summary.turnover.toFixed(0)}|${v.ci ? `${p(v.ci.cagr.p5)}~${p(v.ci.cagr.p95)}` : '—'}|${v.deflated.hurdleAnnualizedSharpe.toFixed(2)}|${v.deflated.clears ? '통과' : '미달'}|${p(v.survivorshipPremium)}p|`;
  const rows = Object.entries(result).map(([k, v]) => line(k, v)).join('\n');
  const bench = (nm, s) => `|${nm}|${p(s.cagr)}|${s.sharpeZeroRf.toFixed(2)}|${p(s.maxDrawdown)}|—|—|—|—|—|`;

  const md = `# 기존 고성과 모멘텀 계열 전략 — 방법론 보정 재테스트

기준일: 2026-07-13 · 기간: ${L.START}~${L.CUTOFF} · 유니버스: top-300 보통주 ${states.size}개 · 상위 ${L.MAX_HOLDINGS} 동일비중

> 초기 trend-following-10y 스터디에서 ~46~49% CAGR로 주목받던 모멘텀 계열 전략들을, 이번에 보정한 엔진(**매도 증권거래세 0.18%** + 배당 포함 **총수익 벤치마크** + **Deflated Sharpe 허들** + **승자제거 생존자편향 하한**)으로 다시 돌렸다. 명성이 정직한 비용·벤치마크에서 살아남는지 본다.

|전략|CAGR|Sharpe|MDD|회전율|CAGR 90%CI|다중검정 허들|허들판정|생존자프리미엄(≥)|
|---|---:|---:|---:|---:|---:|---:|---:|---:|
${rows}
${bench('벤치마크: 동일가중 유니버스(총수익)', ewTR.summary)}
${bench('벤치마크: KOSPI/KOSDAQ 50:50(가격지수)', priceIdx)}

## 읽는 법

- **허들판정:** ~${NTRIALS}개 구성을 시험했을 때 운으로 나올 최대 연율 Sharpe(Deflated Sharpe) 대비 통과 여부.
- **생존자프리미엄(≥):** 전체 CAGR − (사후 최고성과 상위 10% 종목 제거 후 CAGR). 클수록 성과가 "이미 이긴 종목"에 의존한다는 뜻(하한).
- 공정한 바는 배당 포함 **동일가중 유니버스(총수익, CAGR ${p(ewTR.summary.cagr)}, Sharpe ${ewTR.summary.sharpeZeroRf.toFixed(2)})**다. 가격지수(${p(priceIdx.cagr)})가 아니다.

## 한계

- 현재 top-300 구성종목을 과거에 소급 적용한 생존자 편향이 공통으로 남아 있다(하한만 정량화).
- 매수 25bp + 매도 25bp + 증권거래세 0.18%. 호가·시장충격·거래정지·유상증자는 미반영. 과거 시뮬레이션이며 매매 추천이 아니다.
`;
  L.fs.writeFileSync(path.join(L.OUT, `${OUT_STEM}.md`), md);
  console.log(JSON.stringify(Object.fromEntries(Object.entries(result).map(([k, v]) => [k, { cagr: v.summary.cagr, sharpe: v.summary.sharpeZeroRf, mdd: v.summary.maxDrawdown, hurdle: v.deflated.hurdleAnnualizedSharpe, clears: v.deflated.clears, survivorshipPremium: v.survivorshipPremium }])), null, 2));
}

module.exports = { comboOrders, SIGNALS };
if (require.main === module) { try { main(); } catch (e) { console.error(e.stack || e); process.exit(1); } }
