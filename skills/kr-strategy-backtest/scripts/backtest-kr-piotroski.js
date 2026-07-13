#!/usr/bin/env node
'use strict';

// Piotroski F-score backtest (Piotroski 2000, "Value Investing: The Use of
// Historical Financial Statement Information"). The prior alternative-indicators
// run explicitly EXCLUDED F-score; this fills that gap.
//
// Nine binary fundamental-health signals (1 point each), computed on a TTM basis
// with a one-year-ago TTM comparison, all point-in-time (DART filing <= signal):
//   Profitability : ROA>0, CFO>0, dROA>0, accrual(CFO>NI)
//   Leverage/liq  : dLeverage<0 (total-liab/assets proxy), dCurrentRatio>0, no new shares
//   Efficiency    : dGrossMargin>0, dAssetTurnover>0
// Shares are derived as TTM net income / TTM EPS (approximate). Signals whose
// inputs are missing are not scored; a name is included only when >=7 of 9 are
// evaluable, and the reduced count is recorded (reducedScoreCount in JSON).
//
// Variants (fixed 10y frame, top 10 EW, month-end -> next-open, 25bp):
//   pFilterMom   — F>=7 quality gate, then rank survivors by 252-day momentum
//   pScoreMom    — F-score percentile 50% x 252-day momentum 50%
//   pPure        — highest F-score, momentum as tiebreak
//
// Usage: node backtest-kr-piotroski.js [--limit N]

const L = require('./lib/factor-backtest-core.js');
const path = L.path;

const OUT_STEM = 'piotroski-fscore-backtest-through-2026-07-10';
const F_GATE = 7;

// TTM aggregates + balance-sheet snapshot ending at position `endIdx` in the
// filing-ordered list (4 consecutive quarters up to and including endIdx).
function ttmEnding(filed, endIdx) {
  if (endIdx < 3) return null;
  const w = filed.slice(endIdx - 3, endIdx + 1);
  if (w.length < 4) return null;
  const sum = k => { const v = w.map(x => x[k]); return v.every(z => z !== null && Number.isFinite(z)) ? v.reduce((a, b) => a + b, 0) : null; };
  const last = w[w.length - 1];
  const net = sum('net'), eps = sum('eps');
  const shares = net !== null && eps !== null && eps !== 0 ? net / eps : null;
  return { net, cfo: sum('cfo'), revenue: sum('revenue'), gross: sum('gross'), eps, shares: shares !== null && Number.isFinite(shares) && shares > 0 ? shares : null, assets: last.assets, liab: last.liab, currentAssets: last.currentAssets, currentLiabilities: last.currentLiabilities, report: last };
}

function piotroskiAt(series, date) {
  const filed = series.filter(x => x.filing <= date);
  const curIdx = filed.length - 1;
  const cur = ttmEnding(filed, curIdx);
  if (!cur) return null;
  const curEntry = filed[curIdx];
  let priorIdx = -1;
  for (let j = curIdx - 1; j >= 0; j--) { if (filed[j].year === curEntry.year - 1 && filed[j].quarter === curEntry.quarter) { priorIdx = j; break; } }
  const prior = priorIdx >= 3 ? ttmEnding(filed, priorIdx) : null;
  if (!prior) return null;

  const roa = t => (t.net !== null && t.assets && t.assets > 0) ? t.net / t.assets : null;
  const lev = t => (t.liab !== null && t.assets && t.assets > 0) ? t.liab / t.assets : null;
  const curr = t => (t.currentAssets !== null && t.currentLiabilities && t.currentLiabilities > 0) ? t.currentAssets / t.currentLiabilities : null;
  const margin = t => (t.gross !== null && t.revenue && t.revenue > 0) ? t.gross / t.revenue : null;
  const turn = t => (t.revenue !== null && t.assets && t.assets > 0) ? t.revenue / t.assets : null;

  const roaC = roa(cur), roaP = roa(prior);
  const signals = {
    roaPositive: roaC === null ? null : roaC > 0,
    cfoPositive: cur.cfo === null ? null : cur.cfo > 0,
    deltaRoa: (roaC === null || roaP === null) ? null : roaC > roaP,
    accrual: (cur.cfo === null || cur.net === null || !cur.assets) ? null : (cur.cfo / cur.assets) > roaC,
    deltaLeverage: (lev(cur) === null || lev(prior) === null) ? null : lev(cur) < lev(prior),
    deltaCurrentRatio: (curr(cur) === null || curr(prior) === null) ? null : curr(cur) > curr(prior),
    noNewShares: (cur.shares === null || prior.shares === null) ? null : cur.shares <= prior.shares * 1.02,
    deltaMargin: (margin(cur) === null || margin(prior) === null) ? null : margin(cur) > margin(prior),
    deltaTurnover: (turn(cur) === null || turn(prior) === null) ? null : turn(cur) > turn(prior),
  };
  const evaluated = Object.values(signals).filter(v => v !== null);
  if (evaluated.length < F_GATE) return null;
  const fScore = evaluated.filter(Boolean).length;
  return { fScore, evaluable: evaluated.length, signals, report: cur.report, roa: roaC };
}

function main() {
  const limit = (() => { const i = process.argv.indexOf('--limit'); return i >= 0 ? Number(process.argv[i + 1]) : 0; })();
  const { top, states } = L.loadPriceStates(limit);
  const { base, calendar } = L.loadCalendar();
  const { series, manifestHash } = L.loadSeriesByTicker();
  const monthEnds = L.monthEnds(calendar);

  const modes = ['pFilterMom', 'pScoreMom', 'pPure'];
  const result = {};

  for (const mode of modes) {
    const orders = new Map(), monthly = [], warnings = { noPrice: 0, noFscore: 0, reducedScoreCount: 0, thinGate: 0 };
    for (const signalDate of monthEnds) {
      const rows = [];
      for (const [ticker, state] of states) {
        const i = L.lastIndex(state.bars, signalDate);
        if (i < 252 || state.bars[i].date !== signalDate) { warnings.noPrice++; continue; }
        const pio = piotroskiAt(series.get(ticker) || [], signalDate);
        if (!pio) { warnings.noFscore++; continue; }
        if (pio.evaluable < 9) warnings.reducedScoreCount++;
        const ret252 = state.bars[i].close / state.bars[i - 252].close - 1;
        rows.push({ ticker, name: state.name, market: state.market, fScore: pio.fScore, evaluable: pio.evaluable, signals: pio.signals, ret252, report: pio.report });
      }
      if (!rows.length) continue;
      L.percentile(rows, 'fScore');
      L.percentile(rows, 'ret252');
      let ranked;
      if (mode === 'pFilterMom') {
        const gate = rows.filter(r => r.fScore >= F_GATE);
        if (gate.length < L.MAX_HOLDINGS) warnings.thinGate++;
        ranked = gate.sort((a, b) => b.ret252 - a.ret252 || b.fScore - a.fScore);
      } else if (mode === 'pScoreMom') {
        for (const r of rows) r.score = 0.5 * r.fScorePct + 0.5 * r.ret252Pct;
        ranked = rows.sort((a, b) => b.score - a.score || b.fScore - a.fScore);
      } else {
        ranked = rows.sort((a, b) => b.fScore - a.fScore || b.ret252 - a.ret252);
      }
      const next = calendar[calendar.indexOf(signalDate) + 1];
      if (next && next <= L.CUTOFF) orders.set(next, { signalDate, tickers: ranked.slice(0, L.MAX_HOLDINGS).map(r => r.ticker) });
      monthly.push({ signalDate, executionDate: next || null, candidates: ranked.length, holdings: ranked.slice(0, L.MAX_HOLDINGS).map(r => ({ ticker: r.ticker, name: r.name, fScore: r.fScore, evaluable: r.evaluable, ret252: r.ret252, reportFilingDate: r.report?.filing || null })) });
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
    commonRules: { costOneWay: L.COST, signal: 'month-end adjusted close', execution: 'next trading-day open', pointInTime: 'DART rcept_no <= signal date', cashResidual: true, fScoreGate: F_GATE },
    data: { priceCache: L.DATA, dartPanel: L.PANEL, panelStatus: ps, hashes: { priceManifestSha256: L.priceManifestHash(states), dartPanelManifestSha256: manifestHash } },
    strategies: result,
    benchmark: { summary: L.stats(benchEq), dailyEquity: benchEq },
    warnings: [...L.DISCLAIMER, 'F-score는 TTM 기준이며 1년 전 TTM과 비교한다. 레버리지는 총부채/자산 프록시, 유동비율은 유동자산/유동부채, 주식수는 TTM 순이익/EPS 근사치.', '9개 신호 중 최소 7개가 산출되는 종목만 포함하고, 축소 산출 건수는 reducedScoreCount에 기록한다.'],
  };
  L.write(path.join(L.OUT, `${OUT_STEM}.json`), artifact);

  const p = L.pctText;
  const labels = { pFilterMom: 'F≥7 필터 → 252일 모멘텀', pScoreMom: 'F-score 50% × 252일 모멘텀', pPure: '고 F-score 단독' };
  const rowLine = (label, s, oos, ytd) => `|${label}|${p(s.totalReturn)}|${p(s.cagr)}|${p(s.annualizedVolatility)}|${s.sharpeZeroRf.toFixed(2)}|${p(s.maxDrawdown)}|${s.calmar.toFixed(2)}|${s.tradeCount ?? '—'}|${s.turnover !== undefined ? s.turnover.toFixed(2) : '—'}|${p(oos.totalReturn)}|${p(ytd.totalReturn)}|`;
  const rows = modes.map(m => rowLine(labels[m], result[m].summary, result[m].outOfSample, result[m].ytd)).join('\n');
  const benchRow = rowLine('KOSPI/KOSDAQ 50:50', { ...L.stats(benchEq), tradeCount: '—', turnover: undefined }, L.stats(benchEq.filter(x => x.date >= L.OOS_START)), L.stats(benchEq.filter(x => x.date >= '2026-01-01')));

  const md = `# KOSPI·KOSDAQ Piotroski F-score 백테스트

- 기간: ${L.START}~${L.CUTOFF} (out-of-sample 컷 ${L.OOS_START} 이후)
- 유니버스: 현재 시가총액 상위 300개 중 보통주 ${top.length}개, 가격 데이터 사용 가능 ${states.size}개
- 보유: 상위 ${L.MAX_HOLDINGS}개 동일비중, 미투자금 현금
- 체결: 월말 조정 종가 신호, 다음 거래일 시가 / 비용: 편도 25bp

> 과거 시뮬레이션이며 매매 추천이 아니다. Piotroski F-score는 기존 대체지표 비교에서 명시적으로 제외됐던 9점 재무건전성 스크린이다.

|전략|누적수익률|CAGR|변동성|Sharpe|MDD|Calmar|거래 수|회전율|OOS 누적|2026 YTD|
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
${rows}
${benchRow}

## F-score 9개 신호 (TTM, 1년 전 TTM 대비)

- 수익성: ROA>0, CFO>0, ΔROA>0, 발생액(CFO>순이익)
- 레버리지·유동성: Δ레버리지<0(총부채/자산 프록시), Δ유동비율>0, 주식수 미증가(≤+2%)
- 효율성: Δ매출총이익률>0, Δ자산회전율>0

## 데이터 품질과 한계

- DART 패널 ${ps.total}건 중 정상 ${ps.ok}건, OFS fallback ${ps.ofs}건, 미제공 ${ps.noData}건.
- 레버리지는 장기차입금 대신 총부채/자산, 주식수는 순이익/EPS 역산 근사치다. 9개 중 7개 이상 산출되는 종목만 포함한다.
- 현재 구성종목을 과거에 적용한 생존자 편향이 남아 있다. 거래정지·상장폐지·호가·시장충격·세금·배당은 반영하지 않는다.
`;
  L.fs.writeFileSync(path.join(L.OUT, `${OUT_STEM}.md`), md);
  console.log(JSON.stringify(Object.fromEntries(modes.map(m => [m, result[m].summary])), null, 2));
}

try { main(); } catch (e) { console.error(e.stack || e); process.exit(1); }
