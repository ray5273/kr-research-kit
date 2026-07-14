#!/usr/bin/env node
'use strict';

// Add MDD-control overlays to the previously high-performing momentum-family
// strategies and re-test under the corrected engine (sell tax + total-return
// benchmark). Overlays modulate exposure to a strategy's daily returns, decided
// at the prior close (no look-ahead), with a transaction cost charged on every
// exposure change so regime whipsaw is paid for honestly.
//
// Overlays (matching the repo's proven set):
//   raw    — no overlay (baseline)
//   regime — market 200-day MA filter, +/-3% hysteresis band, cash when below
//   vol    — target 18% annualized portfolio vol via trailing 60-day realized vol (no leverage)
//   both   — regime AND vol target (the repo's "E" variant)
//
// Usage: node retest-momentum-family-mdd.js [--limit N]

const L = require('./lib/factor-backtest-core.js');
const { comboOrders, SIGNALS } = require('./retest-momentum-family.js');
const path = L.path;
const OUT_STEM = 'momentum-family-mdd-overlay-through-2026-07-10';

const OVERLAYS = {
  raw: {},
  regime: { regime: true, maWindow: 200, band: 0.03 },
  vol: { volTarget: 0.18, volWindow: 60 },
  both: { regime: true, maWindow: 200, band: 0.03, volTarget: 0.18, volWindow: 60 },
};

function main() {
  const limit = (() => { const i = process.argv.indexOf('--limit'); return i >= 0 ? Number(process.argv[i + 1]) : 0; })();
  const { states } = L.loadPriceStates(limit);
  const { base, calendar } = L.loadCalendar();
  const { series, manifestHash } = L.loadSeriesByTicker();

  // Market proxy for the regime filter: the 50:50 price-index benchmark level.
  const marketLevels = base.benchmark.dailyEquity.filter(x => x.date >= L.START && x.date <= L.CUTOFF).map(x => ({ date: x.date, level: x.equity }));
  const benchEq = base.benchmark.dailyEquity.filter(x => x.date >= L.START && x.date <= L.CUTOFF);
  const ewTR = L.equalWeightUniverseBenchmark(states, calendar);

  // Strategies to protect (the two strongest from the corrected retest).
  const strategies = {
    '252일 모멘텀 + EPS·매출': comboOrders(states, series, calendar, SIGNALS.mom252, true),
    '변동성조정 모멘텀 + EPS·매출': comboOrders(states, series, calendar, SIGNALS.volAdj, true),
  };

  const result = {};
  for (const [name, orders] of Object.entries(strategies)) {
    const baseRun = L.runBacktest(states, calendar, orders);
    result[name] = {};
    for (const [ov, opts] of Object.entries(OVERLAYS)) {
      const eq = ov === 'raw' ? baseRun.equity : L.applyMddOverlay(baseRun.equity, marketLevels, opts);
      const s = L.stats(eq);
      result[name][ov] = { summary: s, exposureTurnover: eq.exposureTurnover ?? 0, dailyEquity: eq };
    }
  }

  const artifact = {
    generatedAt: new Date().toISOString(),
    period: { start: L.START, end: L.CUTOFF }, universe: { priceUsableCount: states.size, maxHoldings: L.MAX_HOLDINGS },
    commonRules: { cost: { buyBps: L.COST * 1e4, sellBps: (L.COST + L.SELL_TAX) * 1e4 }, regime: { maWindow: 200, band: 0.03, marketProxy: 'KOSPI/KOSDAQ 50:50 price index' }, volTarget: { target: 0.18, window: 60, maxLeverage: 1 } },
    data: { priceCache: L.DATA, hashes: { priceManifestSha256: L.priceManifestHash(states), dartPanelManifestSha256: manifestHash } },
    strategies: Object.fromEntries(Object.entries(result).map(([k, ov]) => [k, Object.fromEntries(Object.entries(ov).map(([o, v]) => [o, { summary: v.summary, exposureTurnover: v.exposureTurnover }]))])),
    benchmarkTotalReturn: { summary: ewTR.summary }, benchmarkPriceIndex: { summary: L.stats(benchEq) },
    warnings: [...L.DISCLAIMER, '오버레이 노출은 전일 종가 기준 결정(룩어헤드 없음). 노출 변경마다 매도/매수 비용을 부과했다.'],
  };
  L.write(path.join(L.OUT, `${OUT_STEM}.json`), artifact);

  const p = L.pctText;
  const ovLabel = { raw: '오버레이 없음', regime: '+ 레짐 필터(200일 MA)', vol: '+ 변동성 타깃(18%)', both: '+ 레짐 & 변동성(E)' };
  const line = (name, ov, v, rawS) => `|${name}|${ovLabel[ov]}|${p(v.summary.cagr)}|${v.summary.sharpeZeroRf.toFixed(2)}|${p(v.summary.maxDrawdown)}|${v.summary.calmar.toFixed(2)}|${rawS ? (v.summary.maxDrawdown - rawS.maxDrawdown >= 0 ? '+' : '') + ((v.summary.maxDrawdown - rawS.maxDrawdown) * 100).toFixed(1) + 'p' : '—'}|`;
  const blocks = Object.entries(result).map(([name, ov]) => {
    const rawS = ov.raw.summary;
    return ['raw', 'regime', 'vol', 'both'].map(o => line(name, o, ov[o], o === 'raw' ? null : rawS)).join('\n');
  }).join('\n');
  const bench = (nm, s) => `|${nm}|—|${p(s.cagr)}|${s.sharpeZeroRf.toFixed(2)}|${p(s.maxDrawdown)}|${s.calmar.toFixed(2)}|—|`;

  const md = `# 고성과 모멘텀 계열 + MDD 방어 오버레이 재테스트

기준일: 2026-07-14 · 기간: ${L.START}~${L.CUTOFF} · 유니버스: top-300 보통주 ${states.size}개 · 상위 ${L.MAX_HOLDINGS} 동일비중

> 보정된 엔진(매도 증권거래세 0.18% 포함)에서, 낙폭이 깊던 고성과 모멘텀 전략에 방어 오버레이를 얹었다. 오버레이 노출은 **전일 종가 기준으로 결정**(룩어헤드 없음)하고, 노출을 바꿀 때마다 매도/매수 비용을 부과한다. 레짐 시장 프록시는 KOSPI/KOSDAQ 50:50 가격지수.

|전략|오버레이|CAGR|Sharpe|MDD|Calmar|MDD 개선|
|---|---|---:|---:|---:|---:|---:|
${blocks}
${bench('벤치마크: 동일가중 유니버스(총수익)', ewTR.summary)}
${bench('벤치마크: KOSPI/KOSDAQ 50:50(가격지수)', L.stats(benchEq))}

## 읽는 법

- **MDD 개선:** 오버레이 MDD − 원본(raw) MDD. 음수(−)면 낙폭이 얕아진 것(방어 성공).
- **레짐 필터:** 시장이 200일 이동평균 아래로 3% 밴드를 벗어나면 주식 노출을 0(현금)으로, 위로 벗어나면 다시 1로. 밴드 안에서는 직전 상태 유지(휘프소 억제).
- **변동성 타깃:** 전략의 최근 60일 실현변동성이 18%를 넘으면 노출을 비례 축소(레버리지 없음, 상한 1).

## 한계

- 노출 변경 비용은 반영했으나 슬리피지·시장충격·거래정지는 미반영. 레짐 프록시는 지수 레벨이라 개별 종목 리스크는 못 잡는다.
- 현재 top-300 구성종목을 과거에 소급한 생존자 편향 공통(하한만 정량화). 과거 시뮬레이션이며 매매 추천이 아니다.
`;
  L.fs.writeFileSync(path.join(L.OUT, `${OUT_STEM}.md`), md);
  const summary = {};
  for (const [name, ov] of Object.entries(result)) summary[name] = Object.fromEntries(Object.entries(ov).map(([o, v]) => [o, { cagr: v.summary.cagr, sharpe: v.summary.sharpeZeroRf, mdd: v.summary.maxDrawdown, calmar: v.summary.calmar }]));
  console.log(JSON.stringify(summary, null, 2));
}

try { main(); } catch (e) { console.error(e.stack || e); process.exit(1); }
