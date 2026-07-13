#!/usr/bin/env node
'use strict';

// Low-volatility factor backtest (Baker-Haugen / Frazzini-Pedersen BAB family).
// Selects the LOWEST trailing realized-volatility names in the top-300 ordinary
// universe — the defensive anomaly momentum studies never used as a stock
// picker (vol appeared only as a portfolio overlay before).
//
// Variants (same fixed 10y frame, top 10 EW, month-end -> next-open, 25bp):
//   volLow60 / volLow120 / volLow252  — pure low-vol at three lookback windows
//   volLow120_eps                     — low-vol 50% x EPS/revenue improvement 50%
//
// Usage: node backtest-kr-low-volatility.js [--limit N]
// --limit smoke-tests on the first N universe names only.

const L = require('./lib/factor-backtest-core.js');
const path = L.path;

const OUT_STEM = 'low-volatility-backtest-through-2026-07-10';
const WINDOWS = [60, 120, 252];

function baselineSummary() {
  // Optional reference: the current best momentum combo (252d momentum + EPS/revenue).
  const f = path.join(L.OUT, 'alternative-indicators-backtest-through-2026-07-10.json');
  try { return L.read(f).strategies.baseline.summary; } catch { return null; }
}

function main() {
  const limit = (() => { const i = process.argv.indexOf('--limit'); return i >= 0 ? Number(process.argv[i + 1]) : 0; })();
  const { top, states } = L.loadPriceStates(limit);
  const { base, calendar } = L.loadCalendar();
  const { series, manifestHash } = L.loadSeriesByTicker();
  const monthEnds = L.monthEnds(calendar);

  const modes = [
    { key: 'volLow60', window: 60, combo: false },
    { key: 'volLow120', window: 120, combo: false },
    { key: 'volLow252', window: 252, combo: false },
    { key: 'volLow120_eps', window: 120, combo: true },
  ];
  const result = {};

  for (const mode of modes) {
    const orders = new Map(), monthly = [], warnings = { noPrice: 0, noVol: 0, noFundamental: 0 };
    for (const signalDate of monthEnds) {
      const rows = [];
      for (const [ticker, state] of states) {
        const i = L.lastIndex(state.bars, signalDate);
        if (i < mode.window || state.bars[i].date !== signalDate) { warnings.noPrice++; continue; }
        const vol = L.realizedVol(state.bars, i, mode.window);
        if (vol === null || !(vol > 0)) { warnings.noVol++; continue; }
        const fundamental = mode.combo ? L.fundamentalAt(series.get(ticker) || [], signalDate) : null;
        if (mode.combo && !fundamental) { warnings.noFundamental++; continue; }
        rows.push({ ticker, name: state.name, market: state.market, vol, fundamental });
      }
      if (!rows.length) continue;
      // Lower vol ranks higher (descending=true => smallest value gets pct≈1).
      L.percentile(rows, 'vol', true);
      let ranked;
      if (mode.combo) {
        L.attachFundamentalComposite(rows);
        for (const r of rows) r.score = r.fundamentalScore === null ? null : 0.5 * r.volPct + 0.5 * r.fundamentalScore;
        ranked = rows.filter(r => r.score !== null).sort((a, b) => b.score - a.score || a.vol - b.vol);
      } else {
        for (const r of rows) r.score = r.volPct;
        ranked = rows.sort((a, b) => b.score - a.score || a.vol - b.vol);
      }
      const next = calendar[calendar.indexOf(signalDate) + 1];
      if (next && next <= L.CUTOFF) orders.set(next, { signalDate, tickers: ranked.slice(0, L.MAX_HOLDINGS).map(r => r.ticker) });
      monthly.push({ signalDate, executionDate: next || null, candidates: ranked.length, holdings: ranked.slice(0, L.MAX_HOLDINGS).map(r => ({ ticker: r.ticker, name: r.name, score: r.score, annualizedVol: r.vol, fundamentalScore: r.fundamentalScore ?? null, reportFilingDate: r.fundamental?.report.filing || null })) });
    }
    const run = L.runBacktest(states, calendar, orders);
    const equity = run.equity, oos = equity.filter(x => x.date >= L.OOS_START), ytd = equity.filter(x => x.date >= '2026-01-01');
    result[mode.key] = { window: mode.window, combo: mode.combo, summary: { ...L.stats(equity), tradeCount: run.trades.length, turnover: run.turnover }, outOfSample: L.stats(oos), ytd: L.stats(ytd), annualReturns: L.annual(equity), dailyEquity: equity, trades: run.trades, monthlySelections: monthly, warnings };
  }

  const benchEq = base.benchmark.dailyEquity.filter(x => x.date >= L.START && x.date <= L.CUTOFF);
  const ps = L.panelStatus();
  const baseline = baselineSummary();
  const artifact = {
    generatedAt: new Date().toISOString(),
    period: { start: L.START, end: L.CUTOFF, outOfSampleStart: L.OOS_START },
    universe: { source: L.TOP_FILE, top300Count: 300, eligibleCount: top.length, priceUsableCount: states.size, maxHoldings: L.MAX_HOLDINGS },
    commonRules: { costOneWay: L.COST, signal: 'month-end adjusted close', execution: 'next trading-day open', pointInTime: 'DART rcept_no <= signal date', cashResidual: true },
    data: { priceCache: L.DATA, dartPanel: L.PANEL, panelStatus: ps, hashes: { priceManifestSha256: L.priceManifestHash(states), dartPanelManifestSha256: manifestHash } },
    strategies: result,
    baselineReference: baseline,
    benchmark: { summary: L.stats(benchEq), dailyEquity: benchEq },
    warnings: [...L.DISCLAIMER, '변동성은 조정 종가 일간수익률의 표준편차×√252로 계산했다.'],
  };
  L.write(path.join(L.OUT, `${OUT_STEM}.json`), artifact);

  const p = L.pctText, benchYtd = L.stats(benchEq.filter(x => x.date >= '2026-01-01'));
  const labels = { volLow60: '저변동성 60일 (순수)', volLow120: '저변동성 120일 (순수)', volLow252: '저변동성 252일 (순수)', volLow120_eps: '저변동성 120일 × EPS·매출' };
  const rowLine = (label, s, oos, ytd) => `|${label}|${p(s.totalReturn)}|${p(s.cagr)}|${p(s.annualizedVolatility)}|${s.sharpeZeroRf.toFixed(2)}|${p(s.maxDrawdown)}|${s.calmar.toFixed(2)}|${s.tradeCount ?? '—'}|${s.turnover !== undefined ? s.turnover.toFixed(2) : '—'}|${p(oos.totalReturn)}|${p(ytd.totalReturn)}|`;
  const rows = modes.map(m => rowLine(labels[m.key], result[m.key].summary, result[m.key].outOfSample, result[m.key].ytd)).join('\n');
  const benchRow = rowLine('KOSPI/KOSDAQ 50:50', { ...L.stats(benchEq), tradeCount: '—', turnover: undefined }, L.stats(benchEq.filter(x => x.date >= L.OOS_START)), benchYtd);
  const baselineRow = baseline ? `\n|참고: 252일 모멘텀 + EPS·매출 (기존 최고 조합)|${p(baseline.totalReturn)}|${p(baseline.cagr)}|${p(baseline.annualizedVolatility)}|${baseline.sharpeZeroRf.toFixed(2)}|${p(baseline.maxDrawdown)}|${baseline.calmar ? baseline.calmar.toFixed(2) : '—'}|${baseline.tradeCount ?? '—'}|${baseline.turnover !== undefined ? baseline.turnover.toFixed(2) : '—'}|—|—|` : '';

  const md = `# KOSPI·KOSDAQ 저변동성 팩터 백테스트

- 기간: ${L.START}~${L.CUTOFF} (out-of-sample 컷 ${L.OOS_START} 이후)
- 유니버스: 현재 시가총액 상위 300개 중 보통주 ${top.length}개, 가격 데이터 사용 가능 ${states.size}개
- 보유: 상위 ${L.MAX_HOLDINGS}개 동일비중, 미투자금 현금
- 체결: 월말 조정 종가 신호, 다음 거래일 시가 / 비용: 편도 25bp

> 과거 시뮬레이션이며 매매 추천이 아니다. 저변동성 팩터는 학술적으로 강건한 방어형 이상현상(Baker-Haugen, Frazzini-Pedersen BAB)으로, 기존 스터디가 종목 선정 신호로는 쓰지 않았던 축이다.

|전략|누적수익률|CAGR|변동성|Sharpe|MDD|Calmar|거래 수|회전율|OOS 누적|2026 YTD|
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
${rows}${baselineRow}
${benchRow}

## 산식

- 저변동성 점수: 각 종목의 최근 N거래일 조정 종가 일간수익률 표준편차 × √252 (연율화). 값이 낮을수록 유니버스 백분위 상위.
- 결합 변형(× EPS·매출): 저변동성 백분위 50% + EPS·매출 YoY·QoQ 개선 백분위 50%. DART 접수일 ≤ 신호일만 사용.
- 상위 ${L.MAX_HOLDINGS}개 동일비중, 월말 신호 → 다음 거래일 시가 체결.

## 데이터 품질과 한계

- DART 패널 ${ps.total}건 중 정상 ${ps.ok}건, OFS fallback ${ps.ofs}건, 미제공 ${ps.noData}건.
- 현재 구성종목을 과거에 적용한 생존자 편향이 남아 있다. 거래정지·상장폐지·호가·시장충격·세금·배당은 반영하지 않는다.
- 저변동성 팩터는 대형·안정주로 쏠리는 경향이 있어 사이즈 팩터와 상관될 수 있다.
`;
  L.fs.writeFileSync(path.join(L.OUT, `${OUT_STEM}.md`), md);
  console.log(JSON.stringify(Object.fromEntries(modes.map(m => [m.key, result[m.key].summary])), null, 2));
}

try { main(); } catch (e) { console.error(e.stack || e); process.exit(1); }
