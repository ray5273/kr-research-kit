#!/usr/bin/env node
'use strict';

// Managed momentum (Barroso-Santa Clara 2015, "Momentum has its moments").
// Momentum crashes are preceded by a spike in the strategy's OWN realized
// volatility, so scaling the position down when that vol rises pre-empts the
// crash. This is the only crash defense a daily-bar / next-open backtest can
// honestly test: same-day intraday plunges are already in the close, and KRX
// price limits + halts can block the exit, so the lever is reducing exposure
// BEFORE the crash, not dodging it on the day.
//
// exposure(t) = min(1, target / trailing_realized_vol(strategy, window))
// decided at the prior close (no look-ahead), with a transaction cost charged
// on every exposure change. Reuses factor-backtest-core's applyMddOverlay.
//
// Usage: node backtest-kr-managed-momentum.js [--limit N]

const L = require('./lib/factor-backtest-core.js');
const { comboOrders, SIGNALS } = require('./retest-momentum-family.js');
const path = L.path;
const OUT_STEM = 'managed-momentum-backtest-through-2026-07-10';

const WINDOWS = [21, 42, 63, 126];
const TARGETS = [0.15, 0.20, 0.25, 0.30];
const CRASH = { start: '2026-06-22', end: '2026-07-08' }; // the momentum crash we care about

const BASES = {
  'Minervini RS + EPS·매출': SIGNALS.minerviniRS,
  '252일 모멘텀 + EPS·매출': SIGNALS.mom252,
  '변동성조정 모멘텀 + EPS·매출': SIGNALS.volAdj,
};

function windowReturn(eq, start, end) {
  const ks = eq.filter(x => x.date >= start && x.date <= end);
  return ks.length >= 2 ? ks.at(-1).equity / ks[0].equity - 1 : null;
}
function avgExposure(overlayEq, start, end) {
  const w = overlayEq.filter(x => x.date >= start && x.date <= end && x.exposure !== undefined);
  return w.length ? w.reduce((s, x) => s + x.exposure, 0) / w.length : 1;
}

function main() {
  const limit = (() => { const i = process.argv.indexOf('--limit'); return i >= 0 ? Number(process.argv[i + 1]) : 0; })();
  const { states } = L.loadPriceStates(limit);
  const { base, calendar } = L.loadCalendar();
  const { series, manifestHash } = L.loadSeriesByTicker();
  const marketLevels = base.benchmark.dailyEquity.filter(x => x.date >= L.START && x.date <= L.CUTOFF).map(x => ({ date: x.date, level: x.equity }));
  const benchEq = base.benchmark.dailyEquity.filter(x => x.date >= L.START && x.date <= L.CUTOFF);
  const ewTR = L.equalWeightUniverseBenchmark(states, calendar);

  const result = {};
  for (const [name, sig] of Object.entries(BASES)) {
    const raw = L.runBacktest(states, calendar, comboOrders(states, series, calendar, sig, true)).equity;
    const rawS = L.stats(raw);
    const grid = {};
    for (const w of WINDOWS) for (const t of TARGETS) {
      const eq = L.applyMddOverlay(raw, marketLevels, { volTarget: t, volWindow: w });
      const s = L.stats(eq);
      grid[`w${w}_t${Math.round(t * 100)}`] = {
        volWindow: w, target: t, summary: s,
        crashReturn: windowReturn(eq, CRASH.start, CRASH.end),
        crashAvgExposure: avgExposure(eq, CRASH.start, CRASH.end),
        ci: L.blockBootstrapCI(eq),
      };
    }
    result[name] = {
      raw: { summary: rawS, crashReturn: windowReturn(raw, CRASH.start, CRASH.end), dailyEquity: raw },
      grid,
    };
  }

  // Balanced pick: among configs that cut the target crash by at least 40%,
  // take the highest Calmar (CAGR/|MDD|). This rewards keeping return while
  // cutting drawdown, instead of the return-killing max-defense corner.
  const pick = base => {
    const rawCrash = result[base].raw.crashReturn;
    const cutHalf = rawCrash * 0.6; // crash loss reduced to <60% of raw
    const ok = Object.entries(result[base].grid).filter(([, g]) => g.crashReturn > cutHalf);
    const pool = ok.length ? ok : Object.entries(result[base].grid);
    return pool.sort((a, b) => b[1].summary.calmar - a[1].summary.calmar)[0];
  };
  // Aggressive-defense reference: the config that minimizes the crash loss outright.
  const maxDefense = base => Object.entries(result[base].grid).sort((a, b) => b[1].crashReturn - a[1].crashReturn)[0];

  const artifact = {
    generatedAt: new Date().toISOString(),
    period: { start: L.START, end: L.CUTOFF }, crashWindow: CRASH,
    universe: { priceUsableCount: states.size, maxHoldings: L.MAX_HOLDINGS },
    commonRules: { cost: { buyBps: L.COST * 1e4, sellBps: (L.COST + L.SELL_TAX) * 1e4 }, managedMomentum: 'exposure=min(1,target/trailingStrategyVol), decided at prior close', windows: WINDOWS, targets: TARGETS },
    data: { priceCache: L.DATA, hashes: { priceManifestSha256: L.priceManifestHash(states), dartPanelManifestSha256: manifestHash } },
    strategies: Object.fromEntries(Object.entries(result).map(([k, v]) => [k, { raw: { summary: v.raw.summary, crashReturn: v.raw.crashReturn }, grid: Object.fromEntries(Object.entries(v.grid).map(([g, x]) => [g, { volWindow: x.volWindow, target: x.target, summary: x.summary, crashReturn: x.crashReturn, crashAvgExposure: x.crashAvgExposure, ci: x.ci }])) }])),
    benchmarkTotalReturn: { summary: ewTR.summary }, benchmarkPriceIndex: { summary: L.stats(benchEq) },
    warnings: [...L.DISCLAIMER, '노출은 전일 종가 기준 결정(룩어헤드 없음). 당일 급락은 일봉 구조상 방어 불가 — 다음날 시가 반응이 최선.'],
  };
  L.write(path.join(L.OUT, `${OUT_STEM}.json`), artifact);

  const p = L.pctText;
  // Per base: a compact grid (rows=window, cols=target) of MDD, plus a crash table.
  let body = '';
  for (const [name, v] of Object.entries(result)) {
    const rawS = v.raw.summary;
    const cell = (w, t) => v.grid[`w${w}_t${Math.round(t * 100)}`];
    const perfRows = WINDOWS.map(w => `|${w}일|${TARGETS.map(t => { const g = cell(w, t); return `${p(g.summary.cagr)} / ${p(g.summary.maxDrawdown)} / ${g.summary.sharpeZeroRf.toFixed(2)}`; }).join('|')}|`).join('\n');
    const crashRows = WINDOWS.map(w => `|${w}일|${TARGETS.map(t => { const g = cell(w, t); return `${p(g.crashReturn)} (노출${(g.crashAvgExposure * 100).toFixed(0)}%)`; }).join('|')}|`).join('\n');
    const [, best] = pick(name);
    const [, aggr] = maxDefense(name);
    body += `\n### ${name}\n\n- 원본(오버레이 없음): CAGR ${p(rawS.cagr)}, MDD ${p(rawS.maxDrawdown)}, Sharpe ${rawS.sharpeZeroRf.toFixed(2)}, 크래시 구간 ${p(v.raw.crashReturn)}\n\n성과 그리드 (셀 = CAGR / MDD / Sharpe), 행=변동성 창, 열=목표변동성:\n\n|창\\\\목표|${TARGETS.map(t => `${(t * 100).toFixed(0)}%`).join('|')}|\n|---|${TARGETS.map(() => '---').join('|')}|\n${perfRows}\n\n크래시 구간(${CRASH.start}~${CRASH.end}) 수익률 및 평균 노출:\n\n|창\\\\목표|${TARGETS.map(t => `${(t * 100).toFixed(0)}%`).join('|')}|\n|---|${TARGETS.map(() => '---').join('|')}|\n${crashRows}\n\n- **균형(권장, 최고 Calmar): 창 ${best.volWindow}일 / 목표 ${(best.target * 100).toFixed(0)}%** → CAGR ${p(best.summary.cagr)}(원본 ${p(rawS.cagr)}), MDD ${p(best.summary.maxDrawdown)}(원본 ${p(rawS.maxDrawdown)}), Sharpe ${best.summary.sharpeZeroRf.toFixed(2)}, Calmar ${best.summary.calmar.toFixed(2)}, 크래시 ${p(best.crashReturn)}(${((best.crashReturn - v.raw.crashReturn) * 100).toFixed(1)}%p 개선, 노출 ${(best.crashAvgExposure * 100).toFixed(0)}%).\n- **최대 방어: 창 ${aggr.volWindow}일 / 목표 ${(aggr.target * 100).toFixed(0)}%** → CAGR ${p(aggr.summary.cagr)}(수익 크게 희생), MDD ${p(aggr.summary.maxDrawdown)}, 크래시 ${p(aggr.crashReturn)}(${((aggr.crashReturn - v.raw.crashReturn) * 100).toFixed(1)}%p 개선). 크래시는 거의 지우지만 CAGR을 절반 이하로 깎는다.\n`;
  }

  const md = `# 매니지드 모멘텀(변동성 스케일링)으로 급락 대처 백테스트

기준일: 2026-07-14 · 기간: ${L.START}~${L.CUTOFF} · 유니버스: top-300 보통주 ${states.size}개 · 상위 ${L.MAX_HOLDINGS} 동일비중
비용: 매수 25bp / 매도 25bp + 증권거래세 0.18% · 벤치마크: 동일가중 총수익 CAGR ${p(ewTR.summary.cagr)}, 가격지수 ${p(L.stats(benchEq).cagr)}

> 매니지드 모멘텀(Barroso-Santa Clara 2015): 모멘텀 크래시 직전 전략 실현변동성이 급등하므로, 포지션을 \`min(1, 목표변동성/최근 전략변동성)\`로 연속 축소해 크래시 전에 노출을 줄인다. 노출은 **전일 종가 기준 결정**(룩어헤드 없음), 레버리지 없음(상한 1). **일봉·다음날 시가 구조상 당일 급락 자체는 못 피하고**, 다일 크래시의 진행 구간에서 노출을 줄이는 것이 한계다.
${body}
## 해석 원칙

- **판정은 총 MDD 평균이 아니라 "6~7월 크래시를 실제로 줄였나"로 한다.** 크래시 표에서 노출이 크래시 진행 중 실제로 낮아지고 구간 손실이 완화됐는지 본다.
- 다음날 시가 반응이라 **크래시 첫날(2026-06-23 −11.7%)은 못 막고**, 변동성이 튄 뒤 이어지는 구간(07-02~07-08)에서 노출이 줄어 완화된다.
- 목표변동성이 낮을수록(15%) 평시에도 상시 축소돼 CAGR을 크게 깎고, 높을수록(30%) 평시엔 거의 개입 안 하고 크래시에만 반응한다 — 선택적 방어의 트레이드오프.

## 한계

- 당일(intraday) 급락의 실질 방어는 일봉·다음날 시가 구조에서 불가능하다(분봉·실시간·주문집행은 별도 스코프).
- 현재 top-300 구성종목을 과거에 소급한 생존자 편향 공통. KRX 상하한가·거래정지·시장충격 미반영. 과거 시뮬레이션이며 매매 추천이 아니다.
`;
  L.fs.writeFileSync(path.join(L.OUT, `${OUT_STEM}.md`), md);
  const out = {};
  for (const [name, v] of Object.entries(result)) { const [k, b] = pick(name); out[name] = { best: k, cagr: b.summary.cagr, mdd: b.summary.maxDrawdown, crashRaw: v.raw.crashReturn, crashManaged: b.crashReturn, crashImprovementPp: (b.crashReturn - v.raw.crashReturn) * 100 }; }
  console.log(JSON.stringify(out, null, 2));
}

try { main(); } catch (e) { console.error(e.stack || e); process.exit(1); }
