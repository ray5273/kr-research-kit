#!/usr/bin/env node
'use strict';

// Value + Momentum backtest (Asness "Value and Momentum Everywhere").
// Adds the value dimension the prior studies never tested — only growth /
// profitability / cash-flow fundamentals existed. Value and momentum are the
// canonical negatively-correlated sleeves, so the 50:50 combo is the headline.
//
// Value signals (all point-in-time, price-based so no stale market cap):
//   E/P  = TTM standalone EPS / adjusted close                  (earnings yield)
//   B/P  = (assets - liabilities) / market cap                  (book yield)
//          market cap = adjusted close x shares, shares = TTM net income / TTM EPS
//   value score = mean of available {E/P, B/P} percentiles (higher = cheaper)
//
// Variants (fixed 10y frame, top 10 EW, month-end -> next-open, 25bp):
//   valuePure       — value score only
//   value_mom252    — value 50% x 252-day price momentum 50%
//   value_rs        — value 50% x Minervini RS (3/6/12M = 40/30/30) 50%
//
// Usage: node backtest-kr-value-momentum.js [--limit N]

const L = require('./lib/factor-backtest-core.js');
const path = L.path;

const OUT_STEM = 'value-momentum-backtest-through-2026-07-10';

function valueSignals(series, date, price) {
  const epsTtm = L.ttmFlow(series, date, 'eps', 4);
  const netTtm = L.ttmFlow(series, date, 'net', 4);
  const assets = L.latestSnapshot(series, date, 'assets');
  const liab = L.latestSnapshot(series, date, 'liab');
  const out = { earningsYield: null, bookYield: null, report: epsTtm?.report || netTtm?.report || assets?.report || null };
  if (epsTtm && price > 0) out.earningsYield = L.clamp(epsTtm.value / price, -5, 5);
  // Book yield needs a positive share count derived from TTM net / TTM EPS.
  if (netTtm && epsTtm && assets && liab && epsTtm.value !== 0) {
    const shares = netTtm.value / epsTtm.value;
    const equity = assets.value - liab.value;
    if (Number.isFinite(shares) && shares > 1e4 && equity > 0 && price > 0) {
      const marketCap = price * shares;
      if (marketCap > 0) out.bookYield = L.clamp(equity / marketCap, 0, 50);
    }
  }
  return (out.earningsYield !== null || out.bookYield !== null) ? out : null;
}

function main() {
  const limit = (() => { const i = process.argv.indexOf('--limit'); return i >= 0 ? Number(process.argv[i + 1]) : 0; })();
  const { top, states } = L.loadPriceStates(limit);
  const { base, calendar } = L.loadCalendar();
  const { series, manifestHash } = L.loadSeriesByTicker();
  const monthEnds = L.monthEnds(calendar);

  const modes = ['valuePure', 'value_mom252', 'value_rs'];
  const result = {};

  for (const mode of modes) {
    const orders = new Map(), monthly = [], warnings = { noPrice: 0, noValue: 0 };
    for (const signalDate of monthEnds) {
      const rows = [];
      for (const [ticker, state] of states) {
        const i = L.lastIndex(state.bars, signalDate);
        if (i < 252 || state.bars[i].date !== signalDate) { warnings.noPrice++; continue; }
        const price = state.bars[i].close;
        const val = valueSignals(series.get(ticker) || [], signalDate, price);
        if (!val) { warnings.noValue++; continue; }
        const ret252 = state.bars[i].close / state.bars[i - 252].close - 1;
        const r63 = state.bars[i].close / state.bars[i - 63].close - 1, r126 = state.bars[i].close / state.bars[i - 126].close - 1;
        const rs = 0.4 * r63 + 0.3 * r126 + 0.3 * ret252;
        rows.push({ ticker, name: state.name, market: state.market, earningsYield: val.earningsYield, bookYield: val.bookYield, ret252, rs, report: val.report });
      }
      if (!rows.length) continue;
      // Cheaper (higher yield) ranks higher — ascending percentile.
      L.percentile(rows, 'earningsYield');
      L.percentile(rows, 'bookYield');
      for (const r of rows) { const parts = ['earningsYieldPct', 'bookYieldPct'].filter(k => r[k] !== undefined); r.valueScore = parts.length ? parts.reduce((s, k) => s + r[k], 0) / parts.length : null; }
      L.percentile(rows, 'ret252');
      L.percentile(rows, 'rs');
      let ranked;
      if (mode === 'valuePure') {
        for (const r of rows) r.score = r.valueScore;
        ranked = rows.filter(r => r.score !== null).sort((a, b) => b.score - a.score || (b.earningsYield ?? -9) - (a.earningsYield ?? -9));
      } else {
        const momKey = mode === 'value_rs' ? 'rsPct' : 'ret252Pct';
        for (const r of rows) r.score = r.valueScore === null || r[momKey] === undefined ? null : 0.5 * r.valueScore + 0.5 * r[momKey];
        ranked = rows.filter(r => r.score !== null).sort((a, b) => b.score - a.score || b[momKey] - a[momKey]);
      }
      const next = calendar[calendar.indexOf(signalDate) + 1];
      if (next && next <= L.CUTOFF) orders.set(next, { signalDate, tickers: ranked.slice(0, L.MAX_HOLDINGS).map(r => r.ticker) });
      monthly.push({ signalDate, executionDate: next || null, candidates: ranked.length, holdings: ranked.slice(0, L.MAX_HOLDINGS).map(r => ({ ticker: r.ticker, name: r.name, score: r.score, valueScore: r.valueScore, earningsYield: r.earningsYield, bookYield: r.bookYield, ret252: r.ret252, reportFilingDate: r.report?.filing || null })) });
    }
    const run = L.runBacktest(states, calendar, orders);
    const equity = run.equity, oos = equity.filter(x => x.date >= L.OOS_START), ytd = equity.filter(x => x.date >= '2026-01-01');
    result[mode] = { summary: { ...L.stats(equity), tradeCount: run.trades.length, turnover: run.turnover }, outOfSample: L.stats(oos), ytd: L.stats(ytd), annualReturns: L.annual(equity), dailyEquity: equity, trades: run.trades, monthlySelections: monthly, warnings };
  }

  const benchEq = base.benchmark.dailyEquity.filter(x => x.date >= L.START && x.date <= L.CUTOFF);
  const ps = L.panelStatus();
  const artifact = {
    generatedAt: new Date().toISOString(),
    period: { start: L.START, end: L.CUTOFF, outOfSampleStart: L.OOS_START },
    universe: { source: L.TOP_FILE, top300Count: 300, eligibleCount: top.length, priceUsableCount: states.size, maxHoldings: L.MAX_HOLDINGS },
    commonRules: { costOneWay: L.COST, signal: 'month-end adjusted close', execution: 'next trading-day open', pointInTime: 'DART rcept_no <= signal date', cashResidual: true },
    data: { priceCache: L.DATA, dartPanel: L.PANEL, panelStatus: ps, hashes: { priceManifestSha256: L.priceManifestHash(states), dartPanelManifestSha256: manifestHash } },
    strategies: result,
    benchmark: { summary: L.stats(benchEq), dailyEquity: benchEq },
    warnings: [...L.DISCLAIMER, 'B/P의 주식수는 TTM 순이익 / TTM EPS로 도출한 근사치다(자기주식·희석·비지배지분 미조정).', 'E/P·B/P는 조정 종가 기준이라 point-in-time이며, 별도 시가총액 시계열을 쓰지 않는다.'],
  };
  L.write(path.join(L.OUT, `${OUT_STEM}.json`), artifact);

  const p = L.pctText;
  const labels = { valuePure: '밸류 단독 (E/P·B/P)', value_mom252: '밸류 × 252일 모멘텀', value_rs: '밸류 × Minervini RS' };
  const rowLine = (label, s, oos, ytd) => `|${label}|${p(s.totalReturn)}|${p(s.cagr)}|${p(s.annualizedVolatility)}|${s.sharpeZeroRf.toFixed(2)}|${p(s.maxDrawdown)}|${s.calmar.toFixed(2)}|${s.tradeCount ?? '—'}|${s.turnover !== undefined ? s.turnover.toFixed(2) : '—'}|${p(oos.totalReturn)}|${p(ytd.totalReturn)}|`;
  const rows = modes.map(m => rowLine(labels[m], result[m].summary, result[m].outOfSample, result[m].ytd)).join('\n');
  const benchRow = rowLine('KOSPI/KOSDAQ 50:50', { ...L.stats(benchEq), tradeCount: '—', turnover: undefined }, L.stats(benchEq.filter(x => x.date >= L.OOS_START)), L.stats(benchEq.filter(x => x.date >= '2026-01-01')));

  const md = `# KOSPI·KOSDAQ 밸류 + 모멘텀 백테스트

- 기간: ${L.START}~${L.CUTOFF} (out-of-sample 컷 ${L.OOS_START} 이후)
- 유니버스: 현재 시가총액 상위 300개 중 보통주 ${top.length}개, 가격 데이터 사용 가능 ${states.size}개
- 보유: 상위 ${L.MAX_HOLDINGS}개 동일비중, 미투자금 현금
- 체결: 월말 조정 종가 신호, 다음 거래일 시가 / 비용: 편도 25bp

> 과거 시뮬레이션이며 매매 추천이 아니다. 밸류는 기존 스터디에 통째로 비어 있던 축이며, 밸류·모멘텀 결합은 Asness의 "Value and Momentum Everywhere"에서 검증된 음의 상관 조합이다.

|전략|누적수익률|CAGR|변동성|Sharpe|MDD|Calmar|거래 수|회전율|OOS 누적|2026 YTD|
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
${rows}
${benchRow}

## 산식

- E/P(이익수익률) = 최근 4개 standalone 분기 EPS 합 / 조정 종가. 높을수록 저평가(백분위 상위).
- B/P(장부수익률) = (자산총계 − 부채총계) / 시가총액. 시가총액 = 조정 종가 × 주식수, 주식수 = TTM 순이익 / TTM EPS로 도출한 **근사치**.
- 밸류 점수 = 사용 가능한 {E/P, B/P} 백분위 평균.
- 결합: 밸류 백분위 50% + 모멘텀 백분위 50%. 모멘텀은 252일 수익률 또는 Minervini RS(3/6/12M=40/30/30).

## 데이터 품질과 한계

- DART 패널 ${ps.total}건 중 정상 ${ps.ok}건, OFS fallback ${ps.ofs}건, 미제공 ${ps.noData}건.
- 주식수를 순이익/EPS로 역산하므로 자기주식·희석·비지배지분·우선주를 조정하지 못한다. B/P는 근사 지표로 해석해야 한다.
- 현재 구성종목을 과거에 적용한 생존자 편향이 남아 있다. 거래정지·상장폐지·호가·시장충격·세금·배당은 반영하지 않는다.
`;
  L.fs.writeFileSync(path.join(L.OUT, `${OUT_STEM}.md`), md);
  console.log(JSON.stringify(Object.fromEntries(modes.map(m => [m, result[m].summary])), null, 2));
}

try { main(); } catch (e) { console.error(e.stack || e); process.exit(1); }
