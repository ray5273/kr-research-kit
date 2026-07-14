#!/usr/bin/env node
'use strict';

// Combined-sleeve backtest (H3): does allocating half the book to a low-
// correlation factor ACTUALLY diversify, or is "0.36 correlation → diversified"
// just an untested inference? This runs the combination and measures it.
//
// Sleeves (each equal-weight top-10, month-end -> next-open, taxed engine):
//   MOM   — 252-day momentum + EPS/revenue (the current recommended baseline)
//   LOWV  — lowest 120-day realized volatility
//   VALEP — highest earnings yield (TTM EPS / price)
//
// Combinations (50:50, rebalanced monthly at the sleeve level):
//   MOM+LOWV, MOM+VALEP
// A combination is only worthwhile if its Sharpe/MDD beats BOTH sleeves and the
// fair total-return benchmark. Reported with bootstrap CIs.
//
// Usage: node backtest-kr-combined-sleeves.js [--limit N]

const L = require('./lib/factor-backtest-core.js');
const path = L.path;

const OUT_STEM = 'combined-sleeves-backtest-through-2026-07-10';
const VOL_WINDOW = 120;

// Lowest-volatility top-10 selection.
function lowVolOrders(states, series, calendar) {
  const orders = new Map();
  for (const signalDate of L.monthEnds(calendar)) {
    const rows = [];
    for (const [ticker, state] of states) {
      const i = L.lastIndex(state.bars, signalDate);
      if (i < VOL_WINDOW || state.bars[i].date !== signalDate) continue;
      const vol = L.realizedVol(state.bars, i, VOL_WINDOW);
      if (vol === null || !(vol > 0)) continue;
      rows.push({ ticker, vol });
    }
    if (!rows.length) continue;
    rows.sort((a, b) => a.vol - b.vol); // lowest vol first
    const next = calendar[calendar.indexOf(signalDate) + 1];
    if (next && next <= L.CUTOFF) orders.set(next, { signalDate, tickers: rows.slice(0, L.MAX_HOLDINGS).map(r => r.ticker) });
  }
  return orders;
}

// Highest earnings-yield (E/P = TTM EPS / price) top-10 selection.
function valueEpOrders(states, series, calendar) {
  const orders = new Map();
  for (const signalDate of L.monthEnds(calendar)) {
    const rows = [];
    for (const [ticker, state] of states) {
      const i = L.lastIndex(state.bars, signalDate);
      if (i < 252 || state.bars[i].date !== signalDate) continue;
      const epsTtm = L.ttmFlow(series.get(ticker) || [], signalDate, 'eps', 4);
      const price = state.bars[i].close;
      if (!epsTtm || !(price > 0)) continue;
      rows.push({ ticker, ep: epsTtm.value / price });
    }
    if (!rows.length) continue;
    rows.sort((a, b) => b.ep - a.ep); // highest earnings yield first
    const next = calendar[calendar.indexOf(signalDate) + 1];
    if (next && next <= L.CUTOFF) orders.set(next, { signalDate, tickers: rows.slice(0, L.MAX_HOLDINGS).map(r => r.ticker) });
  }
  return orders;
}

function equityOf(states, calendar, orders) {
  const run = L.runBacktest(states, calendar, orders);
  return run.equity;
}

// 50:50 sleeve blend, rebalanced to weights at each month end. a,b are fractions
// of an initial unit; total tracks the combined portfolio value.
function blendMonthly(eqA, eqB, calendar, wA = 0.5) {
  const rA = new Map(), rB = new Map();
  for (let i = 1; i < eqA.length; i++) rA.set(eqA[i].date, eqA[i].equity / eqA[i - 1].equity - 1);
  for (let i = 1; i < eqB.length; i++) rB.set(eqB[i].date, eqB[i].equity / eqB[i - 1].equity - 1);
  let a = wA, b = 1 - wA;
  const out = [{ date: calendar[0], equity: L.INITIAL }];
  for (let i = 1; i < calendar.length; i++) {
    const d = calendar[i];
    a *= 1 + (rA.get(d) || 0); b *= 1 + (rB.get(d) || 0);
    const total = a + b;
    out.push({ date: d, equity: L.INITIAL * total });
    if (!calendar[i + 1] || calendar[i + 1].slice(0, 7) !== d.slice(0, 7)) { a = wA * total; b = (1 - wA) * total; }
  }
  return out;
}

function correlation(eqA, eqB) {
  const monthly = eq => { const m = new Map(); for (const x of eq) m.set(x.date.slice(0, 7), x.equity); const ks = [...m.keys()].sort(); const r = new Map(); for (let i = 1; i < ks.length; i++) r.set(ks[i], m.get(ks[i]) / m.get(ks[i - 1]) - 1); return r; };
  const a = monthly(eqA), b = monthly(eqB), ks = [...a.keys()].filter(k => b.has(k));
  const xa = ks.map(k => a.get(k)), xb = ks.map(k => b.get(k));
  const ma = xa.reduce((s, x) => s + x, 0) / xa.length, mb = xb.reduce((s, x) => s + x, 0) / xb.length;
  let n = 0, da = 0, db = 0; for (let i = 0; i < ks.length; i++) { n += (xa[i] - ma) * (xb[i] - mb); da += (xa[i] - ma) ** 2; db += (xb[i] - mb) ** 2; }
  return n / Math.sqrt(da * db);
}

function main() {
  const limit = (() => { const i = process.argv.indexOf('--limit'); return i >= 0 ? Number(process.argv[i + 1]) : 0; })();
  const { top, states } = L.loadPriceStates(limit);
  const { base, calendar } = L.loadCalendar();
  const { series, manifestHash } = L.loadSeriesByTicker();

  const sleeves = {
    MOM: equityOf(states, calendar, L.momentumEpsOrders(states, series, calendar)),
    LOWV: equityOf(states, calendar, lowVolOrders(states, series, calendar)),
    VALEP: equityOf(states, calendar, valueEpOrders(states, series, calendar)),
  };
  const combos = {
    'MOM+LOWV': blendMonthly(sleeves.MOM, sleeves.LOWV, calendar),
    'MOM+VALEP': blendMonthly(sleeves.MOM, sleeves.VALEP, calendar),
  };

  const benchEq = base.benchmark.dailyEquity.filter(x => x.date >= L.START && x.date <= L.CUTOFF);
  const ewTR = L.equalWeightUniverseBenchmark(states, calendar);
  const nYears = (Date.parse(calendar.at(-1)) - Date.parse(calendar[0])) / 86400000 / 365.25;

  const nTrials = 52; // running config count across the repo, incl. these combos
  const entry = eq => { const s = L.stats(eq); return { summary: s, ci: L.blockBootstrapCI(eq), deflated: L.deflatedSharpeNote(s.sharpeZeroRf, nTrials, nYears) }; };
  const rows = {};
  for (const [k, eq] of Object.entries(sleeves)) rows[k] = entry(eq);
  for (const [k, eq] of Object.entries(combos)) rows[k] = entry(eq);
  const correlations = { 'MOM~LOWV': correlation(sleeves.MOM, sleeves.LOWV), 'MOM~VALEP': correlation(sleeves.MOM, sleeves.VALEP) };

  const artifact = {
    generatedAt: new Date().toISOString(),
    period: { start: L.START, end: L.CUTOFF, outOfSampleStart: L.OOS_START },
    universe: { source: L.TOP_FILE, priceUsableCount: states.size, maxHoldings: L.MAX_HOLDINGS },
    commonRules: { cost: { buyBps: L.COST * 10000, sellBps: (L.COST + L.SELL_TAX) * 10000 }, blend: '50:50 sleeve, monthly rebalance', signal: 'month-end -> next open' },
    data: { priceCache: L.DATA, dartPanel: L.PANEL, hashes: { priceManifestSha256: L.priceManifestHash(states), dartPanelManifestSha256: manifestHash } },
    sleeves: Object.fromEntries(Object.entries(sleeves).map(([k, eq]) => [k, { summary: L.stats(eq), dailyEquity: eq }])),
    combinations: Object.fromEntries(Object.entries(combos).map(([k, eq]) => [k, { summary: L.stats(eq), dailyEquity: eq }])),
    stats: rows,
    correlations,
    benchmarkTotalReturn: { summary: ewTR.summary },
    benchmarkPriceIndex: { summary: L.stats(benchEq) },
    warnings: [...L.DISCLAIMER, '결합은 슬리브 수익률 50:50 월간 리밸런싱(슬리브 내부 비용은 이미 반영, 슬리브 간 리밸런싱 비용은 근사로 무시).'],
  };
  L.write(path.join(L.OUT, `${OUT_STEM}.json`), artifact);

  const p = L.pctText;
  const label = { MOM: '모멘텀+EPS (단독)', LOWV: '저변동성 120 (단독)', VALEP: '밸류 E/P (단독)', 'MOM+LOWV': '모멘텀 + 저변동성 (50:50)', 'MOM+VALEP': '모멘텀 + 밸류E/P (50:50)' };
  const line = k => { const r = rows[k], s = r.summary, ci = r.ci; return `|${label[k]}|${p(s.cagr)}|${p(s.annualizedVolatility)}|${s.sharpeZeroRf.toFixed(2)}|${p(s.maxDrawdown)}|${s.calmar.toFixed(2)}|${ci ? `${p(ci.cagr.p5)}~${p(ci.cagr.p95)}` : '—'}|${ci ? `${ci.sharpe.p5.toFixed(2)}~${ci.sharpe.p95.toFixed(2)}` : '—'}|`; };
  const order = ['MOM', 'LOWV', 'MOM+LOWV', 'VALEP', 'MOM+VALEP'];
  const bench = (name, s) => `|${name}|${p(s.cagr)}|${p(s.annualizedVolatility)}|${s.sharpeZeroRf.toFixed(2)}|${p(s.maxDrawdown)}|${s.calmar.toFixed(2)}|—|—|`;

  // Verdict: does each combo beat both its sleeves and the fair benchmark on Sharpe?
  const verdict = (combo, a, b) => {
    const cS = rows[combo].summary.sharpeZeroRf, beatsSleeves = cS > rows[a].summary.sharpeZeroRf && cS > rows[b].summary.sharpeZeroRf;
    const beatsBench = cS > ewTR.summary.sharpeZeroRf, mddBetter = rows[combo].summary.maxDrawdown > Math.max(rows[a].summary.maxDrawdown, rows[b].summary.maxDrawdown);
    return `- **${label[combo]}**: Sharpe ${cS.toFixed(2)} — 두 슬리브 대비 ${beatsSleeves ? '개선 O' : '개선 X'}, 공정 벤치마크(${ewTR.summary.sharpeZeroRf.toFixed(2)}) 대비 ${beatsBench ? '우위 O' : '열위 X'}, MDD는 두 슬리브 최악값보다 ${mddBetter ? '개선 O' : '악화 X'}. → **${beatsSleeves && mddBetter ? '분산 이득 확인' : '분산 이득 제한적/미확인'}**`;
  };

  const md = `# KOSPI·KOSDAQ 결합 슬리브(분산 효과 검증) 백테스트

- 기간: ${L.START}~${L.CUTOFF} / 유니버스: top-300 보통주 ${states.size}개 / 상위 ${L.MAX_HOLDINGS} 동일비중
- 결합: 슬리브 50:50, 월간 리밸런싱 / 비용: 매수 25bp, 매도 25bp+거래세 0.18%

> "저변동성·밸류가 모멘텀과 상관이 낮으니 결합하면 분산된다"는 주장을 **추론이 아닌 실측**으로 검증한다. 결합이 두 슬리브와 공정 벤치마크를 Sharpe·MDD에서 실제로 이겨야만 의미가 있다.

|포트폴리오|CAGR|변동성|Sharpe|MDD|Calmar|CAGR 90%CI|Sharpe 90%CI|
|---|---:|---:|---:|---:|---:|---:|---:|
${order.map(line).join('\n')}
${bench('벤치마크: 동일가중 유니버스(총수익)', ewTR.summary)}
${bench('벤치마크: KOSPI/KOSDAQ 50:50(가격지수)', L.stats(benchEq))}

- 월간수익률 상관: 모멘텀~저변동성 ${correlations['MOM~LOWV'].toFixed(2)}, 모멘텀~밸류E/P ${correlations['MOM~VALEP'].toFixed(2)}.

## 판정 (분산 이득이 실재하는가)

${verdict('MOM+LOWV', 'MOM', 'LOWV')}
${verdict('MOM+VALEP', 'MOM', 'VALEP')}

## 한계

- 결합은 슬리브 수익률 레벨 50:50 월간 리밸런싱이며, 슬리브 간 교체 비용은 근사로 무시(슬리브 내부 비용은 반영).
- 현재 구성종목을 과거에 적용한 생존자 편향이 공통으로 남아 있다(survivorship-bias-quantification.md 참조).
- CI는 월 블록 부트스트랩 1000회. 과거 시뮬레이션이며 매매 추천이 아니다.
`;
  L.fs.writeFileSync(path.join(L.OUT, `${OUT_STEM}.md`), md);
  console.log(JSON.stringify(Object.fromEntries(Object.entries(rows).map(([k, v]) => [k, { cagr: v.summary.cagr, sharpe: v.summary.sharpeZeroRf, mdd: v.summary.maxDrawdown }])), null, 2));
}

module.exports = { lowVolOrders, valueEpOrders };
if (require.main === module) { try { main(); } catch (e) { console.error(e.stack || e); process.exit(1); } }
