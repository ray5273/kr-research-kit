#!/usr/bin/env node
'use strict';

// Survivorship-bias quantification (C1). We cannot ADD back truly delisted
// names (the price cache lacks them), so this sets a LOWER BOUND instead: rerun
// each strategy with the ex-post best-performing top-k% of the current universe
// removed. The CAGR gap between the full run and the winner-removed run is the
// minimum premium the survivor-only universe hands the strategy for free.
//
// This is a bound, not a fix. A true fix needs a point-in-time membership +
// delisted-price dataset (flagged as separate scope).
//
// Usage: node quantify-survivorship.js [--limit N]

const L = require('./lib/factor-backtest-core.js');
const { lowVolOrders, valueEpOrders } = require('./backtest-kr-combined-sleeves.js');
const path = L.path;

const OUT_FILE = path.join(L.OUT, 'survivorship-bias-quantification.md');
const DROPS = [0.05, 0.10, 0.15];

function cagrOf(states, calendar, orders) { return L.stats(L.runBacktest(states, calendar, orders).equity).cagr; }

function main() {
  const limit = (() => { const i = process.argv.indexOf('--limit'); return i >= 0 ? Number(process.argv[i + 1]) : 0; })();
  const { states } = L.loadPriceStates(limit);
  const { calendar } = L.loadCalendar();
  const { series } = L.loadSeriesByTicker();

  const strategies = {
    '모멘텀 + EPS·매출': L.momentumEpsOrders,
    '저변동성 120': lowVolOrders,
    '밸류 E/P': valueEpOrders,
  };

  const table = {};
  for (const [name, build] of Object.entries(strategies)) {
    const full = cagrOf(states, calendar, build(states, series, calendar));
    const reduced = {};
    for (const d of DROPS) {
      const wr = L.winnerRemovalOrders(states, series, calendar, build, d);
      reduced[d] = cagrOf(wr.states, calendar, wr.orders);
    }
    table[name] = { full, reduced };
  }

  const p = x => `${(x * 100).toFixed(2)}%`;
  const header = `|전략|전체 유니버스 CAGR|상위 5% 승자 제거|상위 10% 제거|상위 15% 제거|추정 생존자 프리미엄(≥)|`;
  const rows = Object.entries(table).map(([name, t]) => {
    const band = t.full - t.reduced[0.10]; // 10% removal as the headline bound
    return `|${name}|${p(t.full)}|${p(t.reduced[0.05])}|${p(t.reduced[0.10])}|${p(t.reduced[0.15])}|${p(band)}p|`;
  }).join('\n');

  const md = `# KOSPI·KOSDAQ 생존자 편향 크기 정량화 (하한 추정)

기준일: 2026-07-13 · 기간: ${L.START}~${L.CUTOFF} · 유니버스: 현재 top-300 보통주 ${states.size}개

> 모든 백테스트는 **현재** 시총 상위 유니버스를 과거에 소급 적용하므로, 과거에 상장폐지·급락한 종목이 빠진 **생존자 편향**이 남는다. 상폐 종목 가격 데이터가 없어 편향을 완전히 제거할 수는 없다. 대신 여기서는 **하한**을 잡는다: 사후(ex-post) 전체기간 최고성과 상위 k%를 유니버스에서 빼고 재백테스트해, 전체 대비 CAGR 낙폭으로 "승자만 남은 유니버스"가 공짜로 얹어주는 프리미엄의 최소 크기를 추정한다.

## 승자 제거 민감도

${header}
|---|---:|---:|---:|---:|---:|
${rows}

- "생존자 프리미엄(≥)"은 전체 CAGR − (상위 10% 승자 제거 CAGR). 실제 편향은 이보다 **크다**(진짜 상폐 종목은 추가로 음의 수익을 실현했을 것이므로).
- 제거 대상은 전체기간 총수익 상위 종목이므로, 이 실험 자체가 look-ahead를 의도적으로 사용한 **경계 측정용**이다(실전 규칙이 아니다).

## 해석

- 승자 상위 10%만 빼도 CAGR가 위 표만큼 빠진다. 즉 보고된 CAGR의 상당 부분이 "이 유니버스가 이미 이긴 종목들"이라는 사실에서 온다.
- 특히 대형·안정 생존주에 쏠리는 **저변동성·밸류**는 생존자 편향과 상호작용이 커, 절대 CAGR을 액면가로 받아들이면 안 된다.
- 공정 비교는 각 리포트의 **동일가중 유니버스(총수익) 벤치마크**와의 상대값으로 보는 것이 안전하다. 그 벤치마크 역시 같은 생존자 편향을 공유하므로 편향이 상당 부분 상쇄된다.

## 완전 제거를 위한 별도 스코프

- KRX 상장폐지 종목 리스트 + 상폐 시점 가격 시계열 확보 → point-in-time 멤버십 유니버스 재구성.
- 현재 Yahoo 캐시에는 상폐 KRX 종목이 없어 이번 범위 밖이다.

## 한계

- 이 측정은 하한이며, 상폐 종목의 실현 손실을 반영하지 못한다.
- 매수 25bp + 매도 25bp + 증권거래세 0.18% 비용 하의 CAGR이다. 과거 시뮬레이션이며 매매 추천이 아니다.
`;
  L.fs.writeFileSync(OUT_FILE, md);
  console.log(JSON.stringify(Object.fromEntries(Object.entries(table).map(([k, t]) => [k, { full: t.full, drop10: t.reduced[0.10], premium: t.full - t.reduced[0.10] }])), null, 2));
}

try { main(); } catch (e) { console.error(e.stack || e); process.exit(1); }
