#!/usr/bin/env node
'use strict';

// Regenerates the consolidated alternative-factors comparison from the six
// factor JSONs + the combined-sleeves + survivorship artifacts, so the headline
// deliverable always reflects the corrected (taxed, dual-benchmark, E/P-only,
// deflated-Sharpe) numbers. Run after the individual backtests.
//
// Usage: node report-alternative-factors-comparison.js

const L = require('./lib/factor-backtest-core.js');
const path = L.path;
const OUT = L.OUT;
const rd = f => L.read(path.join(OUT, f));
const p = x => `${(x * 100).toFixed(2)}%`;

function monthly(eq) { const m = new Map(); for (const x of eq) m.set(x.date.slice(0, 7), x.equity); const ks = [...m.keys()].sort(); const r = new Map(); for (let i = 1; i < ks.length; i++) r.set(ks[i], m.get(ks[i]) / m.get(ks[i - 1]) - 1); return r; }
function corr(a, b) { const ks = [...a.keys()].filter(k => b.has(k)); const xa = ks.map(k => a.get(k)), xb = ks.map(k => b.get(k)); const ma = xa.reduce((s, x) => s + x, 0) / xa.length, mb = xb.reduce((s, x) => s + x, 0) / xb.length; let n = 0, da = 0, db = 0; for (let i = 0; i < ks.length; i++) { n += (xa[i] - ma) * (xb[i] - mb); da += (xa[i] - ma) ** 2; db += (xb[i] - mb) ** 2; } return n / Math.sqrt(da * db); }

function main() {
  const lowvol = rd('low-volatility-backtest-through-2026-07-10.json');
  const value = rd('value-momentum-backtest-through-2026-07-10.json');
  const pio = rd('piotroski-fscore-backtest-through-2026-07-10.json');
  const rev = rd('short-term-reversal-backtest-through-2026-07-10.json');
  const combined = rd('combined-sleeves-backtest-through-2026-07-10.json');

  const ewTR = lowvol.benchmarkTotalReturn.summary; // identical across reports
  const priceIdx = lowvol.benchmarkPriceIndex.summary;
  const taxedBase = lowvol.taxedMomentumBaseline.summary;
  const baseMonthly = monthly(combined.sleeves.MOM.dailyEquity);

  // Headline pick per factor + its deflated-Sharpe clears flag.
  const picks = [
    ['저변동성 120 (순수)', lowvol.strategies.volLow120.summary, lowvol.strategies.volLow120.dailyEquity, lowvol.augmentation.strategyStats.volLow120.deflated],
    ['밸류 E/P 단독', value.strategies.valueEPonly.summary, value.strategies.valueEPonly.dailyEquity, value.augmentation.strategyStats.valueEPonly.deflated],
    ['밸류 × 252일 모멘텀', value.strategies.value_mom252.summary, value.strategies.value_mom252.dailyEquity, value.augmentation.strategyStats.value_mom252.deflated],
    ['Piotroski F≥7 → 모멘텀', pio.strategies.pFilterMom.summary, pio.strategies.pFilterMom.dailyEquity, pio.augmentation.strategyStats.pFilterMom.deflated],
    ['단기 반전 × EPS·매출', rev.strategies.revEps.summary, rev.strategies.revEps.dailyEquity, rev.augmentation.strategyStats.revEps.deflated],
    ['단기 반전 (순수)', rev.strategies.revPure.summary, rev.strategies.revPure.dailyEquity, rev.augmentation.strategyStats.revPure.deflated],
  ];
  const rows = picks.map(([lbl, s, eq, d]) => {
    const c = corr(monthly(eq), baseMonthly);
    return `|${lbl}|${p(s.cagr)}|${s.sharpeZeroRf.toFixed(2)}|${p(s.maxDrawdown)}|${s.turnover.toFixed(0)}|${c.toFixed(2)}|${d.clears ? '통과' : '미달'}|`;
  }).join('\n');
  const baselineRow = `|기준선: 252일 모멘텀 + EPS·매출 (동일 과세)|${p(taxedBase.cagr)}|${taxedBase.sharpeZeroRf.toFixed(2)}|${p(taxedBase.maxDrawdown)}|${taxedBase.turnover.toFixed(0)}|1.00|—|`;
  const ewRow = `|벤치마크: 동일가중 유니버스 (총수익)|${p(ewTR.cagr)}|${ewTR.sharpeZeroRf.toFixed(2)}|${p(ewTR.maxDrawdown)}|—|—|—|`;
  const idxRow = `|벤치마크: KOSPI/KOSDAQ 50:50 (가격지수)|${p(priceIdx.cagr)}|${priceIdx.sharpeZeroRf.toFixed(2)}|${p(priceIdx.maxDrawdown)}|—|—|—|`;

  const cs = combined.combinations, ss = combined.sleeves;
  const md = `# 검증된 비(非)모멘텀 팩터 4종 비교 백테스트 (방법론 보정판)

기준일: 2026-07-13 · 기간: 2016-07-11~2026-07-10 (OOS 컷 2023-07-11)

> 과거 시뮬레이션이며 매매 추천이 아니다. 초판 대비 4가지를 보정했다: (1) **매도 증권거래세 0.18%** 반영, (2) 배당 포함 **동일가중 유니버스(총수익) 벤치마크** 병기, (3) 밸류 **E/P 단독** 분리, (4) **다중검정 허들(Deflated Sharpe)** 통과 여부와 신뢰구간. 절대 CAGR은 생존자 편향으로 상향 편의가 있으니, 공정 벤치마크와의 상대값으로 읽어야 한다.

## 한눈에 보기 (동일 과세·동일 프레임)

|전략|CAGR|Sharpe|MDD|회전율|모멘텀 상관|다중검정 허들|
|---|---:|---:|---:|---:|---:|---:|
${rows}
${baselineRow}
${ewRow}
${idxRow}

- "다중검정 허들"은 ~50개 구성 시험을 감안한 Deflated Sharpe 허들(연율 Sharpe) 통과 여부.

## 핵심 발견 (보정 후)

1. **공정 벤치마크가 판을 바꾼다.** 배당을 뺀 가격지수(CAGR ${p(priceIdx.cagr)})가 아니라 배당 포함 동일가중 유니버스(CAGR ${p(ewTR.cagr)}, Sharpe ${ewTR.sharpeZeroRf.toFixed(2)})가 공정한 바다. 이 기준으로 보면 **저변동성·Piotroski·단기반전은 초과성과가 사라진다**. 이들이 "이겼던" 것은 저평가된 가격지수 덕분이었다.
2. **밸류만 공정 벤치마크를 넘는다.** 밸류 E/P 단독(CAGR ${p(value.strategies.valueEPonly.summary.cagr)}, Sharpe ${value.strategies.valueEPonly.summary.sharpeZeroRf.toFixed(2)}, MDD ${p(value.strategies.valueEPonly.summary.maxDrawdown)})은 근사 B/P를 뺀 깨끗한 신호로, 오히려 E/P·B/P 결합보다 낫다. 밸류×모멘텀은 Sharpe ${value.strategies.value_mom252.summary.sharpeZeroRf.toFixed(2)}로 다중검정 허들도 통과한다.
3. **매도 거래세가 반전을 정리한다.** 회전율 200배대의 반전은 매도세 반영 후 순수 반전 CAGR ${p(rev.strategies.revPure.summary.cagr)}로 공정 벤치마크에 크게 못 미친다. 다중검정 허들도 미달이다.
4. **모멘텀의 우위는 상당 부분 생존자 편향이다.** 승자 상위 10% 제거 시 모멘텀 CAGR은 41.5%→30.8%(프리미엄 ≈10.7%p)로 급락하는 반면, 저변동성·밸류는 거의 불변(≈0~1.3%p). 절대 CAGR로 모멘텀을 추켜세우면 안 된다. (survivorship-bias-quantification.md)
5. **분산은 추론이 아니라 실측으로 확인됐다.** 모멘텀+저변동성 50:50은 Sharpe ${ss.MOM ? cs['MOM+LOWV'].summary.sharpeZeroRf.toFixed(2) : '—'}로 모멘텀 단독(${ss.MOM.summary.sharpeZeroRf.toFixed(2)})·저변동성 단독을 모두 넘고 **MDD가 ${p(ss.MOM.summary.maxDrawdown)}→${p(cs['MOM+LOWV'].summary.maxDrawdown)}로 개선**된다. 모멘텀+밸류E/P는 Sharpe ${cs['MOM+VALEP'].summary.sharpeZeroRf.toFixed(2)}로 수익은 늘지만 MDD 개선은 제한적. (combined-sleeves-backtest-through-2026-07-10.md)

## 함의

- **가장 견고한 단독 팩터는 밸류 E/P다.** 공정 벤치마크를 넘고, 생존자 편향에 둔감하며, 다중검정 허들을 통과한다.
- **저변동성의 값어치는 결합에서 나온다.** 단독으로는 공정 벤치마크에 못 미치지만, 모멘텀과 50:50으로 묶으면 낙폭을 확실히 줄인다(방어 sleeve).
- **Piotroski·단기반전은 이 유니버스에서 우선순위가 낮다.** 대형주 F-score는 완만하고, 반전은 비용에 취약하다.

## 한계

- 현재 top-300 구성종목을 과거에 적용한 생존자 편향이 모든 전략에 공통으로 남아 있다(하한 정량화만 수행; 완전 제거는 별도 스코프).
- 매수 25bp + 매도 25bp + 증권거래세 0.18%를 반영했으나 호가·시장충격·거래정지·유상증자는 미반영.
- 신뢰구간은 월 블록 부트스트랩, 다중검정 허들은 Deflated Sharpe 근사다. 각 개별 리포트의 산식·한계 절을 함께 확인할 것.
`;
  L.fs.writeFileSync(path.join(OUT, 'alternative-factors-comparison-through-2026-07-10.md'), md);
  console.log('wrote alternative-factors-comparison-through-2026-07-10.md (' + md.length + ' bytes)');
}

try { main(); } catch (e) { console.error(e.stack || e); process.exit(1); }
