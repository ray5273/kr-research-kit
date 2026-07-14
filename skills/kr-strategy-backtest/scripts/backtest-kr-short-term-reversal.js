#!/usr/bin/env node
'use strict';

// Short-term (1-month) reversal backtest (Jegadeesh 1990; De Bondt-Thaler).
// Every prior study is long-momentum; reversal is its cross-sectional opposite
// (buy last month's biggest losers) and is negatively correlated with momentum,
// so it is the natural diversifier to test. High turnover is expected and is
// stress-tested honestly under the same 25bp cost.
//
// Variants (fixed 10y frame, top 10 EW, month-end -> next-open, 25bp):
//   revPure      — most-negative trailing 21-session return
//   revQuality   — reversal restricted to the lower-volatility half (drop the
//                  most volatile 50% each month to avoid blow-up/junk losers)
//   revEps       — reversal 50% x EPS/revenue improvement 50% (losers that are
//                  fundamentally improving)
//
// Usage: node backtest-kr-short-term-reversal.js [--limit N]

const L = require('./lib/factor-backtest-core.js');
const path = L.path;

const OUT_STEM = 'short-term-reversal-backtest-through-2026-07-10';
const REV_WINDOW = 21; // ~1 trading month
const VOL_WINDOW = 120;

function median(xs) { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }

function main() {
  const limit = (() => { const i = process.argv.indexOf('--limit'); return i >= 0 ? Number(process.argv[i + 1]) : 0; })();
  const { top, states } = L.loadPriceStates(limit);
  const { base, calendar } = L.loadCalendar();
  const { series, manifestHash } = L.loadSeriesByTicker();
  const monthEnds = L.monthEnds(calendar);

  const modes = ['revPure', 'revQuality', 'revEps'];
  const result = {};

  for (const mode of modes) {
    const orders = new Map(), monthly = [], warnings = { noPrice: 0, noFundamental: 0 };
    for (const signalDate of monthEnds) {
      const rows = [];
      for (const [ticker, state] of states) {
        const i = L.lastIndex(state.bars, signalDate);
        if (i < 252 || state.bars[i].date !== signalDate) { warnings.noPrice++; continue; }
        const ret21 = L.trailingReturn(state.bars, i, REV_WINDOW);
        const vol = L.realizedVol(state.bars, i, VOL_WINDOW);
        if (ret21 === null || vol === null) { warnings.noPrice++; continue; }
        const fundamental = mode === 'revEps' ? L.fundamentalAt(series.get(ticker) || [], signalDate) : null;
        if (mode === 'revEps' && !fundamental) { warnings.noFundamental++; continue; }
        rows.push({ ticker, name: state.name, market: state.market, ret21, vol, fundamental });
      }
      if (!rows.length) continue;

      let pool = rows;
      if (mode === 'revQuality') { const medVol = median(rows.map(r => r.vol)); pool = rows.filter(r => r.vol <= medVol); }

      // Most-negative 21-day return ranks highest (descending=true => smallest value gets pct≈1).
      L.percentile(pool, 'ret21', true);
      let ranked;
      if (mode === 'revEps') {
        L.attachFundamentalComposite(pool);
        for (const r of pool) r.score = r.fundamentalScore === null ? null : 0.5 * r.ret21Pct + 0.5 * r.fundamentalScore;
        ranked = pool.filter(r => r.score !== null).sort((a, b) => b.score - a.score || a.ret21 - b.ret21);
      } else {
        for (const r of pool) r.score = r.ret21Pct;
        ranked = pool.sort((a, b) => b.score - a.score || a.ret21 - b.ret21);
      }
      const next = calendar[calendar.indexOf(signalDate) + 1];
      if (next && next <= L.CUTOFF) orders.set(next, { signalDate, tickers: ranked.slice(0, L.MAX_HOLDINGS).map(r => r.ticker) });
      monthly.push({ signalDate, executionDate: next || null, candidates: ranked.length, holdings: ranked.slice(0, L.MAX_HOLDINGS).map(r => ({ ticker: r.ticker, name: r.name, score: r.score, ret21: r.ret21, annualizedVol: r.vol, fundamentalScore: r.fundamentalScore ?? null, reportFilingDate: r.fundamental?.report.filing || null })) });
    }
    const run = L.runBacktest(states, calendar, orders);
    const equity = run.equity, oos = equity.filter(x => x.date >= L.OOS_START), ytd = equity.filter(x => x.date >= '2026-01-01');
    result[mode] = { summary: { ...L.stats(equity), tradeCount: run.trades.length, turnover: run.turnover }, outOfSample: L.stats(oos), ytd: L.stats(ytd), annualReturns: L.annual(equity), dailyEquity: equity, trades: run.trades, monthlySelections: monthly, warnings };
  }

  const benchEq = base.benchmark.dailyEquity.filter(x => x.date >= L.START && x.date <= L.CUTOFF);
  const ps = L.panelStatus();
  const aug = L.reportAugmentation(states, calendar, series, { revEps: result.revEps.dailyEquity, revPure: result.revPure.dailyEquity });
  const ewTR = aug.ewTotalReturnBenchmark, taxedBase = aug.taxedMomentumBaseline;
  const artifact = {
    generatedAt: new Date().toISOString(),
    period: { start: L.START, end: L.CUTOFF, outOfSampleStart: L.OOS_START },
    universe: { source: L.TOP_FILE, top300Count: 300, eligibleCount: top.length, priceUsableCount: states.size, maxHoldings: L.MAX_HOLDINGS },
    commonRules: { cost: aug.costModel, signal: 'month-end adjusted close', execution: 'next trading-day open', reversalWindow: REV_WINDOW, volWindow: VOL_WINDOW, cashResidual: true },
    data: { priceCache: L.DATA, dartPanel: L.PANEL, panelStatus: ps, hashes: { priceManifestSha256: L.priceManifestHash(states), dartPanelManifestSha256: manifestHash } },
    strategies: result,
    augmentation: aug,
    benchmarkPriceIndex: { summary: L.stats(benchEq), dailyEquity: benchEq },
    benchmarkTotalReturn: { summary: ewTR.summary, constituents: ewTR.constituents, dailyEquity: ewTR.dailyEquity },
    taxedMomentumBaseline: { summary: taxedBase.summary },
    warnings: [...L.DISCLAIMER, `반전 신호는 최근 ${REV_WINDOW}거래일 수익률이며, 값이 낮을수록(최대 하락) 상위. 회전율이 매우 높아 매도세·시장충격의 영향이 결정적이다.`],
  };
  L.write(path.join(L.OUT, `${OUT_STEM}.json`), artifact);

  const p = L.pctText;
  const labels = { revPure: '단기 반전 (순수 1개월)', revQuality: '단기 반전 × 저변동성 필터', revEps: '단기 반전 × EPS·매출' };
  const rowLine = (label, s, oos, ytd) => `|${label}|${p(s.totalReturn)}|${p(s.cagr)}|${p(s.annualizedVolatility)}|${s.sharpeZeroRf.toFixed(2)}|${p(s.maxDrawdown)}|${s.calmar.toFixed(2)}|${s.tradeCount ?? '—'}|${s.turnover !== undefined ? s.turnover.toFixed(2) : '—'}|${p(oos.totalReturn)}|${p(ytd.totalReturn)}|`;
  const rows = modes.map(m => rowLine(labels[m], result[m].summary, result[m].outOfSample, result[m].ytd)).join('\n');
  const benchRow = rowLine('벤치마크: KOSPI/KOSDAQ 50:50 (가격지수)', { ...L.stats(benchEq), tradeCount: '—', turnover: undefined }, L.stats(benchEq.filter(x => x.date >= L.OOS_START)), L.stats(benchEq.filter(x => x.date >= '2026-01-01')));
  const ewRow = rowLine('벤치마크: 동일가중 유니버스 (총수익)', { ...ewTR.summary, tradeCount: '—', turnover: undefined }, L.stats(ewTR.dailyEquity.filter(x => x.date >= L.OOS_START)), L.stats(ewTR.dailyEquity.filter(x => x.date >= '2026-01-01')));
  const baseS = taxedBase.summary;
  const baselineRow = `|참고: 252일 모멘텀 + EPS·매출 (동일 과세)|${p(baseS.totalReturn)}|${p(baseS.cagr)}|${p(baseS.annualizedVolatility)}|${baseS.sharpeZeroRf.toFixed(2)}|${p(baseS.maxDrawdown)}|${baseS.calmar.toFixed(2)}|${baseS.tradeCount}|${baseS.turnover.toFixed(2)}|—|—|`;

  const md = `# KOSPI·KOSDAQ 단기 반전(1개월) 백테스트

- 기간: ${L.START}~${L.CUTOFF} (out-of-sample 컷 ${L.OOS_START} 이후)
- 유니버스: 현재 시가총액 상위 300개 중 보통주 ${top.length}개, 가격 데이터 사용 가능 ${states.size}개
- 보유: 상위 ${L.MAX_HOLDINGS}개 동일비중, 미투자금 현금
- 체결: 월말 조정 종가 신호, 다음 거래일 시가 / 비용: **매수 25bp / 매도 25bp + 증권거래세 0.18%**

> 과거 시뮬레이션이며 매매 추천이 아니다. 단기 반전은 모든 기존 스터디(롱 모멘텀)의 반대 축으로, 모멘텀과 음의 상관을 갖는 검증된 이상현상(Jegadeesh 1990, De Bondt-Thaler)이다. **회전율이 극도로 높아 매도 거래세를 반영하면 성과가 크게 희석되며, 실제 호가·시장충격까지 넣으면 더 낮아진다.**

|전략|누적수익률|CAGR|변동성|Sharpe|MDD|Calmar|거래 수|회전율|OOS 누적|2026 YTD|
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
${rows}
${baselineRow}
${ewRow}
${benchRow}

${L.statsFootnote(aug, 'revEps', '단기 반전 × EPS·매출')}
## 산식

- 반전 점수: 최근 ${REV_WINDOW}거래일 조정 종가 수익률. 값이 낮을수록(최대 하락) 유니버스 백분위 상위.
- 저변동성 필터 변형: 매월 ${VOL_WINDOW}일 실현변동성 중앙값 이하 종목만 후보로 남긴 뒤 반전 적용(변동성 큰 급락주 배제).
- EPS·매출 결합: 반전 백분위 50% + EPS·매출 개선 백분위 50%.

## 데이터 품질과 한계

- DART 패널 ${ps.total}건 중 정상 ${ps.ok}건, OFS fallback ${ps.ofs}건, 미제공 ${ps.noData}건.
- 매수 25bp + 매도 25bp에 한국 증권거래세 0.18%를 반영. 그럼에도 반전은 회전율이 극도로 높아 실제 호가·시장충격·거래정지 슬리피지가 추가로 크게 작용해 성과가 더 낮아질 수 있다.
- 현재 구성종목을 과거에 적용한 생존자 편향이 남아 있다(크기 추정은 survivorship-bias-quantification.md 참조).
`;
  L.fs.writeFileSync(path.join(L.OUT, `${OUT_STEM}.md`), md);
  console.log(JSON.stringify(Object.fromEntries(modes.map(m => [m, result[m].summary])), null, 2));
}

try { main(); } catch (e) { console.error(e.stack || e); process.exit(1); }
